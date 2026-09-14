import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { MemorySessionStore } from "../memory-session-store.js";
import { canonicalRunCommandRequestHash } from "../run-command-contract.js";
import { SensitiveDataError } from "../src/errors.js";
import { assertPersistableText } from "../src/sensitive-data.js";
import { assertValidRunSnapshot, type NewEvent, type PrivateRunSnapshotState, type SessionStorePort } from "../contracts.js";
import { hashBytes } from "../src/integrity.js";
import { SqliteSessionStore } from "../src/sqlite-session-store.js";
import { createTempDatabase, timestamp } from "./helpers.js";

type Store = SessionStorePort & Readonly<{ close?: () => void }>;

const event = (id: string): NewEvent => ({
  schemaVersion: "meliora.session-event.v1",
  eventId: id,
  kind: "recovery_event",
  visibility: "private",
  payload: { id, nested: { stable: true } },
  createdAt: timestamp(),
});

const snapshotState = (): PrivateRunSnapshotState => ({
  schemaVersion: "meliora.private-run-snapshot-state.v1",
  phase: "model_streaming",
  catalogHash: "catalog-hash",
  intentRevision: 1,
  modelHistoryArtifact: {
    artifactId: "history-1",
    contentHash: "a".repeat(64),
    mediaType: "application/json",
    byteLength: 1,
    visibility: "private",
  },
  pendingInvocations: [],
  receiptRefs: [],
  verificationRefs: [],
});

const commandInput = (id: number, createdAt = timestamp(id * 1_000)) => {
  const workspaceId = `workspace-${id}`;
  const userMessage = `recover ${id}`;
  return {
  localPrincipalId: `principal-${id}`,
  workspaceId,
  idempotencyKey: `key-${id}`,
  canonicalRequestHash: canonicalRunCommandRequestHash({ workspaceId, message: userMessage }),
  sessionId: `session-${id}`,
  turnId: `turn-${id}`,
  runId: `run-${id}`,
  attemptId: `attempt-${id}`,
  catalogHash: "catalog-hash",
  intentRevision: 1,
  userMessage,
  reservedAt: createdAt,
  };
};

const snapshotHeaderAttacks = [
  "Bearer opaque-provider-credential",
  "bEaReR\topaque-provider-credential",
  "Bearer abcdefghijklmnop",
  "bEaReR = abcdefghijklmnop",
  "Bearer: opaque-provider-credential",
  "Bearer : opaque-provider-credential",
  "Bearer=opaque-provider-credential",
  "bEaReR = opaque-provider-credential",
  "Cookie: sessionid=opaque-cookie-secret",
  "Set-Cookie: sessionid=opaque-set-cookie-secret; HttpOnly",
  "x-api-key: opaque-api-key-secret",
  "X_API_KEY : opaque-api-key-variant",
  "set_cookie : sessionid=opaque-set-cookie-variant",
] as const;

test("sensitive text recognizes bearer credentials without rejecting ordinary bearer prose", () => {
  for (const value of ["bearer", "bearer:", "bearer=", "bearer of good news", "Bearer abcdefghijklmno"]) {
    assert.doesNotThrow(() => assertPersistableText(value));
  }
  for (const value of snapshotHeaderAttacks.filter((value) => /^bearer/iu.test(value))) {
    assert.throws(() => assertPersistableText(value), SensitiveDataError);
  }
});

const withSnapshotEnvelopeSecurity = (name: string, build: (now: () => number, t: TestContext) => Store) => {
  test(`${name} rejects credential-shaped strings anywhere in a snapshot envelope`, async (t) => {
    const now = Date.parse(timestamp());
    const store = build(() => now, t);
    try {
      const command = commandInput(77);
      assert.equal((await store.reserveRunCommand(command)).kind, "owner");
      const lease = await store.acquireLease({ runId: command.runId, attemptId: command.attemptId, ownerId: "worker", ttlMs: 1_000, requestedAt: timestamp() });
      assert.equal(lease.kind, "acquired");
      if (lease.kind !== "acquired") throw new Error("lease expected");
      const snapshot = {
        schemaVersion: "meliora.run-snapshot.v1" as const,
        snapshotId: "snapshot-security",
        runId: command.runId,
        attemptId: command.attemptId,
        throughSequence: 0,
        state: snapshotState(),
        createdAt: timestamp(),
      };
      for (const field of ["snapshotId", "runId", "attemptId", "createdAt"] as const) {
        for (const value of snapshotHeaderAttacks) {
          await assert.rejects(
            store.writeSnapshot({ snapshot: { ...snapshot, [field]: value }, expectedSequence: 0, leaseToken: lease.leaseToken }),
            SensitiveDataError,
          );
        }
      }
      for (const value of snapshotHeaderAttacks) {
        await assert.rejects(
          store.writeSnapshot({
            snapshot: {
              ...snapshot,
              state: {
                ...snapshotState(),
                modelHistoryArtifact: { ...snapshotState().modelHistoryArtifact, mediaType: value },
              },
            },
            expectedSequence: 0,
            leaseToken: lease.leaseToken,
          }),
          SensitiveDataError,
        );
      }
      assert.equal(await store.readSnapshot(command.runId), null);
    } finally {
      store.close?.();
    }
  });
};

test("RunSnapshot validator rejects malformed envelope fields before adapters persist", () => {
  const snapshot = {
    schemaVersion: "meliora.run-snapshot.v1" as const,
    snapshotId: "snapshot-validator",
    runId: "run-validator",
    attemptId: "attempt-validator",
    throughSequence: 0,
    state: snapshotState(),
    createdAt: timestamp(),
  };
  assert.doesNotThrow(() => assertValidRunSnapshot(snapshot));
  for (const malformed of [
    { ...snapshot, schemaVersion: "meliora.run-snapshot.v0" },
    { ...snapshot, snapshotId: "snapshot invalid" },
    { ...snapshot, runId: "run invalid" },
    { ...snapshot, attemptId: "attempt invalid" },
    { ...snapshot, throughSequence: 0.5 },
    { ...snapshot, throughSequence: Number.MAX_SAFE_INTEGER + 1 },
    { ...snapshot, createdAt: "not-a-time" },
    { ...snapshot, state: { ...snapshotState(), phase: "not-a-phase" } },
  ]) assert.throws(() => assertValidRunSnapshot(malformed));
});

const withStore = (name: string, build: (now: () => number, t: TestContext) => Store) => {
  test(`RecoveryReadPort parity: ${name}`, async (t) => {
    let now = Date.parse(timestamp());
    const store = build(() => now, t);
    try {
      const first = commandInput(1, timestamp(2_000));
      const second = commandInput(2, timestamp(1_000));
      const third = commandInput(3, timestamp(2_000));
      for (const input of [first, second, third]) {
        const reserved = await store.reserveRunCommand(input);
        assert.equal(reserved.kind, "owner");
        if (reserved.kind === "owner") {
          assert.equal(reserved.command.initialAttemptId, input.attemptId);
          assert.equal(reserved.command.attemptId, reserved.command.initialAttemptId);
        }
      }
      const scan = await store.listRecoverableCommands({ limit: 2 });
      assert.deepEqual(scan.commands.map((command) => command.runId), ["run-2", "run-1"]);
      assert.deepEqual(Object.keys(scan.commands[0] ?? {}).sort(), ["createdAt", "initialAttemptId", "runId", "status"]);
      assert.equal(scan.sweepComplete, false);
      assert.equal((await store.listRecoverableCommands({ limit: 3 })).sweepComplete, true);
      await assert.rejects(store.listRecoverableCommands({ limit: 0 }));

      const lease = await store.acquireLease({
        runId: first.runId, attemptId: first.attemptId, ownerId: "worker-1", ttlMs: 1_000, requestedAt: "2099-01-01T00:00:00.000Z",
      });
      assert.equal(lease.kind, "acquired");
      if (lease.kind !== "acquired") throw new Error("lease expected");
      assert.equal(lease.expiresAt, new Date(now + 1_000).toISOString());

      const sourceEvents = [event("event-1"), event("event-2"), event("event-3")];
      const appended = await store.appendEvents({ runId: first.runId, attemptId: first.attemptId, expectedSequence: 0, leaseToken: lease.leaseToken, events: sourceEvents });
      assert.equal(appended.kind, "appended");
      (sourceEvents[0].payload as { nested: { stable: boolean } }).nested.stable = false;
      const state = snapshotState();
      const snapshot = { schemaVersion: "meliora.run-snapshot.v1" as const, snapshotId: "snapshot-1", runId: first.runId, attemptId: first.attemptId, throughSequence: 1, state, createdAt: timestamp() };
      await store.writeSnapshot({ snapshot, expectedSequence: 3, leaseToken: lease.leaseToken });
      await store.writeSnapshot({ snapshot, expectedSequence: 3, leaseToken: lease.leaseToken });
      await assert.rejects(store.writeSnapshot({ snapshot: { ...snapshot, state: { ...snapshotState(), phase: "blocked" } }, expectedSequence: 3, leaseToken: lease.leaseToken }));
      await assert.rejects(store.writeSnapshot({ snapshot: { ...snapshot, snapshotId: "snapshot-rewind", throughSequence: 0 }, expectedSequence: 3, leaseToken: lease.leaseToken }));
      await assert.rejects(store.writeSnapshot({ snapshot: { ...snapshot, snapshotId: "snapshot-ahead", throughSequence: 4 }, expectedSequence: 3, leaseToken: lease.leaseToken }));
      (state as { phase: string }).phase = "tampered";

      const page = await store.readRecoveryBundle({ runId: first.runId, afterSequence: 0, eventLimit: 1 });
      assert.equal(page.kind, "found");
      if (page.kind !== "found") throw new Error("bundle expected");
      assert.equal(page.bundle.readActiveAttemptId, first.attemptId);
      assert.equal(page.bundle.command.initialAttemptId, first.attemptId);
      assert.equal(page.bundle.effectiveAfterSequence, 1);
      assert.equal(page.bundle.eventHeadSequence, 3);
      assert.equal(page.bundle.tailEvents[0]?.sequence, 2);
      assert.equal(page.bundle.tailComplete, false);
      assert.equal(page.bundle.nextAfterSequence, 2);
      assert.equal((page.bundle.tailEvents[0]?.payload as { nested: { stable: boolean } }).nested.stable, true);
      assert.equal(page.bundle.privateSnapshot?.state.phase, "model_streaming");
      assert.deepEqual(await store.readRecoveryBundle({ runId: first.runId, expectedActiveAttemptId: "wrong-attempt", eventLimit: 1 }), { kind: "conflict", code: "run_attempt_conflict" });

      const bytes = new TextEncoder().encode("artifact body");
      await assert.rejects(store.putArtifact({ artifactId: "artifact-bad", contentHash: "bad", mediaType: "text/plain", content: bytes, visibility: "private", createdAt: timestamp() }));
      await store.putArtifact({ artifactId: "artifact-good", contentHash: hashBytes(bytes), mediaType: "text/plain", content: bytes, visibility: "private", createdAt: timestamp() });
      bytes[0] = 0;
      assert.equal(new TextDecoder().decode((await store.getArtifact("artifact-good"))?.content), "artifact body");
      await assert.rejects(store.writeSnapshot({ snapshot: { schemaVersion: "meliora.run-snapshot.v1", snapshotId: "snapshot-public", runId: first.runId, attemptId: first.attemptId, throughSequence: 1, state: { ...snapshotState(), modelHistoryArtifact: { ...snapshotState().modelHistoryArtifact, visibility: "public" } as never }, createdAt: timestamp() }, expectedSequence: 3, leaseToken: lease.leaseToken }));
      for (const [index, invalidState] of [
        { ...snapshotState(), phase: "not-a-phase" },
        { ...snapshotState(), rawModelText: "must-not-persist" },
        { ...snapshotState(), modelHistoryArtifact: { ...snapshotState().modelHistoryArtifact, contentHash: "not-a-hash" } },
        { ...snapshotState(), pendingInvocations: [{}] },
        { ...snapshotState(), pendingInvocations: [{ invocationId: "pending-1", attemptId: first.attemptId, argumentsHash: "d".repeat(64), status: "reserved", arguments: { secret: "not-allowed-here" } }] },
        { ...snapshotState(), receiptRefs: [""] },
        { ...snapshotState(), verificationRefs: [{ artifactId: "a", contentHash: "bad", mediaType: "text/plain", byteLength: 1, visibility: "private" }] },
      ].entries()) {
        await assert.rejects(store.writeSnapshot({ snapshot: { ...snapshot, snapshotId: `invalid-${index}`, state: invalidState as PrivateRunSnapshotState }, expectedSequence: 3, leaseToken: lease.leaseToken }));
      }

      for (const [invocationId, reservedAt] of [["invocation-z", timestamp(9_000)], ["invocation-a", timestamp(8_000)]] as const) {
        const reservation = await store.reserveInvocation({
          invocation: { schemaVersion: "meliora.tool-invocation.v1", invocationId, runId: first.runId, attemptId: first.attemptId, toolName: "read_file", toolVersion: "v1", arguments: {}, argumentsHash: hashBytes(invocationId), catalogHash: "catalog-hash", idempotencyKey: `key-${invocationId}`, status: "reserved" },
          leaseToken: lease.leaseToken,
          reservedAt,
        });
        assert.equal(reservation.kind, "owner");
      }
      const sortedBundle = await store.readRecoveryBundle({ runId: first.runId, eventLimit: 1 });
      assert.equal(sortedBundle.kind, "found");
      if (sortedBundle.kind === "found") assert.deepEqual(sortedBundle.bundle.invocations.map((record) => record.invocation.invocationId), ["invocation-a", "invocation-z"]);

      const fingerprint = hashBytes("model-step-1");
      const terminalState = () => ({
        ...snapshotState(),
        terminalModelStepResult: { attemptId: first.attemptId, modelStepId: "model-step-1", requestFingerprint: fingerprint, artifact: { artifactId: "model-result-1", contentHash: "b".repeat(64), mediaType: "application/json", byteLength: 1, visibility: "private" as const } },
      });
      await assert.rejects(store.writeSnapshot({ snapshot: { ...snapshot, snapshotId: "terminal-no-checkpoint", throughSequence: 2, state: terminalState() }, expectedSequence: 3, leaseToken: lease.leaseToken }));
      const accepted = await store.transitionRunCommand({ localPrincipalId: first.localPrincipalId, workspaceId: first.workspaceId, idempotencyKey: first.idempotencyKey, runId: first.runId, attemptId: first.attemptId, leaseToken: lease.leaseToken, expectedStatus: "reserved", nextStatus: "accepted", updatedAt: timestamp(3_000) });
      assert.equal(accepted.kind, "updated");
      const started = await store.startModelStep({ runId: first.runId, attemptId: first.attemptId, leaseToken: lease.leaseToken, modelStepId: "model-step-1", requestFingerprint: fingerprint, startedAt: timestamp(4_000) });
      assert.equal(started.kind, "started");
      await assert.rejects(store.writeSnapshot({ snapshot: { ...snapshot, snapshotId: "terminal-started", throughSequence: 2, state: terminalState() }, expectedSequence: 3, leaseToken: lease.leaseToken }));
      const finished = await store.finishModelStep({ runId: first.runId, attemptId: first.attemptId, leaseToken: lease.leaseToken, modelStepId: "model-step-1", requestFingerprint: fingerprint, outcome: { status: "terminal", finishedAt: timestamp(5_000) } });
      assert.deepEqual(finished, { kind: "conflict", code: "terminal_model_step_commit_required" });
      await assert.rejects(store.writeSnapshot({ snapshot: { ...snapshot, snapshotId: "terminal-wrong-fingerprint", throughSequence: 2, state: { ...terminalState(), terminalModelStepResult: { ...terminalState().terminalModelStepResult!, requestFingerprint: "c".repeat(64) } } }, expectedSequence: 3, leaseToken: lease.leaseToken }));
      await assert.rejects(store.writeSnapshot({ snapshot: { ...snapshot, snapshotId: "terminal-wrong-attempt", throughSequence: 2, state: { ...terminalState(), terminalModelStepResult: { ...terminalState().terminalModelStepResult!, attemptId: "attempt-wrong" } } }, expectedSequence: 3, leaseToken: lease.leaseToken }));

      for (let index = 0; index < 129; index += 1) {
        const reservation = await store.reserveInvocation({
          invocation: { schemaVersion: "meliora.tool-invocation.v1", invocationId: `invocation-${index}`, runId: first.runId, attemptId: first.attemptId, toolName: "read_file", toolVersion: "v1", arguments: { index }, argumentsHash: hashBytes(`invocation-${index}`), catalogHash: "catalog-hash", idempotencyKey: `invocation-key-${index}`, status: "reserved" },
          leaseToken: lease.leaseToken,
          reservedAt: timestamp(),
        });
        assert.equal(reservation.kind, "owner");
      }
      assert.deepEqual(await store.readRecoveryBundle({ runId: first.runId, eventLimit: 1 }), { kind: "failure", code: "recovery_bundle_too_large" });

      now += 500;
      const renewed = await store.renewLease({ runId: first.runId, attemptId: first.attemptId, leaseToken: lease.leaseToken, ttlMs: 1_000, renewedAt: "2099-01-01T00:00:00.000Z" });
      assert.equal(renewed, true);
      now += 1_000;
      const recovery = await store.createRunAttempt({ sessionId: first.sessionId, turnId: first.turnId, runId: first.runId, attemptId: "attempt-recovery-1", expectedLatestAttemptNumber: 1, catalogHash: "catalog-hash", intentRevision: 1, createdAt: timestamp(), ownerId: "worker-2", ttlMs: 1_000, requestedAt: "2099-01-01T00:00:00.000Z" });
      assert.equal(recovery.kind, "created");
    } finally {
      store.close?.();
    }
  });
};

withStore("memory", (now) => new MemorySessionStore({ clock: () => new Date(now()) }));
withStore("sqlite", (now, t) => new SqliteSessionStore(createTempDatabase(t), { clock: () => new Date(now()) }));
withSnapshotEnvelopeSecurity("memory", (now) => new MemorySessionStore({ clock: () => new Date(now()) }));
withSnapshotEnvelopeSecurity("sqlite", (now, t) => new SqliteSessionStore(createTempDatabase(t), { clock: () => new Date(now()) }));

test("SQLite rejects a structurally tampered private snapshot even with a matching state hash", async (t) => {
  const store = new SqliteSessionStore(createTempDatabase(t), { clock: () => new Date(timestamp()) });
  try {
    const input = commandInput(9);
    const reserved = await store.reserveRunCommand(input);
    assert.equal(reserved.kind, "owner");
    const lease = await store.acquireLease({ runId: input.runId, attemptId: input.attemptId, ownerId: "worker", ttlMs: 1_000, requestedAt: timestamp() });
    assert.equal(lease.kind, "acquired");
    if (lease.kind !== "acquired") throw new Error("lease expected");
    const db = (store as unknown as { db: { prepare(sql: string): { run(...values: unknown[]): void } } }).db;
    const fingerprint = hashBytes("tamper-step");
    const terminalState = { ...snapshotState(), terminalModelStepResult: { attemptId: input.attemptId, modelStepId: "tamper-step", requestFingerprint: fingerprint, artifact: { artifactId: "result-1", contentHash: "e".repeat(64), mediaType: "application/json", byteLength: 1, visibility: "private" as const } } };
    // B1b rejects direct terminal snapshots.  Seed a valid non-terminal legacy
    // snapshot, then corrupt it into an orphan terminal binding through the raw
    // SQLite seam to exercise recovery's fail-closed read boundary.
    await store.writeSnapshot({ snapshot: { schemaVersion: "meliora.run-snapshot.v1", snapshotId: "snapshot-tamper", runId: input.runId, attemptId: input.attemptId, throughSequence: 0, state: snapshotState(), createdAt: timestamp() }, expectedSequence: 0, leaseToken: lease.leaseToken });
    const driftedTerminalJson = JSON.stringify({ ...terminalState, terminalModelStepResult: { ...terminalState.terminalModelStepResult, requestFingerprint: "f".repeat(64) } });
    db.prepare("UPDATE run_snapshots SET state_json=?,state_hash=? WHERE run_id=?").run(driftedTerminalJson, hashBytes(driftedTerminalJson), input.runId);
    await assert.rejects(store.readRecoveryBundle({ runId: input.runId, eventLimit: 1 }), /snapshot_integrity_conflict/u);
    const stateJson = JSON.stringify({ ...snapshotState(), modelHistoryArtifact: { ...snapshotState().modelHistoryArtifact, mediaType: "Bearer sk-abcdefghijklmnop" } });
    db.prepare("UPDATE run_snapshots SET state_json=?,state_hash=? WHERE run_id=?").run(stateJson, hashBytes(stateJson), input.runId);
    await assert.rejects(store.readSnapshot(input.runId), /Sensitive value rejected/u);
    const keyedStateJson = JSON.stringify({ ...snapshotState(), authorization: "Bearer sk-abcdefghijklmnop" });
    db.prepare("UPDATE run_snapshots SET state_json=?,state_hash=? WHERE run_id=?").run(keyedStateJson, hashBytes(keyedStateJson), input.runId);
    await assert.rejects(store.readSnapshot(input.runId));
    const safeStateJson = JSON.stringify(snapshotState());
    db.prepare("UPDATE run_snapshots SET state_json=?,state_hash=?,snapshot_id=? WHERE run_id=?").run(safeStateJson, hashBytes(safeStateJson), "Cookie: sessionid=outer-envelope-tamper", input.runId);
    await assert.rejects(store.readSnapshot(input.runId), SensitiveDataError);
  } finally {
    store.close();
  }
});
