import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { createRecoveryCoordinator } from "../../packages/agent-runtime/recovery-coordinator";
import type { SessionStorePort } from "../../packages/session-store/contracts";
import { MemorySessionStore } from "../../packages/session-store/memory-session-store";
import { canonicalRunCommandRequestHash } from "../../packages/session-store/run-command-contract";
import { SqliteSessionStore } from "../../packages/session-store/src/sqlite-session-store";
import type { ToolReceipt } from "../../packages/tool-runtime/contracts";
import { hashBytes } from "../../packages/session-store/src/integrity";
import { createTempDatabase, timestamp } from "../../packages/session-store/tests/helpers";

type CountingStore = SessionStorePort & Readonly<{
  providerCalls: number;
  hostCalls: number;
  close?: () => void;
}>;

class CountingMemoryStore extends MemorySessionStore {
  providerCalls = 0;
  hostCalls = 0;
  override async startModelStep(...args: Parameters<MemorySessionStore["startModelStep"]>) {
    this.providerCalls += 1;
    return super.startModelStep(...args);
  }
  override async beginInvocationExecution(...args: Parameters<MemorySessionStore["beginInvocationExecution"]>) {
    this.hostCalls += 1;
    return super.beginInvocationExecution(...args);
  }
}

class CountingSqliteStore extends SqliteSessionStore {
  providerCalls = 0;
  hostCalls = 0;
  override async startModelStep(...args: Parameters<SqliteSessionStore["startModelStep"]>) {
    this.providerCalls += 1;
    return super.startModelStep(...args);
  }
  override async beginInvocationExecution(...args: Parameters<SqliteSessionStore["beginInvocationExecution"]>) {
    this.hostCalls += 1;
    return super.beginInvocationExecution(...args);
  }
}

const ids = () => {
  let attempt = 1;
  let event = 1;
  return {
    nextAttemptId: () => `recovery-attempt-${attempt++}`,
    nextEventId: () => `recovery-event-${event++}`,
  };
};

const scope = {
  localPrincipalId: "principal",
  workspaceId: "workspace",
  idempotencyKey: "recovery-key",
};

const seedDispatched = async (
  store: CountingStore,
  input: Readonly<{ clock: () => string; invocation?: "none" | "executing" }>,
) => {
  const initial = "attempt-initial";
  const reserved = await store.reserveRunCommand({
    ...scope,
    canonicalRequestHash: canonicalRunCommandRequestHash({ workspaceId: scope.workspaceId, message: "recover safely" }),
    sessionId: "session", turnId: "turn", runId: "run", attemptId: initial,
    catalogHash: "catalog", intentRevision: 1, userMessage: "recover safely", reservedAt: input.clock(),
  });
  assert.equal(reserved.kind, "owner");
  const lease = await store.acquireLease({ runId: "run", attemptId: initial, ownerId: "interrupted-worker", ttlMs: 1_000, requestedAt: input.clock() });
  assert.equal(lease.kind, "acquired");
  if (lease.kind !== "acquired") throw new Error("expected initial lease");
  assert.equal((await store.transitionRunCommand({
    ...scope, runId: "run", attemptId: initial, leaseToken: lease.leaseToken,
    expectedStatus: "reserved", nextStatus: "accepted", updatedAt: input.clock(),
  })).kind, "updated");
  assert.equal((await store.startModelStep({
    runId: "run", attemptId: initial, leaseToken: lease.leaseToken,
    modelStepId: "model-step", requestFingerprint: "a".repeat(64), startedAt: input.clock(),
  })).kind, "started");
  let reservationId: string | undefined;
  if (input.invocation === "executing") {
    const reservation = await store.reserveInvocation({
      leaseToken: lease.leaseToken,
      reservedAt: input.clock(),
      invocation: {
        schemaVersion: "meliora.tool-invocation.v1", invocationId: "invocation", runId: "run", attemptId: initial,
        toolName: "read_file", toolVersion: "1", arguments: { path: "README.md" }, argumentsHash: "b".repeat(64),
        catalogHash: "catalog", idempotencyKey: "invocation-key", status: "reserved",
      },
    });
    assert.equal(reservation.kind, "owner");
    if (reservation.kind !== "owner") throw new Error("expected reservation");
    reservationId = reservation.reservationId;
    assert.equal((await store.beginInvocationExecution({
      runId: "run", attemptId: initial, leaseToken: lease.leaseToken, reservationId: reservation.reservationId,
    })).kind, "started");
  }
  return { initial, leaseToken: lease.leaseToken, reservationId };
};

const receiptFor = (attemptId: string, outputArtifactId: string | undefined): ToolReceipt => ({
  schemaVersion: "meliora.tool-receipt.v1",
  receiptId: "receipt-invocation",
  invocationId: "invocation",
  runId: "run",
  attemptId,
  toolName: "read_file",
  toolVersion: "1",
  argumentsHash: "b".repeat(64),
  catalogHash: "catalog",
  decision: "allow",
  startedAt: timestamp(),
  endedAt: timestamp(1),
  status: "succeeded",
  effectSummary: "safe recovery test receipt",
  ...(outputArtifactId === undefined ? {} : { outputArtifactId }),
  verificationArtifactIds: [],
  redactions: [],
});

const coordinator = (store: CountingStore, now: () => string, limits: Readonly<{ scanLimit?: number; maxPages?: number }> = {}) => createRecoveryCoordinator({
  store, ids: ids(), now, ownerId: "recovery-coordinator", leaseTtlMs: 1_000, scanLimit: limits.scanLimit ?? 16, maxPages: limits.maxPages ?? 1, eventLimit: 500,
});

const adapters: readonly [string, (now: () => number, t: TestContext) => CountingStore][] = [
  ["memory", (now) => new CountingMemoryStore({ clock: () => new Date(now()) })],
  ["sqlite", (now, t) => new CountingSqliteStore(createTempDatabase(t), { clock: () => new Date(now()) })],
];

for (const [name, createStore] of adapters) {
  test(`recovery coordinator ${name}: expired Model Step blocks atomically without Provider/Host replay`, async (t) => {
    let nowMs = Date.parse(timestamp());
    const now = () => new Date(nowMs).toISOString();
    const store = createStore(() => nowMs, t);
    try {
      const seeded = await seedDispatched(store, { clock: now, invocation: "none" });
      assert.equal(store.providerCalls, 1);
      assert.equal(store.hostCalls, 0);
      nowMs += 1_001;
      const result = await coordinator(store, now).recoverOnce();
      assert.deepEqual(result, { scanned: 1, sweepComplete: true, nextCursor: null, blocked: 1, retained: 0, leaseHeld: 0, conflicts: 0, indeterminate: 0 });
      assert.equal(store.providerCalls, 1, "recovery must not issue another Provider request");
      assert.equal(store.hostCalls, 0, "recovery must not execute Host");
      const command = await store.readRunCommand(scope);
      assert.equal(command?.status, "terminal");
      assert.equal(command?.status === "terminal" ? command.terminalCode : undefined, "model_step_outcome_unknown");
      const events = await store.readEvents({ runId: "run", afterSequence: 0, limit: 10 });
      assert.deepEqual(events.events.map((event) => event.kind), ["run_blocked"]);
      const bundle = await store.readRecoveryBundle({ runId: "run", eventLimit: 10 });
      assert.equal(bundle.kind, "found");
      if (bundle.kind !== "found") throw new Error("expected recovery bundle");
      assert.notEqual(bundle.bundle.activeAttempt.attemptId, seeded.initial, "only the new Attempt owns recovery writes");
      assert.equal((await store.transitionRunCommand({
        ...scope, runId: "run", attemptId: seeded.initial, leaseToken: seeded.leaseToken,
        expectedStatus: "dispatched", nextStatus: "terminal", terminalStatus: "failed", terminalCode: "old_worker", updatedAt: now(),
      })).kind, "conflict");
    } finally {
      store.close?.();
    }
  });

  test(`recovery coordinator ${name}: unreceipted executing invocation wins over Model Step and runs exactly once`, async (t) => {
    let nowMs = Date.parse(timestamp());
    const now = () => new Date(nowMs).toISOString();
    const store = createStore(() => nowMs, t);
    try {
      await seedDispatched(store, { clock: now, invocation: "executing" });
      assert.equal(store.providerCalls, 1);
      assert.equal(store.hostCalls, 1);
      nowMs += 1_001;
      const first = await coordinator(store, now).recoverOnce();
      const second = await coordinator(store, now).recoverOnce();
      assert.equal(first.blocked, 1);
      assert.deepEqual(second, { scanned: 0, sweepComplete: true, nextCursor: null, blocked: 0, retained: 0, leaseHeld: 0, conflicts: 0, indeterminate: 0 });
      assert.equal(store.providerCalls, 1);
      assert.equal(store.hostCalls, 1);
      const command = await store.readRunCommand(scope);
      assert.equal(command?.status === "terminal" ? command.terminalCode : undefined, "tool_invocation_outcome_unknown");
      const events = await store.readEvents({ runId: "run", afterSequence: 0, limit: 10 });
      assert.equal(events.events.filter((event) => event.kind === "run_blocked").length, 1);
    } finally {
      store.close?.();
    }
  });

  test(`recovery coordinator ${name}: live lease and non-dispatched command remain unchanged`, async (t) => {
    let nowMs = Date.parse(timestamp());
    const now = () => new Date(nowMs).toISOString();
    const store = createStore(() => nowMs, t);
    try {
      await seedDispatched(store, { clock: now, invocation: "none" });
      const leaseHeld = await coordinator(store, now).recoverOnce();
      assert.deepEqual(leaseHeld, { scanned: 1, sweepComplete: true, nextCursor: null, blocked: 0, retained: 0, leaseHeld: 1, conflicts: 0, indeterminate: 0 });
      assert.equal((await store.readRunCommand(scope))?.status, "dispatched");

      const fresh = createStore(() => nowMs, t);
      const reserved = await fresh.reserveRunCommand({
        ...scope,
        canonicalRequestHash: canonicalRunCommandRequestHash({ workspaceId: scope.workspaceId, message: "wait" }),
        sessionId: "session", turnId: "turn", runId: "run", attemptId: "attempt-initial",
        catalogHash: "catalog", intentRevision: 1, userMessage: "wait", reservedAt: now(),
      });
      assert.equal(reserved.kind, "owner");
      const retained = await coordinator(fresh, now).recoverOnce();
      assert.deepEqual(retained, { scanned: 1, sweepComplete: true, nextCursor: null, blocked: 0, retained: 1, leaseHeld: 0, conflicts: 0, indeterminate: 0 });
      assert.equal((await fresh.readRunCommand(scope))?.status, "reserved");
      fresh.close?.();
    } finally {
      store.close?.();
    }
  });

  test(`recovery coordinator ${name}: accepted command is reported as retained and is never dispatched`, async (t) => {
    let nowMs = Date.parse(timestamp());
    const now = () => new Date(nowMs).toISOString();
    const store = createStore(() => nowMs, t);
    try {
      assert.equal((await store.reserveRunCommand({
        ...scope,
        canonicalRequestHash: canonicalRunCommandRequestHash({ workspaceId: scope.workspaceId, message: "accepted" }),
        sessionId: "session", turnId: "turn", runId: "run", attemptId: "attempt-initial",
        catalogHash: "catalog", intentRevision: 1, userMessage: "accepted", reservedAt: now(),
      })).kind, "owner");
      const lease = await store.acquireLease({ runId: "run", attemptId: "attempt-initial", ownerId: "worker", ttlMs: 1_000, requestedAt: now() });
      assert.equal(lease.kind, "acquired");
      if (lease.kind !== "acquired") throw new Error("lease expected");
      assert.equal((await store.transitionRunCommand({
        ...scope, runId: "run", attemptId: "attempt-initial", leaseToken: lease.leaseToken,
        expectedStatus: "reserved", nextStatus: "accepted", updatedAt: now(),
      })).kind, "updated");
      nowMs += 1_001;
      assert.deepEqual(await coordinator(store, now).recoverOnce(), {
        scanned: 1, sweepComplete: true, nextCursor: null, blocked: 0, retained: 1, leaseHeld: 0, conflicts: 0, indeterminate: 0,
      });
      assert.equal((await store.readRunCommand(scope))?.status, "accepted");
      assert.equal(store.providerCalls, 0);
      assert.equal(store.hostCalls, 0);
    } finally { store.close?.(); }
  });

  for (const order of ["awaiting-first", "unknown-first"] as const) {
    test(`recovery coordinator ${name}: ${order} awaiting approval cannot mask an outcome-unknown invocation`, async (t) => {
      let nowMs = Date.parse(timestamp());
      const now = () => new Date(nowMs).toISOString();
      const store = createStore(() => nowMs, t);
      try {
        await seedDispatched(store, { clock: now, invocation: "executing" });
        nowMs += 1_001;
        const guarded = new Proxy(store, {
          get(target, property, receiver) {
            if (property === "readRecoveryBundle") return async () => {
              const original = await target.readRecoveryBundle({ runId: "run", eventLimit: 500 });
              if (original.kind !== "found") return original;
              const record = original.bundle.invocations[0]!;
              const unknown = {
                ...record,
                reservation: { ...record.reservation, status: "outcome_unknown" as const, executionStartedAt: undefined },
                invocation: { ...record.invocation, status: "outcome_unknown" as const },
              };
              const awaiting = {
                ...record,
                reservation: { ...record.reservation, status: "awaiting_approval" as const, executionStartedAt: undefined },
                invocation: { ...record.invocation, status: "awaiting_approval" as const },
              };
              return { kind: "found" as const, bundle: { ...original.bundle, invocations: order === "awaiting-first" ? [awaiting, unknown] : [unknown, awaiting] } };
            };
            return Reflect.get(target, property, receiver);
          },
        }) as CountingStore;
        assert.equal((await coordinator(guarded, now).recoverOnce()).blocked, 1);
        assert.equal((await store.readRunCommand(scope))?.status === "terminal" ? (await store.readRunCommand(scope))?.terminalCode : null, "tool_invocation_outcome_unknown");
        assert.equal(store.providerCalls, 1);
        assert.equal(store.hostCalls, 1);
      } finally { store.close?.(); }
    });
  }

  for (const binding of ["found", "missing"] as const) {
    test(`recovery coordinator ${name}: terminal Receipt with ${binding} binding gets its explicit safe block`, async (t) => {
      let nowMs = Date.parse(timestamp());
      const now = () => new Date(nowMs).toISOString();
      const store = createStore(() => nowMs, t);
      try {
        const seeded = await seedDispatched(store, { clock: now, invocation: "executing" });
        if (!seeded.reservationId) throw new Error("reservation expected");
        let outputArtifactId: string | undefined;
        if (binding === "found") {
          const content = new TextEncoder().encode("safe public recovery receipt");
          const staged = await store.stagePublicToolResultDerivative({
            runId: "run", sessionId: "session", attemptId: seeded.initial, leaseToken: seeded.leaseToken,
            reservationId: seeded.reservationId, invocationId: "invocation", content, contentHash: hashBytes(content), mediaType: "text/plain",
          });
          assert.equal(staged.kind, "staged");
          if (staged.kind !== "staged") throw new Error("staged derivative expected");
          outputArtifactId = staged.manifest.artifactId;
        }
        const receipt = receiptFor(seeded.initial, outputArtifactId);
        if (binding === "found") {
          assert.equal((await store.commitReceiptWithPublicEvents({
            runId: "run", attemptId: seeded.initial, leaseToken: seeded.leaseToken, reservationId: seeded.reservationId,
            receipt, expectedSequence: 0,
          })).kind, "committed");
        } else {
          assert.equal((await store.commitReceipt({
            runId: "run", attemptId: seeded.initial, leaseToken: seeded.leaseToken, reservationId: seeded.reservationId, receipt,
          })).kind, "committed");
        }
        nowMs += 1_001;
        assert.equal((await coordinator(store, now).recoverOnce()).blocked, 1);
        const command = await store.readRunCommand(scope);
        assert.equal(command?.status === "terminal" ? command.terminalCode : null,
          binding === "found" ? "tool_receipt_recovery_required" : "receipt_public_event_binding_invalid");
        assert.equal(store.providerCalls, 1);
        assert.equal(store.hostCalls, 1);
      } finally { store.close?.(); }
    });
  }

  test(`recovery coordinator ${name}: cursor reaches unsafe tail behind retained prefix`, async (t) => {
    let nowMs = Date.parse(timestamp());
    const now = () => new Date(nowMs).toISOString();
    const store = createStore(() => nowMs, t);
    try {
      for (const [suffix, offset] of [["a", -2], ["b", -1]] as const) {
        const workspaceId = `workspace-${suffix}`;
        assert.equal((await store.reserveRunCommand({
          localPrincipalId: `principal-${suffix}`, workspaceId, idempotencyKey: `key-${suffix}`,
          canonicalRequestHash: canonicalRunCommandRequestHash({ workspaceId, message: `retain-${suffix}` }),
          sessionId: `session-${suffix}`, turnId: `turn-${suffix}`, runId: `run-${suffix}`, attemptId: `attempt-${suffix}`,
          catalogHash: "catalog", intentRevision: 1, userMessage: `retain-${suffix}`,
          reservedAt: new Date(nowMs + offset).toISOString(),
        })).kind, "owner");
      }
      await seedDispatched(store, { clock: now, invocation: "none" });
      nowMs += 1_001;
      const recovery = coordinator(store, now, { scanLimit: 2, maxPages: 1 });
      const first = await recovery.recoverOnce();
      assert.deepEqual({ scanned: first.scanned, sweepComplete: first.sweepComplete, retained: first.retained, blocked: first.blocked }, { scanned: 2, sweepComplete: false, retained: 2, blocked: 0 });
      assert.ok(first.nextCursor);
      const second = await recovery.recoverOnce({ afterCursor: first.nextCursor });
      assert.deepEqual({ scanned: second.scanned, sweepComplete: second.sweepComplete, retained: second.retained, blocked: second.blocked, nextCursor: second.nextCursor }, { scanned: 1, sweepComplete: true, retained: 0, blocked: 1, nextCursor: null });
      assert.equal(store.providerCalls, 1);
      assert.equal(store.hostCalls, 0);
      assert.equal((await store.readRunCommand(scope))?.status, "terminal");
    } finally { store.close?.(); }
  });

  for (const failure of ["throw", "conflict", "incomplete", "too_large"] as const) {
    test(`recovery coordinator ${name}: ${failure} bundle remains fail-closed without Model/Host replay`, async (t) => {
      let nowMs = Date.parse(timestamp());
      const now = () => new Date(nowMs).toISOString();
      const store = createStore(() => nowMs, t);
      try {
        await seedDispatched(store, { clock: now, invocation: "none" });
        const guarded = new Proxy(store, {
          get(target, property, receiver) {
            if (property === "readRecoveryBundle") {
              return async () => {
                if (failure === "throw") throw new Error("injected_bundle_failure");
                if (failure === "conflict") return { kind: "conflict" as const, code: "run_attempt_conflict" as const };
                return { kind: "failure" as const, code: failure === "incomplete" ? "recovery_bundle_incomplete" as const : "recovery_bundle_too_large" as const };
              };
            }
            return Reflect.get(target, property, receiver);
          },
        }) as CountingStore;
        const result = await coordinator(guarded, now).recoverOnce();
        assert.deepEqual(result, { scanned: 1, sweepComplete: true, nextCursor: null, blocked: 0, retained: 0, leaseHeld: 0, conflicts: 0, indeterminate: 1 });
        assert.equal(store.providerCalls, 1);
        assert.equal(store.hostCalls, 0);
        assert.equal((await store.readRunCommand(scope))?.status, "dispatched");
        const bundle = await store.readRecoveryBundle({ runId: "run", eventLimit: 10 });
        assert.equal(bundle.kind, "found");
        if (bundle.kind !== "found") throw new Error("bundle expected");
        assert.equal(bundle.bundle.activeAttempt.attemptId, "attempt-initial");
        assert.equal(bundle.bundle.latestModelStep?.status, "started");
      } finally { store.close?.(); }
    });
  }
}
