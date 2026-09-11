import assert from "node:assert/strict";
import test from "node:test";
import { hashBytes } from "../src/integrity.js";
import { IdempotencyConflictError } from "../src/errors.js";
import { SqliteSessionStore } from "../src/sqlite-session-store.js";
import { createTempDatabase, event, invocation, receipt, seed, timestamp } from "./helpers.js";

test("implements frozen port with durable replay, snapshot and server resolver", async (t) => {
  const path = createTempDatabase(t);
  let now = Date.parse(timestamp());
  const store = new SqliteSessionStore(path, { clock: () => new Date(now), nonce: (() => { let n = 0; return () => `token-${++n}`; })() });
  const lease = await seed(store);
  const appended = await store.appendEvents({ runId: "run-1", attemptId: "attempt-1", expectedSequence: 0, leaseToken: lease.leaseToken, events: [event("event-1"), event("event-2", "private")] });
  assert.equal(appended.kind, "appended");
  assert.deepEqual(await store.appendEvents({ runId: "run-1", attemptId: "attempt-1", expectedSequence: 0, leaseToken: lease.leaseToken, events: [] }), { kind: "conflict", code: "event_sequence_conflict", currentSequence: 2 });
  await store.writeSnapshot({ snapshot: { schemaVersion: "meliora.run-snapshot.v1", snapshotId: "snapshot-1", runId: "run-1", attemptId: "attempt-1", throughSequence: 2, state: { status: "running" }, createdAt: timestamp(2) }, expectedSequence: 2, leaseToken: lease.leaseToken });
  const content = new TextEncoder().encode("verification output");
  await store.putArtifact({ artifactId: "artifact-1", contentHash: hashBytes(content), mediaType: "text/plain", content, visibility: "private", metadata: { source: "test" }, createdAt: timestamp(3) });
  assert.equal(await store.readRunSessionId("run-1"), "session-1");
  store.close();

  const reopened = new SqliteSessionStore(path, { clock: () => new Date(now) });
  assert.deepEqual((await reopened.readEvents({ runId: "run-1", afterSequence: 0, limit: 1 })).events.map((item) => item.eventId), ["event-1"]);
  assert.equal((await reopened.readEvents({ runId: "run-1", afterSequence: 0, limit: 1 })).nextSequence, 1);
  assert.equal((await reopened.readSnapshot("run-1"))?.snapshotId, "snapshot-1");
  assert.deepEqual((await reopened.getArtifact("artifact-1"))?.metadata, { source: "test" });
  reopened.close();
});

test("reservation is idempotent across crash and receipt commit is durable", async (t) => {
  const path = createTempDatabase(t); let now = Date.parse(timestamp());
  const store = new SqliteSessionStore(path, { clock: () => new Date(now), nonce: () => "reservation-1" });
  const lease = await seed(store); const call = invocation();
  const owner = await store.reserveInvocation({ invocation: call, leaseToken: lease.leaseToken, reservedAt: timestamp() });
  assert.deepEqual(owner, { kind: "owner", reservationId: "reservation-1" });
  store.close();
  const recovered = new SqliteSessionStore(path, { clock: () => new Date(now) });
  const replay = await recovered.reserveInvocation({ invocation: call, leaseToken: "stale", reservedAt: timestamp() });
  assert.equal(replay.kind, "replay"); assert.equal(replay.kind === "replay" ? replay.receipt : undefined, null);
  const committed = await recovered.commitReceipt({ runId: "run-1", attemptId: "attempt-1", leaseToken: lease.leaseToken, reservationId: "reservation-1", receipt: receipt() });
  assert.deepEqual(committed, { kind: "committed", receiptId: "receipt-invocation-1" });
  assert.deepEqual(await recovered.commitReceipt({ runId: "run-1", attemptId: "attempt-1", leaseToken: lease.leaseToken, reservationId: "reservation-1", receipt: receipt() }), { kind: "replay", receiptId: "receipt-invocation-1" });
  assert.equal((await recovered.readInvocationByIdempotencyKey({ runId: "run-1", idempotencyKey: call.idempotencyKey }))?.receipt?.status, "succeeded");
  assert.deepEqual(await recovered.reserveInvocation({ invocation: { ...call, argumentsHash: "changed" }, leaseToken: "stale", reservedAt: timestamp() }), { kind: "conflict", code: "idempotency_key_conflict" });

  const secondCall = invocation("invocation-2");
  const secondReservation = await recovered.reserveInvocation({
    invocation: secondCall,
    leaseToken: lease.leaseToken,
    reservedAt: timestamp(),
  });
  assert.equal(secondReservation.kind, "owner");
  if (secondReservation.kind !== "owner") throw new Error("expected second reservation owner");
  assert.deepEqual(await recovered.commitReceipt({
    runId: "run-1",
    attemptId: "attempt-1",
    leaseToken: lease.leaseToken,
    reservationId: secondReservation.reservationId,
    receipt: { ...receipt("invocation-2"), receiptId: "receipt-invocation-1" },
  }), { kind: "conflict", code: "receipt_conflict" });
  recovered.close();
});

test("recovery distinguishes crashes before execution, during execution and after receipt", async (t) => {
  const path = createTempDatabase(t);
  let now = Date.parse(timestamp());
  const clock = () => new Date(now);
  const first = new SqliteSessionStore(path, {
    clock,
    nonce: (() => { let value = 0; return () => `recovery-${++value}`; })(),
  });
  const firstLease = await seed(first);

  const beforeExecution = invocation("before-execution");
  assert.equal((await first.reserveInvocation({
    invocation: beforeExecution,
    leaseToken: firstLease.leaseToken,
    reservedAt: timestamp(),
  })).kind, "owner");

  const duringExecution = { ...invocation("during-execution"), status: "executing" as const };
  const duringReservation = await first.reserveInvocation({
    invocation: duringExecution,
    leaseToken: firstLease.leaseToken,
    reservedAt: timestamp(),
  });
  assert.equal(duringReservation.kind, "owner");

  const afterReceipt = invocation("after-receipt");
  const afterReservation = await first.reserveInvocation({
    invocation: afterReceipt,
    leaseToken: firstLease.leaseToken,
    reservedAt: timestamp(),
  });
  assert.equal(afterReservation.kind, "owner");
  if (afterReservation.kind !== "owner") throw new Error("expected receipt reservation owner");
  assert.equal((await first.commitReceipt({
    runId: "run-1",
    attemptId: "attempt-1",
    leaseToken: firstLease.leaseToken,
    reservationId: afterReservation.reservationId,
    receipt: receipt("after-receipt"),
  })).kind, "committed");
  first.close();

  now += 10_000;
  const recovered = new SqliteSessionStore(path, { clock });
  const nextAttempt = await recovered.createRunAttempt({
    sessionId: "session-1",
    turnId: "turn-1",
    runId: "run-1",
    attemptId: "attempt-2",
    expectedLatestAttemptNumber: 1,
    catalogHash: "catalog-hash",
    intentRevision: 1,
    createdAt: timestamp(10_000),
    ownerId: "worker-2",
    ttlMs: 10_000,
    requestedAt: timestamp(10_000),
  });
  assert.equal(nextAttempt.kind, "created");
  if (nextAttempt.kind !== "created") throw new Error("expected recovery attempt");

  const beforeReadback = await recovered.readInvocationByIdempotencyKey({
    runId: "run-1",
    idempotencyKey: beforeExecution.idempotencyKey,
  });
  assert.equal(beforeReadback?.invocation.status, "reserved");
  assert.equal(beforeReadback?.receipt, null);

  const duringReadback = await recovered.readInvocationByIdempotencyKey({
    runId: "run-1",
    idempotencyKey: duringExecution.idempotencyKey,
  });
  assert.equal(duringReadback?.invocation.status, "executing");
  assert.equal(duringReadback?.receipt, null);
  if (duringReservation.kind !== "owner") throw new Error("expected execution reservation owner");
  assert.deepEqual(await recovered.commitReceipt({
    runId: "run-1",
    attemptId: "attempt-2",
    leaseToken: nextAttempt.lease.leaseToken,
    reservationId: duringReservation.reservationId,
    receipt: receipt("during-execution"),
  }), { kind: "conflict", code: "invocation_reservation_conflict" });

  const completedReplay = await recovered.reserveInvocation({
    invocation: afterReceipt,
    leaseToken: "stale-token",
    reservedAt: timestamp(10_000),
  });
  assert.equal(completedReplay.kind, "replay");
  assert.equal(completedReplay.kind === "replay" ? completedReplay.receipt?.receiptId : null, "receipt-after-receipt");
  recovered.close();
});

test("lease expiry gates writes and transfers recovery attempt atomically", async (t) => {
  let now = Date.parse(timestamp()); const store = new SqliteSessionStore(createTempDatabase(t), { clock: () => new Date(now), nonce: (() => { let n = 0; return () => `lease-${++n}`; })() });
  const lease = await seed(store);
  assert.equal((await store.createRunAttempt({ sessionId: "session-1", turnId: "turn-1", runId: "run-1", attemptId: "attempt-2", expectedLatestAttemptNumber: 1, catalogHash: "catalog-hash", intentRevision: 1, createdAt: timestamp(), ownerId: "worker-2", ttlMs: 10_000, requestedAt: timestamp() })).kind, "conflict");
  now += 10_000;
  assert.deepEqual(await store.appendEvents({ runId: "run-1", attemptId: "attempt-1", expectedSequence: 0, leaseToken: lease.leaseToken, events: [] }), { kind: "conflict", code: "lease_expired" });
  const next = await store.createRunAttempt({ sessionId: "session-1", turnId: "turn-1", runId: "run-1", attemptId: "attempt-2", expectedLatestAttemptNumber: 1, catalogHash: "catalog-hash", intentRevision: 1, createdAt: timestamp(10_000), ownerId: "worker-2", ttlMs: 10_000, requestedAt: timestamp(10_000) });
  assert.equal(next.kind, "created");
  assert.deepEqual(await store.acquireLease({ runId: "run-1", attemptId: "attempt-1", ownerId: "worker-1", ttlMs: 1000, requestedAt: timestamp(10_000) }), { kind: "conflict", code: "run_attempt_conflict" });
  store.close();
});

test("lease expiry is based on the store clock, never caller timestamps", async (t) => {
  let now = Date.parse(timestamp());
  const store = new SqliteSessionStore(createTempDatabase(t), {
    clock: () => new Date(now),
    nonce: (() => { let n = 0; return () => `trusted-clock-${++n}`; })(),
  });
  await store.createSession({ sessionId: "session-1", workspaceId: "workspace-1", createdAt: timestamp() });
  await store.createTurn({ sessionId: "session-1", turnId: "turn-1", intentRevision: 1, createdAt: timestamp() });
  await store.createRun({ sessionId: "session-1", turnId: "turn-1", runId: "run-1", initialAttemptId: "attempt-1", catalogHash: "catalog-hash", intentRevision: 1, createdAt: timestamp() });

  const future = "2099-01-01T00:00:00.000Z";
  const first = await store.acquireLease({ runId: "run-1", attemptId: "attempt-1", ownerId: "worker-1", ttlMs: 1_000, requestedAt: future });
  assert.equal(first.kind, "acquired");
  if (first.kind !== "acquired") throw new Error("expected lease acquisition");
  assert.equal(first.expiresAt, new Date(now + 1_000).toISOString());

  now += 500;
  assert.equal(await store.renewLease({ runId: "run-1", attemptId: "attempt-1", leaseToken: first.leaseToken, ttlMs: 1_000, renewedAt: future }), true);
  now += 1_000;
  const recovered = await store.createRunAttempt({
    sessionId: "session-1",
    turnId: "turn-1",
    runId: "run-1",
    attemptId: "attempt-2",
    expectedLatestAttemptNumber: 1,
    catalogHash: "catalog-hash",
    intentRevision: 1,
    createdAt: future,
    ownerId: "worker-2",
    ttlMs: 1_000,
    requestedAt: future,
  });
  assert.equal(recovered.kind, "created");
  if (recovered.kind !== "created") throw new Error("expected recovery attempt");
  assert.equal(recovered.lease.expiresAt, new Date(now + 1_000).toISOString());
  store.close();
});

test("same-sequence snapshot accepts exact replay and rejects drift", async (t) => {
  const store = new SqliteSessionStore(createTempDatabase(t), { clock: () => new Date(timestamp()) }); const lease = await seed(store);
  const input = { snapshot: { schemaVersion: "meliora.run-snapshot.v1" as const, snapshotId: "snapshot-1", runId: "run-1", attemptId: "attempt-1", throughSequence: 0, state: { value: 1 }, createdAt: timestamp() }, expectedSequence: 0, leaseToken: lease.leaseToken };
  await store.writeSnapshot(input); await store.writeSnapshot(input);
  await assert.rejects(store.writeSnapshot({ ...input, snapshot: { ...input.snapshot, state: { value: 2 } } }), IdempotencyConflictError);
  store.close();
});
