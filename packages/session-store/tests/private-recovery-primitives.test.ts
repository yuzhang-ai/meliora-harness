import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";
import { MemorySessionStore } from "../memory-session-store.js";
import type { PrivateRunSnapshotState, SessionStorePort } from "../contracts.js";
import { PRIVATE_TERMINAL_MODEL_STEP_RESULT_MEDIA_TYPE } from "../contracts.js";
import { SqliteSessionStore } from "../src/sqlite-session-store.js";
import { canonicalJson, hashBytes } from "../src/integrity.js";
import { canonicalRunCommandRequestHash } from "../run-command-contract.js";
import { createTempDatabase, timestamp } from "./helpers.js";

type Store = SessionStorePort & Readonly<{ close?: () => void }>;
const bytes = new TextEncoder().encode("{\"events\":[]}");
const fingerprint = hashBytes("request");

const state = (attemptId: string, artifactId: string, modelStepId = "step", requestFingerprint = fingerprint, content = bytes): PrivateRunSnapshotState => ({
  schemaVersion: "meliora.private-run-snapshot-state.v1", phase: "model_streaming", catalogHash: "catalog",
  intentRevision: 1, modelHistoryArtifact: { artifactId: "history", contentHash: "a".repeat(64), mediaType: "application/json", byteLength: 0, visibility: "private" },
  terminalModelStepResult: { attemptId, modelStepId, requestFingerprint, artifact: {
    artifactId, contentHash: hashBytes(content), mediaType: PRIVATE_TERMINAL_MODEL_STEP_RESULT_MEDIA_TYPE,
    byteLength: content.byteLength, visibility: "private",
  } }, pendingInvocations: [], receiptRefs: [], verificationRefs: [],
});

const ready = async (store: Store) => {
  const command = { localPrincipalId: "principal", workspaceId: "workspace", idempotencyKey: "key", sessionId: "session", turnId: "turn", runId: "run", attemptId: "attempt", catalogHash: "catalog", intentRevision: 1, userMessage: "hello", reservedAt: timestamp(), canonicalRequestHash: canonicalRunCommandRequestHash({ workspaceId: "workspace", message: "hello" }) };
  assert.equal((await store.reserveRunCommand(command)).kind, "owner");
  const lease = await store.acquireLease({ runId: "run", attemptId: "attempt", ownerId: "worker", ttlMs: 10_000, requestedAt: timestamp() });
  assert.equal(lease.kind, "acquired"); if (lease.kind !== "acquired") throw new Error("lease");
  assert.equal((await store.transitionRunCommand({ localPrincipalId: "principal", workspaceId: "workspace", idempotencyKey: "key", runId: "run", attemptId: "attempt", leaseToken: lease.leaseToken, expectedStatus: "reserved", nextStatus: "accepted", updatedAt: timestamp(1) })).kind, "updated");
  assert.equal((await store.startModelStep({ runId: "run", attemptId: "attempt", leaseToken: lease.leaseToken, modelStepId: "step", requestFingerprint: fingerprint, startedAt: timestamp(2) })).kind, "started");
  return lease.leaseToken;
};

const commitTerminal = async (store: Store) => {
  const leaseToken = await ready(store);
  const snapshot = { schemaVersion: "meliora.run-snapshot.v1" as const, snapshotId: "snapshot", runId: "run", attemptId: "attempt", throughSequence: 0, state: state("attempt", "result"), createdAt: timestamp(4) };
  const result = await store.commitTerminalModelStepResultAndSnapshot({ runId: "run", attemptId: "attempt", leaseToken, modelStepId: "step", requestFingerprint: fingerprint, finishedAt: timestamp(5), normalizedResult: { artifactId: "result", contentHash: hashBytes(bytes), content: bytes }, snapshot, expectedSequence: 0 });
  assert.equal(result.kind, "committed");
};

const withStores = (name: string, action: (store: Store, t: TestContext) => Promise<void>) => {
  test(`private recovery primitive parity: ${name}/memory`, async (t) => action(new MemorySessionStore({ clock: () => new Date(timestamp(3)) }), t));
  test(`private recovery primitive parity: ${name}/sqlite`, async (t) => {
    const store = new SqliteSessionStore(createTempDatabase(t), { clock: () => new Date(timestamp(3)) });
    try { await action(store, t); } finally { store.close(); }
  });
};

withStores("atomic terminal commit has exact replay and fails closed on drift", async (store) => {
  const leaseToken = await ready(store); const snapshot = { schemaVersion: "meliora.run-snapshot.v1" as const, snapshotId: "snapshot", runId: "run", attemptId: "attempt", throughSequence: 0, state: state("attempt", "result"), createdAt: timestamp(4) };
  await store.writeSnapshot({ snapshot: { ...snapshot, snapshotId: "pre-terminal", state: { ...state("attempt", "result"), terminalModelStepResult: undefined } }, expectedSequence: 0, leaseToken });
  const input = { runId: "run", attemptId: "attempt", leaseToken, modelStepId: "step", requestFingerprint: fingerprint, finishedAt: timestamp(5), normalizedResult: { artifactId: "result", contentHash: hashBytes(bytes), content: bytes, metadata: { source: "normalized" } }, snapshot, expectedSequence: 0 };
  assert.equal((await store.commitTerminalModelStepResultAndSnapshot(input)).kind, "committed");
  assert.equal((await store.commitTerminalModelStepResultAndSnapshot(input)).kind, "replay");
  for (const changed of [
    { ...input, finishedAt: timestamp(6) },
    { ...input, normalizedResult: { ...input.normalizedResult, contentHash: hashBytes("drift") } },
    { ...input, snapshot: { ...snapshot, snapshotId: "other" } },
    { ...input, expectedSequence: 1 },
    { ...input, requestFingerprint: hashBytes("other") },
  ]) assert.equal((await store.commitTerminalModelStepResultAndSnapshot(changed)).kind, "conflict");
  const bundle = await store.readRecoveryBundle({ runId: "run", eventLimit: 1 });
  assert.equal(bundle.kind, "found");
  if (bundle.kind === "found") assert.equal(bundle.bundle.terminalModelStepResult?.artifact.mediaType, PRIVATE_TERMINAL_MODEL_STEP_RESULT_MEDIA_TYPE);
});

for (const adapter of ["memory", "sqlite"] as const) {
  test(`${adapter} retains immutable multi-step terminal history and rejects old evidence tampering`, async (t) => {
    for (const tamper of ["history", "history_outer_created_at", "row", "artifact", "checkpoint"] as const) {
      const store: Store = adapter === "memory"
        ? new MemorySessionStore({ clock: () => new Date(timestamp(3)) })
        : new SqliteSessionStore(createTempDatabase(t), { clock: () => new Date(timestamp(3)) });
      try {
        const leaseToken = await ready(store);
        const firstSnapshot = { schemaVersion: "meliora.run-snapshot.v1" as const, snapshotId: "snapshot-step-1", runId: "run", attemptId: "attempt", throughSequence: 0, state: state("attempt", "result-step-1"), createdAt: timestamp(4) };
        const first = { runId: "run", attemptId: "attempt", leaseToken, modelStepId: "step", requestFingerprint: fingerprint, finishedAt: timestamp(5), normalizedResult: { artifactId: "result-step-1", contentHash: hashBytes(bytes), content: bytes }, snapshot: firstSnapshot, expectedSequence: 0 };
        assert.equal((await store.commitTerminalModelStepResultAndSnapshot(first)).kind, "committed");
        const fingerprint2 = hashBytes("request-2"); const bytes2 = new TextEncoder().encode("{\"events\":[2]}");
        assert.equal((await store.startModelStep({ runId: "run", attemptId: "attempt", leaseToken, modelStepId: "step-2", requestFingerprint: fingerprint2, startedAt: timestamp(6) })).kind, "started");
        const secondSnapshot = { schemaVersion: "meliora.run-snapshot.v1" as const, snapshotId: "snapshot-step-2", runId: "run", attemptId: "attempt", throughSequence: 0, state: state("attempt", "result-step-2", "step-2", fingerprint2, bytes2), createdAt: timestamp(7) };
        const second = { runId: "run", attemptId: "attempt", leaseToken, modelStepId: "step-2", requestFingerprint: fingerprint2, finishedAt: timestamp(8), normalizedResult: { artifactId: "result-step-2", contentHash: hashBytes(bytes2), content: bytes2 }, snapshot: secondSnapshot, expectedSequence: 0 };
        assert.equal((await store.commitTerminalModelStepResultAndSnapshot(second)).kind, "committed");
        assert.equal((await store.commitTerminalModelStepResultAndSnapshot(first)).kind, "replay");
        assert.equal((await store.commitTerminalModelStepResultAndSnapshot(second)).kind, "replay");
        assert.equal((await store.readSnapshot("run"))?.snapshotId, "snapshot-step-2");
        const bundle = await store.readRecoveryBundle({ runId: "run", eventLimit: 1 }); assert.equal(bundle.kind, "found");
        if (bundle.kind === "found") assert.equal(bundle.bundle.terminalModelStepResult?.modelStepId, "step-2");
        if (adapter === "memory") {
          const raw = store as unknown as { terminalSnapshotHistory: Map<string, { snapshot: { createdAt: string }; commitOrdinal: number }>; terminalModelStepResults: Map<string, unknown>; artifacts: Map<string, unknown>; modelSteps: Map<string, { status: string }> };
          if (tamper === "history") raw.terminalSnapshotHistory.delete("snapshot-step-1");
          if (tamper === "history_outer_created_at") {
            const history = raw.terminalSnapshotHistory.get("snapshot-step-1")!;
            raw.terminalSnapshotHistory.set("snapshot-step-1", { ...history, snapshot: { ...history.snapshot, createdAt: timestamp(9) } });
          }
          if (tamper === "row") raw.terminalModelStepResults.delete("run\u0000step");
          if (tamper === "artifact") raw.artifacts.delete("result-step-1");
          if (tamper === "checkpoint") raw.modelSteps.set("run\u0000step", { status: "failed" });
        } else {
          const db = (store as unknown as { db: Database.Database }).db;
          if (tamper === "history") { db.pragma("foreign_keys = OFF"); db.prepare("DELETE FROM run_snapshot_history WHERE snapshot_id=?").run("snapshot-step-1"); db.pragma("foreign_keys = ON"); }
          if (tamper === "history_outer_created_at") db.prepare("UPDATE run_snapshot_history SET created_at=? WHERE snapshot_id=?").run(timestamp(9), "snapshot-step-1");
          if (tamper === "row") db.prepare("DELETE FROM model_step_terminal_results WHERE model_step_id=?").run("step");
          if (tamper === "artifact") { db.pragma("foreign_keys = OFF"); db.prepare("DELETE FROM artifacts WHERE artifact_id=?").run("result-step-1"); db.pragma("foreign_keys = ON"); }
          if (tamper === "checkpoint") db.prepare("UPDATE model_steps SET status='failed',failure_code='tampered' WHERE model_step_id=?").run("step");
        }
        await assert.rejects(store.readSnapshot("run"), /snapshot_integrity_conflict/u);
        await assert.rejects(store.readRecoveryBundle({ runId: "run", eventLimit: 1 }), /snapshot_integrity_conflict/u);
      } finally { store.close?.(); }
    }
  });
}

for (const adapter of ["memory", "sqlite"] as const) {
  test(`${adapter} owns multi-step commit ordering and rejects current outer timestamp drift`, async (t) => {
    const store: Store = adapter === "memory"
      ? new MemorySessionStore({ clock: () => new Date(timestamp(3)) })
      : new SqliteSessionStore(createTempDatabase(t), { clock: () => new Date(timestamp(3)) });
    try {
      const leaseToken = await ready(store);
      // The second commit has the same caller timestamp and a lexically smaller ID.
      // Store-owned ordinal, never either caller field, determines latest.
      const firstSnapshot = { schemaVersion: "meliora.run-snapshot.v1" as const, snapshotId: "snapshot-z", runId: "run", attemptId: "attempt", throughSequence: 0, state: state("attempt", "result-1"), createdAt: timestamp(4) };
      const first = { runId: "run", attemptId: "attempt", leaseToken, modelStepId: "step", requestFingerprint: fingerprint, finishedAt: timestamp(5), normalizedResult: { artifactId: "result-1", contentHash: hashBytes(bytes), content: bytes }, snapshot: firstSnapshot, expectedSequence: 0 };
      assert.equal((await store.commitTerminalModelStepResultAndSnapshot(first)).kind, "committed");
      const fingerprint2 = hashBytes("ordinal-request-2"); const bytes2 = new TextEncoder().encode("{\"events\":[2]}");
      assert.equal((await store.startModelStep({ runId: "run", attemptId: "attempt", leaseToken, modelStepId: "step-2", requestFingerprint: fingerprint2, startedAt: timestamp(6) })).kind, "started");
      const secondSnapshot = { schemaVersion: "meliora.run-snapshot.v1" as const, snapshotId: "snapshot-a", runId: "run", attemptId: "attempt", throughSequence: 0, state: state("attempt", "result-2", "step-2", fingerprint2, bytes2), createdAt: timestamp(4) };
      const second = { runId: "run", attemptId: "attempt", leaseToken, modelStepId: "step-2", requestFingerprint: fingerprint2, finishedAt: timestamp(8), normalizedResult: { artifactId: "result-2", contentHash: hashBytes(bytes2), content: bytes2 }, snapshot: secondSnapshot, expectedSequence: 0 };
      assert.equal((await store.commitTerminalModelStepResultAndSnapshot(second)).kind, "committed");
      assert.equal((await store.commitTerminalModelStepResultAndSnapshot(first)).kind, "replay");
      assert.equal((await store.commitTerminalModelStepResultAndSnapshot(second)).kind, "replay");
      assert.equal((await store.readSnapshot("run"))?.snapshotId, "snapshot-a");
      const bundle = await store.readRecoveryBundle({ runId: "run", eventLimit: 1 });
      assert.equal(bundle.kind, "found"); if (bundle.kind === "found") assert.equal(bundle.bundle.terminalModelStepResult?.modelStepId, "step-2");
      if (adapter === "memory") {
        const raw = store as unknown as { terminalSnapshotHistory: Map<string, { commitOrdinal: number }>; snapshots: Map<string, { createdAt: string }> };
        assert.deepEqual([...raw.terminalSnapshotHistory.values()].map((history) => history.commitOrdinal).sort(), [1, 2]);
        raw.snapshots.set("run", { ...raw.snapshots.get("run")!, createdAt: timestamp(9) });
      } else {
        const db = (store as unknown as { db: Database.Database }).db;
        assert.deepEqual(db.prepare("SELECT commit_ordinal FROM run_snapshot_history WHERE run_id=? ORDER BY commit_ordinal").all("run"), [{ commit_ordinal: 1 }, { commit_ordinal: 2 }]);
        assert.deepEqual(db.prepare("SELECT commit_ordinal FROM model_step_terminal_results WHERE run_id=? ORDER BY commit_ordinal").all("run"), [{ commit_ordinal: 1 }, { commit_ordinal: 2 }]);
        db.prepare("UPDATE run_snapshots SET created_at=? WHERE run_id=?").run(timestamp(9), "run");
      }
      await assert.rejects(store.readSnapshot("run"), /snapshot_integrity_conflict/u);
      await assert.rejects(store.readRecoveryBundle({ runId: "run", eventLimit: 1 }), /snapshot_integrity_conflict/u);
    } finally { store.close?.(); }
  });
}

for (const adapter of ["memory", "sqlite"] as const) {
  test(`${adapter} readback enforces terminal row <-> Snapshot binding iff`, async (t) => {
    for (const tamper of ["row_without_snapshot", "row_without_binding", "snapshot_without_row", "replaced_snapshot"] as const) {
      const store: Store = adapter === "memory"
        ? new MemorySessionStore({ clock: () => new Date(timestamp(3)) })
        : new SqliteSessionStore(createTempDatabase(t), { clock: () => new Date(timestamp(3)) });
      try {
        await commitTerminal(store);
        assert.equal((await store.readSnapshot("run"))?.snapshotId, "snapshot");
        assert.equal((await store.readRecoveryBundle({ runId: "run", eventLimit: 1 })).kind, "found");
        if (adapter === "memory") {
          const raw = store as unknown as { snapshots: Map<string, { snapshotId: string; state: Record<string, unknown> }>; terminalModelStepResults: Map<string, unknown> };
          const snapshot = raw.snapshots.get("run")!;
          if (tamper === "row_without_snapshot") raw.snapshots.delete("run");
          if (tamper === "row_without_binding") raw.snapshots.set("run", { ...snapshot, state: { ...snapshot.state, terminalModelStepResult: undefined } });
          if (tamper === "snapshot_without_row") raw.terminalModelStepResults.delete("run\u0000step");
          if (tamper === "replaced_snapshot") raw.snapshots.set("run", { ...snapshot, snapshotId: "replacement" });
        } else {
          const db = (store as unknown as { db: Database.Database }).db;
          if (tamper === "row_without_snapshot") { db.pragma("foreign_keys = OFF"); db.prepare("DELETE FROM run_snapshots WHERE run_id=?").run("run"); db.pragma("foreign_keys = ON"); }
          if (tamper === "row_without_binding") {
            const current = db.prepare("SELECT state_json FROM run_snapshots WHERE run_id=?").get("run") as { state_json: string };
            const altered = JSON.parse(current.state_json) as Record<string, unknown>; delete altered.terminalModelStepResult;
            const body = canonicalJson(altered as never); db.prepare("UPDATE run_snapshots SET state_json=?,state_hash=? WHERE run_id=?").run(body, hashBytes(body), "run");
          }
          if (tamper === "snapshot_without_row") db.prepare("DELETE FROM model_step_terminal_results WHERE run_id=?").run("run");
          if (tamper === "replaced_snapshot") { db.pragma("foreign_keys = OFF"); db.prepare("UPDATE run_snapshots SET snapshot_id=? WHERE run_id=?").run("replacement", "run"); db.pragma("foreign_keys = ON"); }
        }
        await assert.rejects(store.readSnapshot("run"), /snapshot_integrity_conflict/u);
        await assert.rejects(store.readRecoveryBundle({ runId: "run", eventLimit: 1 }), /snapshot_integrity_conflict/u);
      } finally { store.close?.(); }
    }
  });
}

withStores("dormant invocation execution CAS grants exactly one future permit", async (store) => {
  const leaseToken = await ready(store);
  const invocation = { schemaVersion: "meliora.tool-invocation.v1" as const, invocationId: "invocation", runId: "run", attemptId: "attempt", toolName: "read_file", toolVersion: "v1", arguments: {}, argumentsHash: hashBytes("arguments"), catalogHash: "catalog", idempotencyKey: "tool-key", status: "reserved" as const };
  const reserved = await store.reserveInvocation({ invocation, leaseToken, reservedAt: timestamp(4) });
  assert.equal(reserved.kind, "owner"); if (reserved.kind !== "owner") throw new Error("reservation");
  assert.equal((await store.readReservation({ runId: "run", attemptId: "attempt", invocationId: "invocation" }))?.status, "reserved");
  assert.equal((await store.beginInvocationExecution({ runId: "run", attemptId: "attempt", leaseToken, reservationId: reserved.reservationId })).kind, "started");
  assert.equal((await store.beginInvocationExecution({ runId: "run", attemptId: "attempt", leaseToken, reservationId: reserved.reservationId })).kind, "already_executing_or_unknown");
  assert.equal((await store.reserveInvocation({ invocation: { ...invocation, invocationId: "illegal", status: "executing" }, leaseToken, reservedAt: timestamp(4) })).kind, "conflict");
});

withStores("terminal result bytes follow the private artifact sensitive-data boundary", async (store) => {
  const leaseToken = await ready(store); const secret = new TextEncoder().encode("Bearer opaque-terminal-result-secret");
  const snapshot = { schemaVersion: "meliora.run-snapshot.v1" as const, snapshotId: "snapshot-secret", runId: "run", attemptId: "attempt", throughSequence: 0, state: state("attempt", "result-secret"), createdAt: timestamp(4) };
  await assert.rejects(store.commitTerminalModelStepResultAndSnapshot({ runId: "run", attemptId: "attempt", leaseToken, modelStepId: "step", requestFingerprint: fingerprint, finishedAt: timestamp(5), normalizedResult: { artifactId: "result-secret", contentHash: hashBytes(secret), content: secret }, snapshot, expectedSequence: 0 }));
  assert.equal((await store.readModelStep({ runId: "run", modelStepId: "step" }))?.status, "started");
});

for (const adapter of ["memory", "sqlite"] as const) {
  test(`${adapter} rolls back every atomic terminal write injection point`, async (t) => {
    for (const stage of ["artifact", "checkpoint", "terminal_result", "snapshot"] as const) {
      const hook = (candidate: typeof stage) => { if (candidate === stage) throw new Error(`inject-${stage}`); };
      const store: Store = adapter === "memory"
        ? new MemorySessionStore({ clock: () => new Date(timestamp(3)), onAtomicTerminalWrite: hook })
        : new SqliteSessionStore(createTempDatabase(t), { clock: () => new Date(timestamp(3)), onAtomicTerminalWrite: hook });
      try {
        const leaseToken = await ready(store); const snapshot = { schemaVersion: "meliora.run-snapshot.v1" as const, snapshotId: `snapshot-${stage}`, runId: "run", attemptId: "attempt", throughSequence: 0, state: state("attempt", `result-${stage}`), createdAt: timestamp(4) };
        await assert.rejects(store.commitTerminalModelStepResultAndSnapshot({ runId: "run", attemptId: "attempt", leaseToken, modelStepId: "step", requestFingerprint: fingerprint, finishedAt: timestamp(5), normalizedResult: { artifactId: `result-${stage}`, contentHash: hashBytes(bytes), content: bytes }, snapshot, expectedSequence: 0 }), /inject-/u);
        assert.equal((await store.readModelStep({ runId: "run", modelStepId: "step" }))?.status, "started");
        assert.equal(await store.getArtifact(`result-${stage}`), null);
        assert.equal(await store.readSnapshot("run"), null);
      } finally { store.close?.(); }
    }
  });
}

test("v2 ambiguous no-receipt rows migrate to outcome_unknown while v3 reservation stays reserved", async (t) => {
  const path = createTempDatabase(t); const one = readFileSync(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8"); const two = readFileSync(new URL("../migrations/0002_durable_commands.sql", import.meta.url), "utf8");
  const db = new Database(path); db.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)"); db.exec(one); db.exec(two); db.pragma("user_version = 2");
  db.prepare("INSERT INTO schema_migrations VALUES (?,?,?,?)").run(1, "0001_initial.sql", hashBytes(one), timestamp()); db.prepare("INSERT INTO schema_migrations VALUES (?,?,?,?)").run(2, "0002_durable_commands.sql", hashBytes(two), timestamp());
  db.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run("session", "workspace", timestamp(), timestamp()); db.prepare("INSERT INTO turns VALUES (?,?,?,?,?)").run("turn", "session", 1, timestamp(), timestamp()); db.prepare("INSERT INTO runs VALUES (?,?,?,?,?,?,?)").run("run", "turn", "session", "attempt", 1, timestamp(), timestamp()); db.prepare("INSERT INTO run_attempts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run("attempt", "run", "session", "turn", 1, "created", 0, "catalog", 1, "null", timestamp(), timestamp());
  for (const [status, id] of [["executing", "legacy-executing"], ["reserved", "legacy-reserved"]] as const) {
    const raw = { schemaVersion: "meliora.tool-invocation.v1", invocationId: id, runId: "run", attemptId: "attempt", toolName: "read_file", toolVersion: "v1", arguments: {}, argumentsHash: hashBytes(id), catalogHash: "catalog", idempotencyKey: `${id}-key`, status };
    const body = JSON.stringify(raw); db.prepare("INSERT INTO invocations VALUES (?,?,?,?,?,?,?,?,?)").run(id, "run", "attempt", `reservation-${id}`, raw.idempotencyKey, body, hashBytes(body), status, timestamp());
  }
  db.close();
  const store = new SqliteSessionStore(path);
  for (const id of ["legacy-executing", "legacy-reserved"]) assert.equal((await store.readReservation({ runId: "run", attemptId: "attempt", invocationId: id }))?.status, "outcome_unknown");
  const lease = await store.acquireLease({ runId: "run", attemptId: "attempt", ownerId: "recovery", ttlMs: 1_000, requestedAt: timestamp() });
  assert.equal(lease.kind, "acquired"); if (lease.kind !== "acquired") throw new Error("lease");
  assert.deepEqual(await store.beginInvocationExecution({ runId: "run", attemptId: "attempt", leaseToken: lease.leaseToken, reservationId: "reservation-legacy-executing" }), { kind: "already_executing_or_unknown" }); store.close();
});
