import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";
import type { SessionStorePort } from "../contracts.js";
import { MemorySessionStore } from "../memory-session-store.js";
import { canonicalRunCommandRequestHash } from "../run-command-contract.js";
import { SqliteSessionStore } from "../src/sqlite-session-store.js";
import { hashBytes } from "../src/integrity.js";
import { createTempDatabase, timestamp } from "./helpers.js";

type Store = SessionStorePort & Readonly<{ close?: () => void }>;
type Prefix = readonly ("preparing" | "model_streaming")[];
const scope = { localPrincipalId: "principal", workspaceId: "workspace", idempotencyKey: "key" };

const reserveAndExpireInitialLease = async (
  store: Store,
  now: () => string,
  advance: (milliseconds: number) => void,
  status: "reserved" | "accepted",
  prefix: Prefix = [],
) => {
  assert.equal((await store.reserveRunCommand({
    ...scope,
    canonicalRequestHash: canonicalRunCommandRequestHash({ workspaceId: scope.workspaceId, message: "recover" }),
    sessionId: "session", turnId: "turn", runId: "run", attemptId: "attempt-initial",
    catalogHash: "catalog", intentRevision: 1, userMessage: "recover", reservedAt: now(),
  })).kind, "owner");
  const lease = await store.acquireLease({
    runId: "run", attemptId: "attempt-initial", ownerId: "old-worker", ttlMs: 1_000, requestedAt: now(),
  });
  assert.equal(lease.kind, "acquired");
  if (lease.kind !== "acquired") throw new Error("lease_not_acquired");
  if (status === "accepted") {
    assert.equal((await store.transitionRunCommand({
      ...scope, runId: "run", attemptId: "attempt-initial", leaseToken: lease.leaseToken,
      expectedStatus: "reserved", nextStatus: "accepted", updatedAt: now(),
    })).kind, "updated");
  }
  if (prefix.length > 0) {
    assert.equal(status, "accepted", "only an accepted Command can have entered ReadOnlyRunLoop");
    assert.equal((await store.appendEvents({
      runId: "run", attemptId: "attempt-initial", leaseToken: lease.leaseToken, expectedSequence: 0,
      events: prefix.map((value, index) => ({
        schemaVersion: "meliora.session-event.v1" as const,
        eventId: `prefix-${index + 1}`,
        kind: "run_status_changed",
        visibility: "public" as const,
        payload: { status: value },
        createdAt: now(),
      })),
    })).kind, "appended");
  }
  advance(1_001);
  return { lease, expectedSequence: prefix.length };
};

const claimInput = (status: "reserved" | "accepted", expectedSequence: number, now: () => string) => ({
  ...scope,
  runId: "run",
  expectedInitialAttemptId: "attempt-initial",
  expectedLatestAttemptNumber: 1 as const,
  expectedCommandStatus: status,
  expectedSequence,
  recoveryAttempt: {
    sessionId: "session", turnId: "turn", runId: "run", attemptId: "attempt-recovered",
    expectedLatestAttemptNumber: 1, catalogHash: "catalog", intentRevision: 1,
    createdAt: now(), requestedAt: now(), ownerId: "recovery-worker", ttlMs: 1_000,
  },
});

const adapters: readonly [string, (now: () => number, t: TestContext) => Store][] = [
  ["memory", (now) => new MemorySessionStore({ clock: () => new Date(now()) })],
  ["sqlite", (now, t) => new SqliteSessionStore(createTempDatabase(t), { clock: () => new Date(now()) })],
];

for (const [name, create] of adapters) {
  for (const [status, prefix] of [
    ["reserved", []],
    ["accepted", []],
    ["accepted", ["preparing"]],
    ["accepted", ["preparing", "model_streaming"]],
  ] as const satisfies readonly ["reserved" | "accepted", Prefix][]) {
    test(`${name} C.2a claims only initial ${status} pre-dispatch prefix ${prefix.length}`, async (t) => {
      let current = Date.parse(timestamp());
      const now = () => new Date(current).toISOString();
      const store = create(() => current, t);
      try {
        const seeded = await reserveAndExpireInitialLease(store, now, (milliseconds) => { current += milliseconds; }, status, prefix);
        const result = await store.claimInitialPreDispatchRunCommandForRecovery(claimInput(status, seeded.expectedSequence, now));
        assert.equal(result.kind, "claimed");
        if (result.kind !== "claimed") throw new Error("claim_expected");
        assert.equal(result.command.status, status, "claim itself never dispatches or changes Command state");
        assert.equal(result.attempt.attemptId, "attempt-recovered");
        assert.equal(result.attempt.attemptNumber, 2);
        assert.equal(result.attempt.lastEventSequence, prefix.length);
        assert.notEqual(result.lease.leaseToken, seeded.lease.leaseToken);
        const bundle = await store.readRecoveryBundle({ runId: "run", eventLimit: 10 });
        assert.equal(bundle.kind, "found");
        if (bundle.kind !== "found") throw new Error("bundle_expected");
        assert.equal(bundle.bundle.activeAttempt.attemptId, "attempt-recovered");
        assert.equal(bundle.bundle.latestAttemptNumber, 2);
        assert.equal((await store.readEvents({ runId: "run", afterSequence: 0, limit: 10 })).events.length, prefix.length);
      } finally { store.close?.(); }
    });
  }

  test(`${name} C.2a allows reservation-before-lease crash but rejects a live initial lease`, async (t) => {
    let current = Date.parse(timestamp());
    const now = () => new Date(current).toISOString();
    const store = create(() => current, t);
    try {
      assert.equal((await store.reserveRunCommand({
        ...scope,
        canonicalRequestHash: canonicalRunCommandRequestHash({ workspaceId: scope.workspaceId, message: "recover" }),
        sessionId: "session", turnId: "turn", runId: "run", attemptId: "attempt-initial",
        catalogHash: "catalog", intentRevision: 1, userMessage: "recover", reservedAt: now(),
      })).kind, "owner");
      assert.equal((await store.claimInitialPreDispatchRunCommandForRecovery(claimInput("reserved", 0, now))).kind, "claimed");
    } finally { store.close?.(); }

    current = Date.parse(timestamp());
    const held = create(() => current, t);
    try {
      await reserveAndExpireInitialLease(held, now, () => {}, "accepted");
      assert.deepEqual(await held.claimInitialPreDispatchRunCommandForRecovery(claimInput("accepted", 0, now)), { kind: "conflict", code: "lease_held" });
      const command = await held.readRunCommand(scope);
      assert.equal(command?.status, "accepted");
      const bundle = await held.readRecoveryBundle({ runId: "run", eventLimit: 10 });
      assert.equal(bundle.kind, "found");
      if (bundle.kind === "found") assert.equal(bundle.bundle.activeAttempt.attemptId, "attempt-initial");
    } finally { held.close?.(); }
  });
}

for (const [name, create] of adapters) {
  test(`${name} C.2a concurrent claim has one winner and one durable authority`, async (t) => {
    let current = Date.parse(timestamp());
    const now = () => new Date(current).toISOString();
    const store = create(() => current, t);
    try {
      await reserveAndExpireInitialLease(store, now, (milliseconds) => { current += milliseconds; }, "accepted");
      const input = claimInput("accepted", 0, now);
      const outcomes = await Promise.all([
        store.claimInitialPreDispatchRunCommandForRecovery(input),
        store.claimInitialPreDispatchRunCommandForRecovery(input),
      ]);
      assert.equal(outcomes.filter((outcome) => outcome.kind === "claimed").length, 1);
      const bundle = await store.readRecoveryBundle({ runId: "run", eventLimit: 10 });
      assert.equal(bundle.kind, "found");
      if (bundle.kind === "found") {
        assert.equal(bundle.bundle.activeAttempt.attemptId, "attempt-recovered");
        assert.equal(bundle.bundle.latestAttemptNumber, 2);
      }
    } finally { store.close?.(); }
  });
}

// The port's main safety value is that the claim reads all evidence and moves
// authority in the same critical section. Test the two easy-to-forge facts
// directly: a noncanonical event prefix and an invocation reservation.
for (const [name, create] of adapters) {
  test(`${name} C.2a rejects altered prefix and invocation evidence atomically`, async (t) => {
    let current = Date.parse(timestamp());
    const now = () => new Date(current).toISOString();
    const store = create(() => current, t);
    try {
      const lease = await reserveAndExpireInitialLease(store, now, () => {}, "accepted");
      assert.equal((await store.appendEvents({
        runId: "run", attemptId: "attempt-initial", leaseToken: lease.lease.leaseToken, expectedSequence: 0,
        events: [{ schemaVersion: "meliora.session-event.v1", eventId: "wrong-prefix", kind: "run_status_changed", visibility: "public", payload: { status: "verifying" }, createdAt: now() }],
      })).kind, "appended");
      current += 1_001;
      const rejectedPrefix = await store.claimInitialPreDispatchRunCommandForRecovery(claimInput("accepted", 1, now));
      assert.deepEqual(rejectedPrefix, { kind: "conflict", code: "initial_recovery_not_safe" });
      const prefixBundle = await store.readRecoveryBundle({ runId: "run", eventLimit: 10 });
      assert.equal(prefixBundle.kind, "found");
      if (prefixBundle.kind === "found") assert.equal(prefixBundle.bundle.activeAttempt.attemptId, "attempt-initial");
    } finally { store.close?.(); }

    current = Date.parse(timestamp());
    const withInvocation = create(() => current, t);
    try {
      const lease = await reserveAndExpireInitialLease(withInvocation, now, () => {}, "accepted");
      const reservation = await withInvocation.reserveInvocation({
        leaseToken: lease.lease.leaseToken, reservedAt: now(),
        invocation: {
          schemaVersion: "meliora.tool-invocation.v1", invocationId: "invocation", runId: "run", attemptId: "attempt-initial",
          toolName: "read_file", toolVersion: "v1", arguments: {}, argumentsHash: hashBytes("arguments"),
          catalogHash: "catalog", idempotencyKey: "tool-key", status: "reserved",
        },
      });
      assert.equal(reservation.kind, "owner");
      current += 1_001;
      const rejectedInvocation = await withInvocation.claimInitialPreDispatchRunCommandForRecovery(claimInput("accepted", 0, now));
      assert.deepEqual(rejectedInvocation, { kind: "conflict", code: "initial_recovery_not_safe" });
      const invocationBundle = await withInvocation.readRecoveryBundle({ runId: "run", eventLimit: 10 });
      assert.equal(invocationBundle.kind, "found");
      if (invocationBundle.kind === "found") assert.equal(invocationBundle.bundle.activeAttempt.attemptId, "attempt-initial");
    } finally { withInvocation.close?.(); }
  });
}

for (const [name, create] of adapters) {
  test(`${name} C.2a rejects another Attempt's live lease and malformed expired lease`, async (t) => {
    let current = Date.parse(timestamp());
    const now = () => new Date(current).toISOString();
    const store = create(() => current, t);
    try {
      await reserveAndExpireInitialLease(store, now, (milliseconds) => { current += milliseconds; }, "accepted");
      if (store instanceof MemorySessionStore) {
        const raw = store as unknown as { leases: Map<string, { token: string; ownerId: string; expiresAt: string }> };
        raw.leases.set("run\u0000attempt-unrelated", { token: "unrelated-token", ownerId: "other-worker", expiresAt: new Date(current + 1_000).toISOString() });
      } else {
        const db = (store as unknown as { db: Database.Database }).db;
        db.prepare("INSERT INTO run_attempts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(
          "attempt-unrelated", "run", "session", "turn", 99, "created", 0, "catalog", 1, "null", now(), now(),
        );
        db.prepare("INSERT INTO run_leases VALUES (?,?,?,?,?)").run(
          "run", "attempt-unrelated", "other-worker", hashBytes("unrelated-token"), new Date(current + 1_000).toISOString(),
        );
      }
      assert.deepEqual(await store.claimInitialPreDispatchRunCommandForRecovery(claimInput("accepted", 0, now)), { kind: "conflict", code: "lease_held" });
      const before = await store.readRecoveryBundle({ runId: "run", eventLimit: 10 });
      assert.equal(before.kind, "found");
      if (before.kind === "found") assert.equal(before.bundle.activeAttempt.attemptId, "attempt-initial");
    } finally { (store as Store).close?.(); }

    current = Date.parse(timestamp());
    const malformed = create(() => current, t);
    try {
      await reserveAndExpireInitialLease(malformed, now, (milliseconds) => { current += milliseconds; }, "accepted");
      if (malformed instanceof MemorySessionStore) {
        const raw = malformed as unknown as { leases: Map<string, { token: string; ownerId: string; expiresAt: string }> };
        raw.leases.set("run\u0000attempt-initial", { token: "old-token", ownerId: "old-worker", expiresAt: "not-a-timestamp" });
      } else {
        const db = (malformed as unknown as { db: Database.Database }).db;
        db.prepare("UPDATE run_leases SET expires_at=? WHERE run_id=? AND attempt_id=?").run("not-a-timestamp", "run", "attempt-initial");
      }
      assert.deepEqual(await malformed.claimInitialPreDispatchRunCommandForRecovery(claimInput("accepted", 0, now)), { kind: "conflict", code: "initial_recovery_not_safe" });
      const after = await malformed.readRecoveryBundle({ runId: "run", eventLimit: 10 });
      assert.equal(after.kind, "found");
      if (after.kind === "found") assert.equal(after.bundle.activeAttempt.attemptId, "attempt-initial");
    } finally { (malformed as Store).close?.(); }
  });
}

for (const [name, create] of adapters) {
  for (const drift of ["session", "turn", "private_input", "private_input_rebound", "extra_attempt"] as const) {
    test(`${name} C.2a rejects ${drift} initial-record drift without takeover`, async (t) => {
      let current = Date.parse(timestamp());
      const now = () => new Date(current).toISOString();
      const store = create(() => current, t);
      try {
        await reserveAndExpireInitialLease(store, now, (milliseconds) => { current += milliseconds; }, "accepted");
        if (store instanceof MemorySessionStore) {
          const raw = store as unknown as {
            sessions: Map<string, unknown>;
            turns: Map<string, unknown>;
            privateUserInputs: Map<string, { content: string; contentHash: string }>;
            attempts: Map<string, { runId: string; attemptId: string; attemptNumber: number }>;
          };
          if (drift === "session") raw.sessions.delete("session");
          if (drift === "turn") raw.turns.delete("turn");
          if (drift === "private_input") raw.privateUserInputs.delete("turn");
          if (drift === "private_input_rebound") {
            const original = raw.privateUserInputs.get("turn")!;
            raw.privateUserInputs.set("turn", { ...original, content: "replaced but safe", contentHash: hashBytes("replaced but safe") });
          }
          if (drift === "extra_attempt") raw.attempts.set("run\u0000attempt-hidden", { runId: "run", attemptId: "attempt-hidden", attemptNumber: 99 });
        } else {
          const db = (store as unknown as { db: Database.Database }).db;
          if (drift === "session" || drift === "turn" || drift === "private_input") db.pragma("foreign_keys = OFF");
          if (drift === "session") db.prepare("DELETE FROM sessions WHERE session_id=?").run("session");
          if (drift === "turn") db.prepare("DELETE FROM turns WHERE turn_id=?").run("turn");
          if (drift === "private_input") db.prepare("DELETE FROM run_command_inputs WHERE run_id=?").run("run");
          if (drift === "private_input_rebound") db.prepare("UPDATE run_command_inputs SET content=?,content_hash=? WHERE run_id=?")
            .run("replaced but safe", hashBytes("replaced but safe"), "run");
          if (drift === "session" || drift === "turn" || drift === "private_input") db.pragma("foreign_keys = ON");
          if (drift === "extra_attempt") db.prepare("INSERT INTO run_attempts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(
            "attempt-hidden", "run", "session", "turn", 99, "created", 0, "catalog", 1, "null", now(), now(),
          );
        }
        assert.deepEqual(await store.claimInitialPreDispatchRunCommandForRecovery(claimInput("accepted", 0, now)), { kind: "conflict", code: "initial_recovery_not_safe" });
        assert.equal((await store.readRunCommand(scope))?.status, "accepted");
      } finally { (store as Store).close?.(); }
    });
  }
}

const faultyAdapters: readonly [string, (now: () => number, stage: "takeover_attempt" | "takeover_lease" | "takeover_run", t: TestContext) => Store][] = [
  ["memory", (now, stage) => new MemorySessionStore({
    clock: () => new Date(now()), onRecoveryAtomicWrite: (current) => { if (current === stage) throw new Error(`inject-${stage}`); },
  })],
  ["sqlite", (now, stage, t) => new SqliteSessionStore(createTempDatabase(t), {
    clock: () => new Date(now()), onRecoveryAtomicWrite: (current) => { if (current === stage) throw new Error(`inject-${stage}`); },
  })],
];

for (const [name, create] of faultyAdapters) {
  for (const stage of ["takeover_attempt", "takeover_lease", "takeover_run"] as const) {
    test(`${name} C.2a ${stage} fault leaves initial authority intact`, async (t) => {
      let current = Date.parse(timestamp());
      const now = () => new Date(current).toISOString();
      const store = create(() => current, stage, t);
      try {
        await reserveAndExpireInitialLease(store, now, (milliseconds) => { current += milliseconds; }, "accepted");
        await assert.rejects(store.claimInitialPreDispatchRunCommandForRecovery(claimInput("accepted", 0, now)), new RegExp(`inject-${stage}`, "u"));
        const command = await store.readRunCommand(scope);
        assert.equal(command?.status, "accepted");
        const bundle = await store.readRecoveryBundle({ runId: "run", eventLimit: 10 });
        assert.equal(bundle.kind, "found");
        if (bundle.kind === "found") assert.equal(bundle.bundle.activeAttempt.attemptId, "attempt-initial");
      } finally { store.close?.(); }
    });
  }
}
