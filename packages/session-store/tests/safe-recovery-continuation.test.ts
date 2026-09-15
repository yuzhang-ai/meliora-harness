import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";
import type { SessionStorePort } from "../contracts.js";
import { MemorySessionStore } from "../memory-session-store.js";
import { canonicalRunCommandRequestHash } from "../run-command-contract.js";
import { SqliteSessionStore } from "../src/sqlite-session-store.js";
import { canonicalJson, hashBytes } from "../src/integrity.js";
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

const reclaimInput = (status: "reserved" | "accepted", expectedSequence: number, now: () => string) => ({
  ...scope,
  runId: "run",
  expectedInitialAttemptId: "attempt-initial",
  expectedActiveAttemptId: "attempt-recovered",
  expectedLatestAttemptNumber: 2 as const,
  expectedCommandStatus: status,
  expectedSequence,
  ownerId: "recovery-worker-2",
  ttlMs: 1_000,
  requestedAt: now(),
});

const adapters: readonly [string, (now: () => number, t: TestContext) => Store][] = [
  ["memory", (now) => new MemorySessionStore({ clock: () => new Date(now()) })],
  ["sqlite", (now, t) => new SqliteSessionStore(createTempDatabase(t), { clock: () => new Date(now()) })],
];

// A rejected claim must not mint an Attempt/lease, move Run authority, alter
// the Command, or touch the event log. Keep this adapter-private snapshot
// deliberately narrow so the assertion covers exactly that authority set.
const recoveryAuthoritySnapshot = (store: Store): unknown => {
  if (store instanceof MemorySessionStore) {
    const raw = store as unknown as {
      attempts: Map<string, unknown>;
      runs: Map<string, unknown>;
      leases: Map<string, unknown>;
      commands: Map<string, unknown>;
      events: Map<string, unknown>;
    };
    return structuredClone({
      attempts: [...raw.attempts.entries()],
      runs: [...raw.runs.entries()],
      leases: [...raw.leases.entries()],
      commands: [...raw.commands.entries()],
      events: [...raw.events.entries()],
    });
  }
  const db = (store as unknown as { db: Database.Database }).db;
  return {
    attempts: db.prepare("SELECT * FROM run_attempts WHERE run_id=? ORDER BY attempt_number").all("run"),
    runs: db.prepare("SELECT * FROM runs WHERE run_id=?").all("run"),
    leases: db.prepare("SELECT * FROM run_leases WHERE run_id=? ORDER BY attempt_id").all("run"),
    commands: db.prepare("SELECT * FROM run_commands WHERE run_id=?").all("run"),
    events: db.prepare("SELECT * FROM events WHERE run_id=? ORDER BY sequence").all("run"),
  };
};

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
      } finally { (store as Store).close?.(); }
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
    } finally { (store as Store).close?.(); }

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
  for (const [firstPrefix, secondStatus, sequence] of [
    [["preparing"], "model_streaming", 2],
    [[], "preparing", 1],
  ] as const) {
    test(`${name} C.2b reclaims Attempt #2 after its own ${secondStatus} prefix without #3`, async (t) => {
      let current = Date.parse(timestamp());
      const now = () => new Date(current).toISOString();
      const store = create(() => current, t);
      try {
        await reserveAndExpireInitialLease(store, now, (milliseconds) => { current += milliseconds; }, "accepted", firstPrefix);
      const claimed = await store.claimInitialPreDispatchRunCommandForRecovery(claimInput("accepted", firstPrefix.length, now));
      assert.equal(claimed.kind, "claimed");
      if (claimed.kind !== "claimed") throw new Error("claim_expected");
      assert.deepEqual(await store.acquireLease({ runId: "run", attemptId: "attempt-recovered", ownerId: "bypass", ttlMs: 1_000, requestedAt: now() }), { kind: "conflict", code: "run_attempt_conflict" });
      assert.deepEqual(await store.startModelStep({
        runId: "run", attemptId: "attempt-recovered", leaseToken: "bypass-token", modelStepId: "bypass-step",
        requestFingerprint: hashBytes("bypass"), startedAt: now(),
      }), { kind: "conflict", code: "lease_not_held" });
      assert.equal((await store.createRunAttempt({
        sessionId: "session", turnId: "turn", runId: "run", attemptId: "attempt-illegal-third", expectedLatestAttemptNumber: 2,
        catalogHash: "catalog", intentRevision: 1, ownerId: "bypass", ttlMs: 1_000, createdAt: now(), requestedAt: now(),
      })).kind, "conflict");
        assert.equal((await store.appendEvents({
          runId: "run", attemptId: "attempt-recovered", leaseToken: claimed.lease.leaseToken, expectedSequence: firstPrefix.length,
          events: [{ schemaVersion: "meliora.session-event.v1", eventId: `attempt-two-${secondStatus}`, kind: "run_status_changed", visibility: "public", payload: { status: secondStatus }, createdAt: now() }],
        })).kind, "appended");
        current += 1_001;
        const reclaimed = await store.reclaimInitialPreDispatchExecutionAuthority(reclaimInput("accepted", sequence, now));
        assert.equal(reclaimed.kind, "reclaimed");
        if (reclaimed.kind !== "reclaimed") throw new Error("reclaim_expected");
        assert.equal(reclaimed.continuation.status, secondStatus);
        const bundle = await store.readRecoveryBundle({ runId: "run", eventLimit: 8 });
        assert.equal(bundle.kind, "found");
        if (bundle.kind === "found") assert.equal(bundle.bundle.latestAttemptNumber, 2);
      } finally { store.close?.(); }
    });
  }
}

for (const [name, create] of adapters) {
  test(`${name} C.2b rejects a drifted #1 prefix watermark before reclaim`, async (t) => {
    let current = Date.parse(timestamp());
    const now = () => new Date(current).toISOString();
    const store = create(() => current, t);
    try {
      await reserveAndExpireInitialLease(store, now, (milliseconds) => { current += milliseconds; }, "accepted", ["preparing"]);
      const claimed = await store.claimInitialPreDispatchRunCommandForRecovery(claimInput("accepted", 1, now));
      assert.equal(claimed.kind, "claimed");
      if (claimed.kind !== "claimed") throw new Error("claim_expected");
      assert.equal((await store.appendEvents({
        runId: "run", attemptId: "attempt-recovered", leaseToken: claimed.lease.leaseToken, expectedSequence: 1,
        events: [{ schemaVersion: "meliora.session-event.v1", eventId: "attempt-two-model", kind: "run_status_changed", visibility: "public", payload: { status: "model_streaming" }, createdAt: now() }],
      })).kind, "appended");
      if (store instanceof MemorySessionStore) {
        const raw = store as unknown as { attempts: Map<string, { lastEventSequence: number }> };
        const initial = raw.attempts.get("run\u0000attempt-initial")!;
        raw.attempts.set("run\u0000attempt-initial", { ...initial, lastEventSequence: 0 });
      } else {
        const db = (store as unknown as { db: Database.Database }).db;
        db.prepare("UPDATE run_attempts SET last_event_sequence=0 WHERE run_id=? AND attempt_id=?").run("run", "attempt-initial");
      }
      current += 1_001;
      assert.deepEqual(await store.reclaimInitialPreDispatchExecutionAuthority(reclaimInput("accepted", 2, now)), { kind: "conflict", code: "initial_recovery_not_safe" });
    } finally { (store as Store).close?.(); }
  });
}

// The recovery Attempt #2 is a closed window even when its evidence has
// become unsafe.  Otherwise a malformed prefix could deliberately make the
// proof fail and then reacquire a generic lease to start a Model Step.
for (const [name, create] of adapters) {
  test(`${name} C.2b unsafe Attempt #2 prefix cannot reopen generic execution`, async (t) => {
    let current = Date.parse(timestamp());
    const now = () => new Date(current).toISOString();
    const store = create(() => current, t);
    try {
      await reserveAndExpireInitialLease(store, now, (milliseconds) => { current += milliseconds; }, "accepted");
      const claimed = await store.claimInitialPreDispatchRunCommandForRecovery(claimInput("accepted", 0, now));
      assert.equal(claimed.kind, "claimed");
      if (claimed.kind !== "claimed") throw new Error("claim_expected");
      assert.equal((await store.appendEvents({
        runId: "run", attemptId: "attempt-recovered", leaseToken: claimed.lease.leaseToken, expectedSequence: 0,
        events: [{ schemaVersion: "meliora.session-event.v1", eventId: "unsafe-attempt-two-prefix", kind: "run_status_changed", visibility: "public", payload: { status: "verifying" }, createdAt: now() }],
      })).kind, "appended");
      current += 1_001;
      assert.deepEqual(await store.acquireLease({
        runId: "run", attemptId: "attempt-recovered", ownerId: "bypass", ttlMs: 1_000, requestedAt: now(),
      }), { kind: "conflict", code: "run_attempt_conflict" });
      assert.deepEqual(await store.startModelStep({
        runId: "run", attemptId: "attempt-recovered", leaseToken: "bypass-token", modelStepId: "bypass-step",
        requestFingerprint: hashBytes("bypass"), startedAt: now(),
      }), { kind: "conflict", code: "lease_not_held" });
      assert.deepEqual(await store.createRunAttempt({
        sessionId: "session", turnId: "turn", runId: "run", attemptId: "attempt-illegal-third", expectedLatestAttemptNumber: 2,
        catalogHash: "catalog", intentRevision: 1, ownerId: "bypass", ttlMs: 1_000, createdAt: now(), requestedAt: now(),
      }), { kind: "conflict", code: "run_attempt_conflict", latestAttemptNumber: 2 });
      assert.deepEqual(await store.reclaimInitialPreDispatchExecutionAuthority(reclaimInput("accepted", 1, now)), {
        kind: "conflict", code: "initial_recovery_not_safe",
      });
    } finally { store.close?.(); }
  });
}

// Generic entry points identify the recovery window structurally, while the
// reclaim primitive independently validates its proof.  Tampering any proof
// field must therefore fail closed rather than make a generic lease available.
for (const [name, create] of adapters) {
  for (const [label, target, value] of [
    ["#1 status", "attempt-initial", "failed"],
    ["#1 runtime state", "attempt-initial", "{\"tampered\":true}"],
    ["#2 status", "attempt-recovered", "failed"],
    ["#2 runtime state", "attempt-recovered", "{\"tampered\":true}"],
  ] as const) {
    test(`${name} C.2b ${label} drift cannot reopen generic authority`, async (t) => {
      let current = Date.parse(timestamp());
      const now = () => new Date(current).toISOString();
      const store = create(() => current, t);
      try {
        await reserveAndExpireInitialLease(store, now, (milliseconds) => { current += milliseconds; }, "accepted");
        const claimed = await store.claimInitialPreDispatchRunCommandForRecovery(claimInput("accepted", 0, now));
        assert.equal(claimed.kind, "claimed");
        if (claimed.kind !== "claimed") throw new Error("claim_expected");
        if (store instanceof MemorySessionStore) {
          const raw = store as unknown as { attempts: Map<string, Record<string, unknown>> };
          const key = `run\u0000${target}`;
          const attempt = raw.attempts.get(key)!;
          raw.attempts.set(key, {
            ...attempt,
            ...(label.includes("status") ? { status: value } : { runtimeState: JSON.parse(value) }),
          });
        } else {
          const db = (store as unknown as { db: Database.Database }).db;
          if (label.includes("status")) {
            db.prepare("UPDATE run_attempts SET status=? WHERE run_id=? AND attempt_id=?").run(value, "run", target);
          } else {
            db.prepare("UPDATE run_attempts SET runtime_state_json=? WHERE run_id=? AND attempt_id=?").run(value, "run", target);
          }
        }
        current += 1_001;
        assert.deepEqual(await store.acquireLease({
          runId: "run", attemptId: "attempt-recovered", ownerId: "bypass", ttlMs: 1_000, requestedAt: now(),
        }), { kind: "conflict", code: "run_attempt_conflict" });
        assert.deepEqual(await store.createRunAttempt({
          sessionId: "session", turnId: "turn", runId: "run", attemptId: "attempt-illegal-third", expectedLatestAttemptNumber: 2,
          catalogHash: "catalog", intentRevision: 1, ownerId: "bypass", ttlMs: 1_000, createdAt: now(), requestedAt: now(),
        }), { kind: "conflict", code: "run_attempt_conflict", latestAttemptNumber: 2 });
      } finally { (store as Store).close?.(); }
    });
  }
}

// A recovery suffix may begin only once: #1 prefix events, followed by #2.
// A corrupted #2 -> #1 ownership reversal must not pass the exact prefix
// proof merely because both IDs belong to the same Run.
for (const [name, create] of adapters) {
  test(`${name} C.2b rejects reversed #2 to #1 prefix ownership`, async (t) => {
    let current = Date.parse(timestamp());
    const now = () => new Date(current).toISOString();
    const store = create(() => current, t);
    try {
      await reserveAndExpireInitialLease(store, now, (milliseconds) => { current += milliseconds; }, "accepted");
      const claimed = await store.claimInitialPreDispatchRunCommandForRecovery(claimInput("accepted", 0, now));
      assert.equal(claimed.kind, "claimed");
      if (claimed.kind !== "claimed") throw new Error("claim_expected");
      assert.equal((await store.appendEvents({
        runId: "run", attemptId: "attempt-recovered", leaseToken: claimed.lease.leaseToken, expectedSequence: 0,
        events: [{ schemaVersion: "meliora.session-event.v1", eventId: "attempt-two-preparing", kind: "run_status_changed", visibility: "public", payload: { status: "preparing" }, createdAt: now() }],
      })).kind, "appended");
      if (store instanceof MemorySessionStore) {
        const raw = store as unknown as {
          attempts: Map<string, Record<string, unknown>>;
          events: Map<string, Array<Record<string, unknown>>>;
        };
        const events = raw.events.get("run")!;
        events.push({
          ...events[0]!, eventId: "attempt-one-model-after-two", attemptId: "attempt-initial", sequence: 2,
          payload: { status: "model_streaming" }, createdAt: now(),
        });
        for (const id of ["attempt-initial", "attempt-recovered"]) {
          const key = `run\u0000${id}`;
          raw.attempts.set(key, { ...raw.attempts.get(key)!, lastEventSequence: 2 });
        }
      } else {
        const db = (store as unknown as { db: Database.Database }).db;
        const reverse = {
          schemaVersion: "meliora.session-event.v1", eventId: "attempt-one-model-after-two", runId: "run", attemptId: "attempt-initial", sequence: 2,
          kind: "run_status_changed", visibility: "public", payload: { status: "model_streaming" }, createdAt: now(),
        };
        const payload = JSON.stringify(reverse.payload);
        db.prepare("INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(
          reverse.eventId, reverse.runId, reverse.attemptId, reverse.sequence, reverse.schemaVersion, reverse.kind, reverse.visibility,
          payload, hashBytes(canonicalJson(reverse)), reverse.createdAt, null, null,
        );
        db.prepare("UPDATE run_attempts SET last_event_sequence=2 WHERE run_id=? AND attempt_id IN (?,?)")
          .run("run", "attempt-initial", "attempt-recovered");
      }
      current += 1_001;
      assert.deepEqual(await store.reclaimInitialPreDispatchExecutionAuthority(reclaimInput("accepted", 2, now)), {
        kind: "conflict", code: "initial_recovery_not_safe",
      });
    } finally { (store as Store).close?.(); }
  });
}

// C.2b must survive a second crash after C.2a's atomic claim but before a
// worker begins.  The only safe repair is a new lease on the same pristine
// Attempt #2: never mint an Attempt #3, and never accept an unexpired token.
for (const [name, create] of adapters) {
  test(`${name} C.2b reclaims only expired pristine Attempt #2 without creating #3`, async (t) => {
    let current = Date.parse(timestamp());
    const now = () => new Date(current).toISOString();
    const store = create(() => current, t);
    try {
      await reserveAndExpireInitialLease(store, now, (milliseconds) => { current += milliseconds; }, "accepted", ["preparing"]);
      const claimed = await store.claimInitialPreDispatchRunCommandForRecovery(claimInput("accepted", 1, now));
      assert.equal(claimed.kind, "claimed");
      assert.deepEqual(await store.reclaimInitialPreDispatchExecutionAuthority(reclaimInput("accepted", 1, now)), { kind: "conflict", code: "lease_held" });
      current += 1_001;
      const reclaimed = await store.reclaimInitialPreDispatchExecutionAuthority(reclaimInput("accepted", 1, now));
      assert.equal(reclaimed.kind, "reclaimed");
      if (reclaimed.kind !== "reclaimed") throw new Error("reclaim_expected");
      assert.equal(reclaimed.attempt.attemptId, "attempt-recovered");
      const bundle = await store.readRecoveryBundle({ runId: "run", eventLimit: 10 });
      assert.equal(bundle.kind, "found");
      if (bundle.kind !== "found") throw new Error("bundle_expected");
      assert.equal(bundle.bundle.activeAttempt.attemptId, "attempt-recovered");
      assert.equal(bundle.bundle.latestAttemptNumber, 2);
      assert.equal((await store.readEvents({ runId: "run", afterSequence: 0, limit: 10 })).events.length, 1);
    } finally { store.close?.(); }
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

// `created + null` is part of the proof that Attempt #1 never crossed the
// outbound boundary. Both drifts must fail before the atomic claim writes any
// replacement authority. The nested loops intentionally produce four attacks:
// status/runtimeState across Memory and SQLite.
for (const [name, create] of adapters) {
  for (const drift of ["status", "runtime_state"] as const) {
    test(`${name} C.2a rejects initial Attempt ${drift} drift without writes`, async (t) => {
      let current = Date.parse(timestamp());
      const now = () => new Date(current).toISOString();
      const store = create(() => current, t);
      try {
        await reserveAndExpireInitialLease(store, now, (milliseconds) => { current += milliseconds; }, "accepted");
        if (store instanceof MemorySessionStore) {
          const raw = store as unknown as {
            attempts: Map<string, { status: string; runtimeState: unknown }>;
          };
          const initial = raw.attempts.get("run\u0000attempt-initial");
          assert.ok(initial);
          raw.attempts.set("run\u0000attempt-initial", drift === "status"
            ? { ...initial, status: "executing" }
            : { ...initial, runtimeState: { phase: "tampered" } });
        } else {
          const db = (store as unknown as { db: Database.Database }).db;
          if (drift === "status") {
            db.prepare("UPDATE run_attempts SET status=? WHERE run_id=? AND attempt_id=?").run("executing", "run", "attempt-initial");
          } else {
            db.prepare("UPDATE run_attempts SET runtime_state_json=? WHERE run_id=? AND attempt_id=?")
              .run('{"phase":"tampered"}', "run", "attempt-initial");
          }
        }
        const before = recoveryAuthoritySnapshot(store);
        assert.deepEqual(await store.claimInitialPreDispatchRunCommandForRecovery(claimInput("accepted", 0, now)), { kind: "conflict", code: "initial_recovery_not_safe" });
        assert.deepEqual(recoveryAuthoritySnapshot(store), before);
      } finally { (store as Store).close?.(); }
    });
  }
}

// SQLite stores the pristine runtime state as the exact canonical JSON text
// `null`. Semantic JSON equivalence is insufficient here: whitespace is a
// storage drift signal and must also leave all authority rows untouched.
test("sqlite C.2a rejects noncanonical null runtime state without writes", async (t) => {
  let current = Date.parse(timestamp());
  const now = () => new Date(current).toISOString();
  const store = new SqliteSessionStore(createTempDatabase(t), { clock: () => new Date(current) });
  try {
    await reserveAndExpireInitialLease(store, now, (milliseconds) => { current += milliseconds; }, "accepted");
    const db = (store as unknown as { db: Database.Database }).db;
    db.prepare("UPDATE run_attempts SET runtime_state_json=? WHERE run_id=? AND attempt_id=?")
      .run(" null ", "run", "attempt-initial");
    const before = recoveryAuthoritySnapshot(store);
    assert.deepEqual(await store.claimInitialPreDispatchRunCommandForRecovery(claimInput("accepted", 0, now)), { kind: "conflict", code: "initial_recovery_not_safe" });
    assert.deepEqual(recoveryAuthoritySnapshot(store), before);
  } finally { store.close(); }
});

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
