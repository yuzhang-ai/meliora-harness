import assert from "node:assert/strict";

import { MemorySessionStore } from "../../packages/session-store/memory-session-store";
import type { NormalizedToolInvocation, ToolReceipt } from "../../packages/tool-runtime/contracts";

let now = Date.parse("2026-09-10T08:00:00.000Z");
const timestamp = () => new Date(now).toISOString();
const store = new MemorySessionStore({ clock: () => new Date(now) });

const invocation: NormalizedToolInvocation = {
  schemaVersion: "meliora.tool-invocation.v1",
  invocationId: "invocation-1",
  runId: "run-1",
  attemptId: "attempt-1",
  toolName: "read_file",
  toolVersion: "v1",
  arguments: { path: "README.md" },
  argumentsHash: "arguments-hash",
  catalogHash: "catalog-hash",
  idempotencyKey: "idempotency-1",
  status: "reserved",
};

const receipt: ToolReceipt = {
  schemaVersion: "meliora.tool-receipt.v1",
  receiptId: "receipt-1",
  invocationId: invocation.invocationId,
  runId: invocation.runId,
  attemptId: invocation.attemptId,
  toolName: invocation.toolName,
  toolVersion: invocation.toolVersion,
  argumentsHash: invocation.argumentsHash,
  catalogHash: invocation.catalogHash,
  decision: "allow",
  startedAt: timestamp(),
  endedAt: timestamp(),
  status: "succeeded",
  effectSummary: "read README.md",
  verificationArtifactIds: [],
  redactions: [],
};

await store.createSession({ sessionId: "session-1", workspaceId: "workspace-1", createdAt: timestamp() });
await store.createTurn({ sessionId: "session-1", turnId: "turn-1", intentRevision: 1, createdAt: timestamp() });
await store.createRun({
  sessionId: "session-1",
  turnId: "turn-1",
  runId: "run-1",
  initialAttemptId: "attempt-1",
  catalogHash: "catalog-hash",
  intentRevision: 1,
  createdAt: timestamp(),
});

const initialLease = await store.acquireLease({
  runId: "run-1",
  attemptId: "attempt-1",
  ownerId: "worker-1",
  ttlMs: 1_000,
  requestedAt: timestamp(),
});
assert.equal(initialLease.kind, "acquired");
if (initialLease.kind !== "acquired") throw new Error("expected initial lease");

const appended = await store.appendEvents({
  runId: "run-1",
  attemptId: "attempt-1",
  expectedSequence: 0,
  leaseToken: initialLease.leaseToken,
  events: [{
    schemaVersion: "meliora.session-event.v1",
    eventId: "event-1",
    kind: "turn_started",
    visibility: "private",
    payload: { goal: "test" },
    createdAt: timestamp(),
  }],
});
assert.deepEqual(appended, {
  kind: "appended",
  events: [{
    schemaVersion: "meliora.session-event.v1",
    eventId: "event-1",
    runId: "run-1",
    attemptId: "attempt-1",
    sequence: 1,
    kind: "turn_started",
    visibility: "private",
    payload: { goal: "test" },
    createdAt: timestamp(),
  }],
  lastSequence: 1,
});
assert.deepEqual(await store.appendEvents({ ...{
  runId: "run-1", attemptId: "attempt-1", expectedSequence: 0, leaseToken: initialLease.leaseToken,
}, events: [] }), { kind: "conflict", code: "event_sequence_conflict", currentSequence: 1 });

const reserved = await store.reserveInvocation({ invocation, leaseToken: initialLease.leaseToken, reservedAt: timestamp() });
assert.equal(reserved.kind, "owner");
if (reserved.kind !== "owner") throw new Error("expected reservation owner");
assert.deepEqual(await store.commitReceipt({
  runId: "run-1", attemptId: "attempt-1", leaseToken: initialLease.leaseToken, reservationId: reserved.reservationId, receipt,
}), { kind: "committed", receiptId: "receipt-1" });
assert.deepEqual(await store.commitReceipt({
  runId: "run-1", attemptId: "attempt-1", leaseToken: initialLease.leaseToken, reservationId: reserved.reservationId, receipt,
}), { kind: "replay", receiptId: "receipt-1" });

const recoveryInvocation: NormalizedToolInvocation = {
  ...invocation,
  invocationId: "invocation-2",
  idempotencyKey: "idempotency-2",
};
const recoveryReservation = await store.reserveInvocation({
  invocation: recoveryInvocation,
  leaseToken: initialLease.leaseToken,
  reservedAt: timestamp(),
});
assert.equal(recoveryReservation.kind, "owner");
if (recoveryReservation.kind !== "owner") throw new Error("expected recovery reservation owner");
const recoveryReceipt: ToolReceipt = {
  ...receipt,
  receiptId: "receipt-2",
  invocationId: recoveryInvocation.invocationId,
};
for (const tamperedReceipt of [
  { ...recoveryReceipt, toolName: "write_file" },
  { ...recoveryReceipt, toolVersion: "v2" },
  { ...recoveryReceipt, argumentsHash: "tampered-arguments-hash" },
  { ...recoveryReceipt, catalogHash: "tampered-catalog-hash" },
]) {
  assert.deepEqual(await store.commitReceipt({
    runId: "run-1", attemptId: "attempt-1", leaseToken: initialLease.leaseToken,
    reservationId: recoveryReservation.reservationId, receipt: tamperedReceipt,
  }), { kind: "conflict", code: "receipt_conflict" });
}

const replay = await store.reserveInvocation({ invocation, leaseToken: "stale-token", reservedAt: timestamp() });
assert.equal(replay.kind, "replay");
if (replay.kind !== "replay") throw new Error("expected reservation replay");
assert.equal(replay.invocation.invocationId, invocation.invocationId);
assert.equal(replay.receipt?.receiptId, receipt.receiptId);
assert.equal((await store.readInvocation({ runId: "run-1", attemptId: "attempt-1", invocationId: "invocation-1" }))?.status, "succeeded");
assert.equal((await store.readReservation({ runId: "run-1", attemptId: "attempt-1", invocationId: "invocation-1" }))?.reservationId, reserved.reservationId);
assert.equal((await store.readReceipt({ runId: "run-1", attemptId: "attempt-1", receiptId: "receipt-1" }))?.receiptId, receipt.receiptId);
assert.equal((await store.readEvents({ runId: "run-1", afterSequence: 0, limit: 10 })).events.length, 1);

assert.deepEqual(await store.createRunAttempt({
  sessionId: "session-1", turnId: "turn-1", runId: "run-1", attemptId: "attempt-2", expectedLatestAttemptNumber: 1,
  catalogHash: "catalog-hash", intentRevision: 1, createdAt: timestamp(), ownerId: "worker-2", ttlMs: 1_000, requestedAt: timestamp(),
}), { kind: "conflict", code: "lease_held", latestAttemptNumber: 1, expiresAt: initialLease.expiresAt });

now += 1_000;
assert.deepEqual(await store.createRunAttempt({
  sessionId: "session-1", turnId: "turn-1", runId: "run-1", attemptId: "attempt-2", expectedLatestAttemptNumber: 0,
  catalogHash: "catalog-hash", intentRevision: 1, createdAt: timestamp(), ownerId: "worker-2", ttlMs: 1_000, requestedAt: timestamp(),
}), { kind: "conflict", code: "run_attempt_conflict", latestAttemptNumber: 1 });
for (const forgedAttempt of [
  { attemptId: "attempt-1" },
  { sessionId: "session-forged" },
  { turnId: "turn-forged" },
  { catalogHash: "catalog-forged" },
  { intentRevision: 2 },
]) {
  assert.deepEqual(await store.createRunAttempt({
    sessionId: "session-1", turnId: "turn-1", runId: "run-1", attemptId: "attempt-2", expectedLatestAttemptNumber: 1,
    catalogHash: "catalog-hash", intentRevision: 1, createdAt: timestamp(), ownerId: "worker-2", ttlMs: 1_000, requestedAt: timestamp(),
    ...forgedAttempt,
  }), { kind: "conflict", code: "run_attempt_conflict", latestAttemptNumber: 1 });
}
const nextAttempt = await store.createRunAttempt({
  sessionId: "session-1", turnId: "turn-1", runId: "run-1", attemptId: "attempt-2", expectedLatestAttemptNumber: 1,
  catalogHash: "catalog-hash", intentRevision: 1, createdAt: timestamp(), ownerId: "worker-2", ttlMs: 1_000, requestedAt: timestamp(),
});
assert.equal(nextAttempt.kind, "created");
if (nextAttempt.kind !== "created") throw new Error("expected second attempt");
assert.equal(nextAttempt.attempt.attemptNumber, 2);
assert.equal(nextAttempt.attempt.lastEventSequence, 1);
assert.match(nextAttempt.lease.leaseToken, /^lease-/u);
assert.deepEqual(await store.acquireLease({
  runId: "run-1",
  attemptId: "attempt-1",
  ownerId: "worker-1",
  ttlMs: 1_000,
  requestedAt: timestamp(),
}), { kind: "conflict", code: "run_attempt_conflict" });
const unknownAttemptId = "attempt-not-found";
const unknownAttemptInvocation: NormalizedToolInvocation = {
  ...invocation,
  invocationId: "invocation-not-found",
  attemptId: unknownAttemptId,
  idempotencyKey: "idempotency-not-found",
};
assert.deepEqual(await store.acquireLease({
  runId: "run-1",
  attemptId: unknownAttemptId,
  ownerId: "worker-unknown",
  ttlMs: 1_000,
  requestedAt: timestamp(),
}), { kind: "conflict", code: "run_attempt_conflict" });
assert.deepEqual(await store.reserveInvocation({
  invocation: unknownAttemptInvocation,
  leaseToken: "lease-not-found",
  reservedAt: timestamp(),
}), { kind: "conflict", code: "run_attempt_conflict" });
assert.deepEqual(await store.commitReceipt({
  runId: "run-1",
  attemptId: unknownAttemptId,
  leaseToken: "lease-not-found",
  reservationId: "reservation-not-found",
  receipt: { ...receipt, attemptId: unknownAttemptId },
}), { kind: "conflict", code: "run_attempt_conflict" });
const reconciled = await store.readInvocationByIdempotencyKey({
  runId: "run-1",
  idempotencyKey: recoveryInvocation.idempotencyKey,
});
assert.equal(reconciled?.reservation.reservationId, recoveryReservation.reservationId);
assert.equal(reconciled?.reservation.attemptId, "attempt-1");
assert.equal(reconciled?.invocation.invocationId, recoveryInvocation.invocationId);
assert.equal(reconciled?.receipt, null);
assert.deepEqual(await store.commitReceipt({
  runId: "run-1", attemptId: "attempt-2", leaseToken: nextAttempt.lease.leaseToken,
  reservationId: recoveryReservation.reservationId, receipt: recoveryReceipt,
}), { kind: "conflict", code: "invocation_reservation_conflict" });
assert.deepEqual(await store.appendEvents({
  runId: "run-1", attemptId: "attempt-1", expectedSequence: 1, leaseToken: initialLease.leaseToken, events: [],
}), { kind: "conflict", code: "lease_expired" });
assert.deepEqual(await store.commitReceipt({
  runId: "run-1", attemptId: "attempt-1", leaseToken: initialLease.leaseToken, reservationId: reserved.reservationId, receipt,
}), { kind: "conflict", code: "lease_expired" });
now += 1_000;
assert.deepEqual(await store.acquireLease({
  runId: "run-1",
  attemptId: "attempt-1",
  ownerId: "worker-1",
  ttlMs: 1_000,
  requestedAt: timestamp(),
}), { kind: "conflict", code: "run_attempt_conflict" });

console.log(JSON.stringify({
  gate: "session-store-contract",
  status: "PASS",
  expectedSequenceCas: true,
  leaseExpiryRejectsAppendAndCommit: true,
  reservationReplayRecoversInvocationAndReceipt: true,
  recoveryReads: true,
  activeLeaseBlocksRecoveryAndExpiredLeaseTransfersAtomically: true,
  supersededAttemptCannotReacquireLease: true,
  fabricatedAttemptCannotAcquireLeaseOrWrite: true,
  attemptRecoveryRejectsDuplicateAndForgedAuthorization: true,
  attemptReconcilesPriorReservationReadOnly: true,
  receiptMatchesReservedInvocation: true,
}));
