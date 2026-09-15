import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";

import type { SessionStorePort } from "../contracts.js";
import { MemorySessionStore } from "../memory-session-store.js";
import { canonicalRunCommandRequestHash } from "../run-command-contract.js";
import { SensitiveDataError } from "../src/errors.js";
import { SqliteSessionStore } from "../src/sqlite-session-store.js";
import { createTempDatabase, timestamp } from "./helpers.js";

type Store = SessionStorePort & Readonly<{ close?: () => void }>;
const scope = { localPrincipalId: "principal", workspaceId: "workspace", idempotencyKey: "key" };

const seed = async (store: Store, now: () => string) => {
  const reserved = await store.reserveRunCommand({
    ...scope,
    canonicalRequestHash: canonicalRunCommandRequestHash({ workspaceId: scope.workspaceId, message: "recover" }),
    sessionId: "session", turnId: "turn", runId: "run", attemptId: "attempt-old",
    catalogHash: "catalog", intentRevision: 1, userMessage: "recover", reservedAt: now(),
  });
  assert.equal(reserved.kind, "owner");
  const lease = await store.acquireLease({ runId: "run", attemptId: "attempt-old", ownerId: "old-worker", ttlMs: 1_000, requestedAt: now() });
  assert.equal(lease.kind, "acquired");
  if (lease.kind !== "acquired") throw new Error("expected lease");
  assert.equal((await store.transitionRunCommand({
    ...scope, runId: "run", attemptId: "attempt-old", leaseToken: lease.leaseToken,
    expectedStatus: "reserved", nextStatus: "accepted", updatedAt: now(),
  })).kind, "updated");
  assert.equal((await store.startModelStep({
    runId: "run", attemptId: "attempt-old", leaseToken: lease.leaseToken,
    modelStepId: "step-old", requestFingerprint: "a".repeat(64), startedAt: now(),
  })).kind, "started");
  return lease;
};

const atomicInput = (now: () => string, eventId = "terminal-event", expectedSequence = 0) => ({
  ...scope,
  runId: "run",
  expectedActiveAttemptId: "attempt-old",
  expectedLatestAttemptNumber: 1,
  expectedCommandStatus: "dispatched" as const,
  expectedSequence,
  recoveryAttempt: {
    sessionId: "session", turnId: "turn", runId: "run", attemptId: "attempt-recovery",
    expectedLatestAttemptNumber: 1, catalogHash: "catalog", intentRevision: 1,
    createdAt: now(), ownerId: "recovery", ttlMs: 1_000, requestedAt: now(),
  },
  terminalCode: "model_step_outcome_unknown",
  updatedAt: now(),
  terminalEvent: {
    schemaVersion: "meliora.session-event.v1" as const, eventId, kind: "run_blocked", visibility: "public" as const,
    payload: {
      code: "model_step_outcome_unknown", message: "Provider result is unknown.", userActions: ["Verify safely."],
    },
    createdAt: now(),
  },
});

const adapters: readonly [string, (now: () => number, t: TestContext) => Store][] = [
  ["memory", (now) => new MemorySessionStore({ clock: () => new Date(now()) })],
  ["sqlite", (now, t) => new SqliteSessionStore(createTempDatabase(t), { clock: () => new Date(now()) })],
];

type RecoverySensitiveAttack = Readonly<{
  terminalEvent?: Readonly<Record<string, string>>;
  recoveryAttempt?: Readonly<Record<string, string>>;
}>;

const RECOVERY_SENSITIVE_ATTACKS: readonly RecoverySensitiveAttack[] = [
  { terminalEvent: { eventId: "sk-recovery-event-secret-123456" } },
  { terminalEvent: { kind: "Authorization: Bearer opaque-recovery-kind-secret" } },
  { recoveryAttempt: { attemptId: "api-recovery-attempt-secret-123456" } },
  { recoveryAttempt: { ownerId: "sk-recovery-owner-secret-123456" } },
];

const RECOVERY_REJECTED_EVENT_METADATA: readonly RecoverySensitiveAttack[] = [
  { terminalEvent: { causationId: "bEaReR = opaque-recovery-causation-secret" } },
  { terminalEvent: { correlationId: "X_API_KEY : opaque-recovery-correlation-secret" } },
];

for (const [name, create] of adapters) {
  test(`${name} recovery atomic boundary writes new Attempt, Command and terminal event together`, async (t) => {
    let current = Date.parse(timestamp());
    const now = () => new Date(current).toISOString();
    const store = create(() => current, t);
    try {
      await seed(store, now);
      current += 1_001;
      const settled = await store.recoverAndSettleRunCommandWithTerminalEvent(atomicInput(now));
      assert.equal(settled.kind, "settled");
      const command = await store.readRunCommand(scope);
      assert.equal(command?.status === "terminal" ? command.terminalCode : null, "model_step_outcome_unknown");
      const bundle = await store.readRecoveryBundle({ runId: "run", eventLimit: 10 });
      assert.equal(bundle.kind, "found");
      if (bundle.kind !== "found") throw new Error("bundle expected");
      assert.equal(bundle.bundle.activeAttempt.attemptId, "attempt-recovery");
      assert.equal(bundle.bundle.latestModelStep, null, "old started checkpoint is not reused by the new Attempt");
      assert.equal((await store.readModelStep({ runId: "run", modelStepId: "step-old" }))?.status, "started");
      assert.deepEqual((await store.readEvents({ runId: "run", afterSequence: 0, limit: 10 })).events.map((event) => event.kind), ["run_blocked"]);
    } finally { store.close?.(); }
  });

  test(`${name} recovery atomic conflict/lease/race leave old active Attempt and started checkpoint visible`, async (t) => {
    let current = Date.parse(timestamp());
    const now = () => new Date(current).toISOString();
    const store = create(() => current, t);
    try {
      await seed(store, now);
      for (const forgedStatus of ["accepted", "terminal"] as const) {
        const forged = { ...atomicInput(now), expectedCommandStatus: forgedStatus } as unknown as Parameters<SessionStorePort["recoverAndSettleRunCommandWithTerminalEvent"]>[0];
        assert.deepEqual(await store.recoverAndSettleRunCommandWithTerminalEvent(forged), { kind: "conflict", code: "command_status_conflict" });
        const beforeForged = await store.readRecoveryBundle({ runId: "run", eventLimit: 10 });
        assert.equal(beforeForged.kind, "found");
        if (beforeForged.kind !== "found") throw new Error("bundle expected");
        assert.equal(beforeForged.bundle.activeAttempt.attemptId, "attempt-old");
        assert.equal((await store.readRunCommand(scope))?.status, "dispatched");
      }
      const timestampMismatch = {
        ...atomicInput(now),
        updatedAt: new Date(current + 1).toISOString(),
      };
      assert.deepEqual(await store.recoverAndSettleRunCommandWithTerminalEvent(timestampMismatch), { kind: "conflict", code: "command_status_conflict" });
      assert.equal((await store.readRunCommand(scope))?.status, "dispatched");
      for (const malformed of [
        { ...atomicInput(now), recoveryAttempt: { ...atomicInput(now).recoveryAttempt, attemptId: "bad id" } },
        { ...atomicInput(now), recoveryAttempt: { ...atomicInput(now).recoveryAttempt, ownerId: "bad id" } },
        { ...atomicInput(now), terminalEvent: { ...atomicInput(now).terminalEvent, eventId: "bad id" } },
      ]) {
        await assert.rejects(store.recoverAndSettleRunCommandWithTerminalEvent(malformed));
        assert.equal((await store.readRunCommand(scope))?.status, "dispatched");
      }
      const held = await store.recoverAndSettleRunCommandWithTerminalEvent(atomicInput(now));
      assert.deepEqual(held, { kind: "conflict", code: "lease_held" });
      let before = await store.readRecoveryBundle({ runId: "run", eventLimit: 10 });
      assert.equal(before.kind, "found");
      if (before.kind !== "found") throw new Error("bundle expected");
      assert.equal(before.bundle.activeAttempt.attemptId, "attempt-old");
      assert.equal(before.bundle.latestModelStep?.status, "started");

      current += 1_001;
      const raced = await Promise.all([
        store.recoverAndSettleRunCommandWithTerminalEvent(atomicInput(now, "race-event")),
        store.recoverAndSettleRunCommandWithTerminalEvent(atomicInput(now, "race-event")),
      ]);
      assert.equal(raced.filter((result) => result.kind === "settled").length, 1);
      assert.equal((await store.readEvents({ runId: "run", afterSequence: 0, limit: 10 })).events.length, 1);

      // A duplicate event is detected before any new recovery attempt is made.
      const other = create(() => current, t);
      const otherLease = await seed(other, now);
      assert.equal((await other.appendEvents({
        runId: "run", attemptId: "attempt-old", leaseToken: otherLease.leaseToken, expectedSequence: 0,
        events: [{ schemaVersion: "meliora.session-event.v1", eventId: "collision", kind: "fixture", visibility: "private", payload: {}, createdAt: now() }],
      })).kind, "appended");
      current += 1_001;
      const duplicate = await other.recoverAndSettleRunCommandWithTerminalEvent(atomicInput(now, "collision", 1));
      assert.deepEqual(duplicate, { kind: "conflict", code: "command_status_conflict" });
      const afterDuplicate = await other.readRecoveryBundle({ runId: "run", eventLimit: 10 });
      assert.equal(afterDuplicate.kind, "found");
      if (afterDuplicate.kind !== "found") throw new Error("bundle expected");
      assert.equal(afterDuplicate.bundle.activeAttempt.attemptId, "attempt-old");
      assert.equal(afterDuplicate.bundle.latestModelStep?.status, "started");
      assert.equal((await other.readRunCommand(scope))?.status, "dispatched");
      other.close?.();
    } finally { store.close?.(); }
  });

  test(`${name} recovery rejects sensitive terminal metadata and opaque IDs before any write`, async (t) => {
    let current = Date.parse(timestamp());
    const now = () => new Date(current).toISOString();
    const store = create(() => current, t);
    try {
      await seed(store, now);
      current += 1_001;
      for (const attack of RECOVERY_SENSITIVE_ATTACKS) {
        const base = atomicInput(now);
        const input = {
          ...base,
          ...(attack.terminalEvent === undefined ? {} : { terminalEvent: { ...base.terminalEvent, ...attack.terminalEvent } }),
          ...(attack.recoveryAttempt === undefined ? {} : { recoveryAttempt: { ...base.recoveryAttempt, ...attack.recoveryAttempt } }),
        } as Parameters<SessionStorePort["recoverAndSettleRunCommandWithTerminalEvent"]>[0];
        await assert.rejects(store.recoverAndSettleRunCommandWithTerminalEvent(input), SensitiveDataError);
        assert.equal((await store.readRunCommand(scope))?.status, "dispatched");
        assert.equal((await store.readEvents({ runId: "run", afterSequence: 0, limit: 10 })).events.length, 0);
      }
      for (const attack of RECOVERY_REJECTED_EVENT_METADATA) {
        const base = atomicInput(now);
        const input = {
          ...base,
          terminalEvent: { ...base.terminalEvent, ...attack.terminalEvent },
        } as Parameters<SessionStorePort["recoverAndSettleRunCommandWithTerminalEvent"]>[0];
        await assert.rejects(store.recoverAndSettleRunCommandWithTerminalEvent(input), SensitiveDataError);
        assert.equal((await store.readEvents({ runId: "run", afterSequence: 0, limit: 10 })).events.length, 0);
      }
      await assert.rejects(store.appendEvents({
        runId: "run", attemptId: "attempt-old", leaseToken: "unused-after-validation", expectedSequence: 0,
        events: [{
          ...atomicInput(now).terminalEvent,
          causationId: " ＡＰＩ Ｋｅｙ : opaque-generic-causation-secret",
          correlationId: "Ｔｏｋｅｎ : opaque-generic-correlation-secret",
        }],
      }), SensitiveDataError);
      const genericTerminal = atomicInput(now).terminalEvent;
      const settleInput = {
        ...scope,
        runId: "run", attemptId: "attempt-old", leaseToken: "unused-after-validation", expectedCommandStatus: "dispatched" as const,
        expectedSequence: 0, terminalStatus: "blocked" as const, terminalCode: "model_step_outcome_unknown", updatedAt: now(),
      };
      await assert.rejects(store.settleRunCommandWithTerminalEvent({
        ...settleInput,
        terminalEvent: { ...genericTerminal, causationId: " ＡＰＩ Ｋｅｙ : opaque-generic-causation-secret" },
      }), SensitiveDataError);
      for (const terminalEvent of [
        { ...genericTerminal, eventId: "sk-generic-event-secret-123456" },
        { ...genericTerminal, kind: "Authorization: Bearer opaque-generic-kind-secret" },
      ]) {
        await assert.rejects(store.appendEvents({
          runId: "run", attemptId: "attempt-old", leaseToken: "unused-after-validation", expectedSequence: 0, events: [terminalEvent],
        }), SensitiveDataError);
        await assert.rejects(store.settleRunCommandWithTerminalEvent({ ...settleInput, terminalEvent }), SensitiveDataError);
      }
      await assert.rejects(store.appendEvents({
        runId: "run", attemptId: "attempt-old", leaseToken: "unused-after-validation", expectedSequence: 0,
        events: [{ ...genericTerminal, runtimeOnlyMetadata: { mustNotPersist: true } }],
      } as unknown as Parameters<SessionStorePort["appendEvents"]>[0]), /invalid_event_fields/u);
      await assert.rejects(store.settleRunCommandWithTerminalEvent({
        ...settleInput,
        terminalEvent: { ...genericTerminal, runtimeOnlyMetadata: { mustNotPersist: true } },
      } as unknown as Parameters<SessionStorePort["settleRunCommandWithTerminalEvent"]>[0]), /invalid_event_fields/u);
      const base = atomicInput(now);
      const unknownOwnKey = {
        ...base,
        terminalEvent: { ...base.terminalEvent, metadata: { retainedByMemoryWithoutAWhitelist: true } },
      } as unknown as Parameters<SessionStorePort["recoverAndSettleRunCommandWithTerminalEvent"]>[0];
      await assert.rejects(store.recoverAndSettleRunCommandWithTerminalEvent(unknownOwnKey), /invalid_event_fields/u);
      assert.equal((await store.readEvents({ runId: "run", afterSequence: 0, limit: 10 })).events.length, 0);
    } finally { store.close?.(); }
  });

  test(`${name} recovery cursor reaches unsafe tail behind retained prefix`, async (t) => {
    let current = Date.parse(timestamp());
    const store = create(() => current, t);
    try {
      for (const [id, at] of [["run-a", 0], ["run-b", 1], ["run-c", 2]] as const) {
        const stamp = new Date(current + at).toISOString();
        const reserved = await store.reserveRunCommand({
          localPrincipalId: `principal-${id}`, workspaceId: `workspace-${id}`, idempotencyKey: `key-${id}`,
          canonicalRequestHash: canonicalRunCommandRequestHash({ workspaceId: `workspace-${id}`, message: `recover-${id}` }),
          sessionId: `session-${id}`, turnId: `turn-${id}`, runId: id, attemptId: `attempt-${id}`,
          catalogHash: "catalog", intentRevision: 1, userMessage: `recover-${id}`, reservedAt: stamp,
        });
        assert.equal(reserved.kind, "owner");
      }
      const first = await store.listRecoverableCommands({ limit: 2 });
      assert.deepEqual(first.commands.map((command) => command.runId), ["run-a", "run-b"]);
      assert.equal(first.sweepComplete, false);
      assert.deepEqual(first.nextCursor, { createdAt: new Date(current + 1).toISOString(), runId: "run-b" });
      const tail = await store.listRecoverableCommands({ limit: 2, afterCursor: first.nextCursor! });
      assert.deepEqual(tail.commands.map((command) => command.runId), ["run-c"]);
      assert.equal(tail.sweepComplete, true);
      assert.equal(tail.nextCursor, null);
      await assert.rejects(store.listRecoverableCommands({ limit: 2, afterCursor: { createdAt: "invalid", runId: "run-a" } }));
      await assert.rejects(store.listRecoverableCommands({ limit: 2, afterCursor: { createdAt: new Date(current).toISOString(), runId: "bad cursor" } }));

      const equal = create(() => current, t);
      const sameCreatedAt = new Date(current + 10).toISOString();
      for (const runId of ["run-Z", "run-a", "run-1", "run_1"] as const) {
        assert.equal((await equal.reserveRunCommand({
          localPrincipalId: `principal-${runId}`, workspaceId: `workspace-${runId}`, idempotencyKey: `key-${runId}`,
          canonicalRequestHash: canonicalRunCommandRequestHash({ workspaceId: `workspace-${runId}`, message: `same-${runId}` }),
          sessionId: `session-${runId}`, turnId: `turn-${runId}`, runId, attemptId: `attempt-${runId}`,
          catalogHash: "catalog", intentRevision: 1, userMessage: `same-${runId}`, reservedAt: sameCreatedAt,
        })).kind, "owner");
      }
      const equalFirst = await equal.listRecoverableCommands({ limit: 2 });
      const equalSecond = await equal.listRecoverableCommands({ limit: 2, afterCursor: equalFirst.nextCursor! });
      assert.deepEqual([...equalFirst.commands, ...equalSecond.commands].map((command) => command.runId), ["run-1", "run-Z", "run-a", "run_1"]);
      assert.equal(equalSecond.nextCursor, null);
      equal.close?.();
    } finally { store.close?.(); }
  });
}

test("SQLite recovery rejects sensitive terminal metadata and opaque IDs before DB, WAL or SHM writes", async (t) => {
  let current = Date.parse(timestamp());
  const now = () => new Date(current).toISOString();
  const path = createTempDatabase(t);
  const store = new SqliteSessionStore(path, { clock: () => new Date(current) });
  try {
    await seed(store, now);
    current += 1_001;
  for (const attack of [...RECOVERY_SENSITIVE_ATTACKS, ...RECOVERY_REJECTED_EVENT_METADATA]) {
      const base = atomicInput(now);
      const input = {
        ...base,
        ...(attack.terminalEvent === undefined ? {} : { terminalEvent: { ...base.terminalEvent, ...attack.terminalEvent } }),
        ...(attack.recoveryAttempt === undefined ? {} : { recoveryAttempt: { ...base.recoveryAttempt, ...attack.recoveryAttempt } }),
      } as Parameters<SessionStorePort["recoverAndSettleRunCommandWithTerminalEvent"]>[0];
      await assert.rejects(store.recoverAndSettleRunCommandWithTerminalEvent(input), SensitiveDataError);
    }
  } finally { store.close(); }
  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
    if (!existsSync(candidate)) continue;
    const bytes = readFileSync(candidate);
    for (const attack of [...RECOVERY_SENSITIVE_ATTACKS, ...RECOVERY_REJECTED_EVENT_METADATA]) {
      for (const value of [...Object.values(attack.terminalEvent ?? {}), ...Object.values(attack.recoveryAttempt ?? {})]) {
        assert.equal(bytes.includes(Buffer.from(value, "utf8")), false);
        assert.equal(bytes.includes(Buffer.from(value, "utf16le")), false);
      }
    }
  }
});

const faultyAdapters: readonly [string, (now: () => number, stage: string, t: TestContext) => Store][] = [
  ["memory", (now, stage) => new MemorySessionStore({
    clock: () => new Date(now()), onRecoveryAtomicWrite: (current) => { if (current === stage) throw new Error(`inject-${stage}`); },
  })],
  ["sqlite", (now, stage, t) => new SqliteSessionStore(createTempDatabase(t), {
    clock: () => new Date(now()), onRecoveryAtomicWrite: (current) => { if (current === stage) throw new Error(`inject-${stage}`); },
  })],
] as const;

for (const [adapter, create] of faultyAdapters) {
  for (const stage of ["attempt", "lease", "event", "command"] as const) {
    test(`${adapter} recovery atomic ${stage} fault rolls back old authority`, async (t) => {
      let current = Date.parse(timestamp());
      const now = () => new Date(current).toISOString();
      const store = create(() => current, stage, t);
      try {
        await seed(store, now);
        current += 1_001;
        await assert.rejects(store.recoverAndSettleRunCommandWithTerminalEvent(atomicInput(now)), new RegExp(`inject-${stage}`, "u"));
        const bundle = await store.readRecoveryBundle({ runId: "run", eventLimit: 10 });
        assert.equal(bundle.kind, "found");
        if (bundle.kind !== "found") throw new Error("bundle expected");
        assert.equal(bundle.bundle.activeAttempt.attemptId, "attempt-old");
        assert.equal(bundle.bundle.latestModelStep?.status, "started");
        assert.equal((await store.readRunCommand(scope))?.status, "dispatched");
        assert.equal((await store.readEvents({ runId: "run", afterSequence: 0, limit: 10 })).events.length, 0);
      } finally { store.close?.(); }
    });
  }
}
