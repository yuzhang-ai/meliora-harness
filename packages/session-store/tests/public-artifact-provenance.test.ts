import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";

import { MemorySessionStore } from "../memory-session-store.js";
import type { StagePublicToolResultDerivativeInput, SessionStorePort } from "../contracts.js";
import { SqliteSessionStore } from "../src/sqlite-session-store.js";
import { SensitiveDataError } from "../src/errors.js";
import { hashBytes } from "../src/integrity.js";
import { canonicalRunCommandRequestHash } from "../run-command-contract.js";
import { createTempDatabase, invocation, timestamp } from "./helpers.js";

type Store = SessionStorePort & Readonly<{ close?: () => void }>;
type Ready = Readonly<{ input: StagePublicToolResultDerivativeInput; now: (value: string) => void }>;
type Scope = Readonly<{
  sessionId: string;
  turnId: string;
  runId: string;
  attemptId: string;
  invocationId: string;
}>;

const createReady = async (
  store: Store,
  setNow: (value: string) => void,
  scope: Scope = { sessionId: "session", turnId: "turn", runId: "run", attemptId: "attempt", invocationId: "invocation" },
): Promise<Ready> => {
  const command = {
    localPrincipalId: "principal", workspaceId: "workspace", idempotencyKey: `command-key-${scope.runId}`,
    sessionId: scope.sessionId, turnId: scope.turnId, runId: scope.runId, attemptId: scope.attemptId, catalogHash: "catalog",
    intentRevision: 1, userMessage: "hello", reservedAt: timestamp(),
    canonicalRequestHash: canonicalRunCommandRequestHash({ workspaceId: "workspace", message: "hello" }),
  };
  assert.equal((await store.reserveRunCommand(command)).kind, "owner");
  const lease = await store.acquireLease({ runId: scope.runId, attemptId: scope.attemptId, ownerId: "worker", ttlMs: 1_000, requestedAt: timestamp() });
  assert.equal(lease.kind, "acquired");
  if (lease.kind !== "acquired") throw new Error("lease_not_acquired");
  const reserved = await store.reserveInvocation({
    leaseToken: lease.leaseToken,
    reservedAt: timestamp(1),
    invocation: {
      ...invocation(scope.invocationId),
      runId: scope.runId,
      attemptId: scope.attemptId,
      catalogHash: "catalog",
    },
  });
  assert.equal(reserved.kind, "owner");
  if (reserved.kind !== "owner") throw new Error("invocation_not_reserved");
  assert.equal((await store.beginInvocationExecution({
    runId: scope.runId, attemptId: scope.attemptId, leaseToken: lease.leaseToken, reservationId: reserved.reservationId,
  })).kind, "started");
  const content = new TextEncoder().encode("safe public tool summary");
  return {
    input: {
      runId: scope.runId, sessionId: scope.sessionId, attemptId: scope.attemptId, leaseToken: lease.leaseToken,
      reservationId: reserved.reservationId, invocationId: scope.invocationId, content, contentHash: hashBytes(content), mediaType: "text/plain",
    },
    now: setNow,
  };
};

const withStores = (name: string, action: (store: Store, ready: Ready, t: TestContext) => Promise<void>) => {
  test(`public artifact provenance parity: ${name}/memory`, async (t) => {
    let current = timestamp(2);
    const store = new MemorySessionStore({ clock: () => new Date(current) });
    await action(store, await createReady(store, (value) => { current = value; }), t);
  });
  test(`public artifact provenance parity: ${name}/sqlite`, async (t) => {
    let current = timestamp(2);
    const store = new SqliteSessionStore(createTempDatabase(t), { clock: () => new Date(current) });
    try { await action(store, await createReady(store, (value) => { current = value; }), t); } finally { store.close(); }
  });
};

withStores("stage is opaque, exact-replays after lease expiry, and resolve is scoped", async (store, ready) => {
  const first = await store.stagePublicToolResultDerivative(ready.input);
  assert.equal(first.kind, "staged");
  if (first.kind !== "staged") throw new Error("not_staged");
  assert.deepEqual(Object.keys(first.manifest).sort(), [
    "artifactId", "byteLength", "contentHash", "createdAt", "mediaType", "projectionKind", "visibility",
  ]);
  assert.equal(await store.getArtifact(first.manifest.artifactId), null, "public alias must not be a physical artifact ID");
  assert.deepEqual(await store.resolveStagedPublicArtifact({ runId: "run", sessionId: "session", artifactId: first.manifest.artifactId }), {
    kind: "found", manifest: first.manifest,
  });
  assert.deepEqual(await store.resolveStagedPublicArtifact({ runId: "other-run", sessionId: "session", artifactId: first.manifest.artifactId }), { kind: "not_found" });
  assert.deepEqual(await store.resolveStagedPublicArtifact({ runId: "run", sessionId: "other-session", artifactId: first.manifest.artifactId }), { kind: "not_found" });

  ready.now(timestamp(2_000));
  const replay = await store.stagePublicToolResultDerivative(ready.input);
  assert.equal(replay.kind, "replay", "exact replay must not require a live lease");
  if (replay.kind === "replay") assert.deepEqual(replay.manifest, first.manifest);
  const drift = await store.stagePublicToolResultDerivative({ ...ready.input, content: new TextEncoder().encode("different"), contentHash: hashBytes("different") });
  assert.deepEqual(drift, { kind: "conflict", code: "public_artifact_provenance_conflict" });

  const nextAttempt = await store.createRunAttempt({
    sessionId: "session", turnId: "turn", runId: "run", attemptId: "attempt-2", expectedLatestAttemptNumber: 1,
    catalogHash: "catalog", intentRevision: 1, createdAt: timestamp(2_000), ownerId: "worker-2", ttlMs: 1_000, requestedAt: timestamp(2_000),
  });
  assert.equal(nextAttempt.kind, "created");
  assert.equal((await store.resolveStagedPublicArtifact({ runId: "run", sessionId: "session", artifactId: first.manifest.artifactId })).kind, "found");
});

withStores("separate runs receive non-transferable aliases and distinct physical provenance", async (store, first) => {
  const second = await createReady(store, first.now, {
    sessionId: "session-other", turnId: "turn-other", runId: "run-other", attemptId: "attempt-other", invocationId: "invocation-other",
  });
  const stagedFirst = await store.stagePublicToolResultDerivative(first.input);
  const stagedSecond = await store.stagePublicToolResultDerivative(second.input);
  assert.equal(stagedFirst.kind, "staged");
  assert.equal(stagedSecond.kind, "staged");
  if (stagedFirst.kind !== "staged" || stagedSecond.kind !== "staged") throw new Error("not_staged");
  assert.notEqual(stagedFirst.manifest.artifactId, stagedSecond.manifest.artifactId);
  assert.deepEqual(await store.resolveStagedPublicArtifact({
    runId: "run-other", sessionId: "session-other", artifactId: stagedFirst.manifest.artifactId,
  }), { kind: "not_found" });
  assert.deepEqual(await store.resolveStagedPublicArtifact({
    runId: "run", sessionId: "session", artifactId: stagedSecond.manifest.artifactId,
  }), { kind: "not_found" });
  if (store instanceof MemorySessionStore) {
    const raw = store as unknown as { stagedPublicArtifacts: Map<string, { physicalArtifactId: string }> };
    assert.notEqual(
      raw.stagedPublicArtifacts.get(stagedFirst.manifest.artifactId)?.physicalArtifactId,
      raw.stagedPublicArtifacts.get(stagedSecond.manifest.artifactId)?.physicalArtifactId,
    );
  } else {
    const db = (store as unknown as { db: Database.Database }).db;
    assert.equal(db.prepare("SELECT count(DISTINCT physical_artifact_id) FROM staged_public_artifact_provenance").pluck().get(), 2);
  }
});

withStores("first stage requires active executing invocation and exact reservation binding", async (store, ready) => {
  const reservedInput = { ...ready.input, invocationId: "wrong-invocation" };
  assert.deepEqual(await store.stagePublicToolResultDerivative(reservedInput), {
    kind: "conflict", code: "invocation_execution_conflict",
  });
  assert.deepEqual(await store.stagePublicToolResultDerivative({ ...ready.input, sessionId: "other-session" }), {
    kind: "conflict", code: "run_attempt_conflict",
  });
  assert.deepEqual(await store.stagePublicToolResultDerivative({ ...ready.input, leaseToken: "wrong-lease" }), {
    kind: "conflict", code: "lease_not_held",
  });
  const sensitive = new TextEncoder().encode("Bearer opaque-public-derivative-secret");
  await assert.rejects(store.stagePublicToolResultDerivative({
    ...ready.input, content: sensitive, contentHash: hashBytes(sensitive),
  }), SensitiveDataError);
});

withStores("staged manifest remains resolvable after its invocation commits a terminal Receipt", async (store, ready) => {
  const staged = await store.stagePublicToolResultDerivative(ready.input);
  assert.equal(staged.kind, "staged");
  if (staged.kind !== "staged") throw new Error("not_staged");

  const committed = await store.commitReceipt({
    runId: ready.input.runId,
    attemptId: ready.input.attemptId,
    leaseToken: ready.input.leaseToken,
    reservationId: ready.input.reservationId,
    receipt: {
      schemaVersion: "meliora.tool-receipt.v1",
      receiptId: "receipt-invocation",
      invocationId: ready.input.invocationId,
      runId: ready.input.runId,
      attemptId: ready.input.attemptId,
      toolName: "read_file",
      toolVersion: "1",
      argumentsHash: "arguments-hash",
      catalogHash: "catalog",
      decision: "allow",
      startedAt: timestamp(1),
      endedAt: timestamp(2),
      status: "succeeded",
      effectSummary: "safe read complete",
      verificationArtifactIds: [],
      redactions: [],
    },
  });
  assert.equal(committed.kind, "committed");
  assert.deepEqual(await store.resolveStagedPublicArtifact({
    runId: ready.input.runId,
    sessionId: ready.input.sessionId,
    artifactId: staged.manifest.artifactId,
  }), { kind: "found", manifest: staged.manifest });
});

for (const adapter of ["memory", "sqlite"] as const) {
  test(`${adapter} staged provenance tamper fails closed without exposing bytes or physical identity`, async (t) => {
    let current = timestamp(2);
    const store: Store = adapter === "memory"
      ? new MemorySessionStore({ clock: () => new Date(current) })
      : new SqliteSessionStore(createTempDatabase(t), { clock: () => new Date(current) });
    try {
      const ready = await createReady(store, (value) => { current = value; });
      const staged = await store.stagePublicToolResultDerivative(ready.input);
      assert.equal(staged.kind, "staged");
      if (staged.kind !== "staged") throw new Error("not_staged");
      if (adapter === "memory") {
        const raw = store as unknown as { stagedPublicArtifacts: Map<string, { physicalArtifactId: string }>; artifacts: Map<string, unknown> };
        const provenance = raw.stagedPublicArtifacts.get(staged.manifest.artifactId)!;
        raw.artifacts.delete(provenance.physicalArtifactId);
      } else {
        const db = (store as unknown as { db: Database.Database }).db;
        db.pragma("foreign_keys = OFF");
        db.prepare("DELETE FROM invocations WHERE reservation_id=(SELECT reservation_id FROM staged_public_artifact_provenance WHERE public_alias=? )")
          .run(staged.manifest.artifactId);
        db.pragma("foreign_keys = ON");
      }
      assert.deepEqual(await store.resolveStagedPublicArtifact({ runId: "run", sessionId: "session", artifactId: staged.manifest.artifactId }), { kind: "not_found" });
    } finally { store.close?.(); }
  });
}

withStores("stored physical byte-length drift is fail-closed", async (store, ready) => {
  const staged = await store.stagePublicToolResultDerivative(ready.input);
  assert.equal(staged.kind, "staged");
  if (staged.kind !== "staged") throw new Error("not_staged");
  if (store instanceof MemorySessionStore) {
    const raw = store as unknown as {
      stagedPublicArtifacts: Map<string, { physicalArtifactId: string }>;
      artifacts: Map<string, { byteLength: number }>;
    };
    const physical = raw.stagedPublicArtifacts.get(staged.manifest.artifactId)!.physicalArtifactId;
    raw.artifacts.get(physical)!.byteLength += 1;
  } else {
    const db = (store as unknown as { db: Database.Database }).db;
    db.prepare(`UPDATE artifacts SET byte_length=byte_length+1 WHERE artifact_id=(
      SELECT physical_artifact_id FROM staged_public_artifact_provenance WHERE public_alias=?
    )`).run(staged.manifest.artifactId);
  }
  assert.deepEqual(await store.resolveStagedPublicArtifact({
    runId: "run", sessionId: "session", artifactId: staged.manifest.artifactId,
  }), { kind: "not_found" });
});

test("sqlite provenance insertion failure rolls back its derivative physical artifact", async (t) => {
  let current = timestamp(2);
  const store = new SqliteSessionStore(createTempDatabase(t), { clock: () => new Date(current) });
  try {
    const ready = await createReady(store, (value) => { current = value; });
    const db = (store as unknown as { db: Database.Database }).db;
    db.exec(`CREATE TRIGGER staged_provenance_fail BEFORE INSERT ON staged_public_artifact_provenance
      BEGIN SELECT RAISE(ABORT, 'injected_provenance_failure'); END`);
    await assert.rejects(store.stagePublicToolResultDerivative(ready.input));
    assert.equal(db.prepare("SELECT count(*) FROM staged_public_artifact_provenance").pluck().get(), 0);
    assert.equal(db.prepare("SELECT count(*) FROM artifacts WHERE artifact_id LIKE 'staged-public-physical-%'").pluck().get(), 0);
  } finally { store.close(); }
});

test("sqlite fixed alias collision rolls back the second physical artifact", async (t) => {
  let current = timestamp(2);
  const nonces = ["lease-one", "reservation-one", "lease-two", "reservation-two", "same-alias", "physical-one", "same-alias", "physical-two"];
  const store = new SqliteSessionStore(createTempDatabase(t), {
    clock: () => new Date(current),
    nonce: () => nonces.shift() ?? "unexpected-nonce",
  });
  try {
    const first = await createReady(store, (value) => { current = value; });
    const second = await createReady(store, (value) => { current = value; }, {
      sessionId: "session-other", turnId: "turn-other", runId: "run-other", attemptId: "attempt-other", invocationId: "invocation-other",
    });
    assert.equal((await store.stagePublicToolResultDerivative(first.input)).kind, "staged");
    assert.deepEqual(await store.stagePublicToolResultDerivative(second.input), {
      kind: "conflict", code: "public_artifact_provenance_conflict",
    });
    const db = (store as unknown as { db: Database.Database }).db;
    assert.deepEqual(db.prepare("SELECT artifact_id FROM artifacts WHERE artifact_id LIKE 'staged-public-physical-%' ORDER BY artifact_id").all(), [
      { artifact_id: "staged-public-physical-physical-one" },
    ]);
    assert.equal(db.prepare("SELECT count(*) FROM staged_public_artifact_provenance").pluck().get(), 1);
  } finally { store.close(); }
});

test("sqlite v3 public artifacts are not backfilled into staged provenance", async (t) => {
  const path = createTempDatabase(t);
  const sourceId = "legacy-public-artifact-id";
  const sourceContent = new TextEncoder().encode("legacy public reference bytes");
  const initial = new SqliteSessionStore(path);
  await initial.putArtifact({
    artifactId: sourceId, content: sourceContent, contentHash: hashBytes(sourceContent), mediaType: "text/plain",
    visibility: "public", createdAt: timestamp(),
  });
  initial.close();
  const downgrade = new Database(path);
  downgrade.exec("DROP TABLE staged_public_artifact_provenance");
  downgrade.prepare("DELETE FROM schema_migrations WHERE version=4").run();
  downgrade.pragma("user_version = 3");
  downgrade.close();

  const upgraded = new SqliteSessionStore(path);
  try {
    const db = (upgraded as unknown as { db: Database.Database }).db;
    assert.equal(db.prepare("SELECT count(*) FROM staged_public_artifact_provenance").pluck().get(), 0);
    assert.equal((await upgraded.getArtifact(sourceId))?.artifactId, sourceId);
    assert.deepEqual(await upgraded.resolveStagedPublicArtifact({
      runId: "legacy-run", sessionId: "legacy-session", artifactId: sourceId,
    }), { kind: "not_found" });
  } finally { upgraded.close(); }
});

test("sqlite stage appends WAL frames without copying a private source into staged rows", async (t) => {
  const path = createTempDatabase(t); let current = timestamp(2);
  const store = new SqliteSessionStore(path, { clock: () => new Date(current) });
  const ready = await createReady(store, (value) => { current = value; });
  const sentinel = "PRIVATE_SOURCE_SENTINEL_MUST_NOT_LEAK_TO_STAGED_ROWS";
  const sourceId = "a-private-source-physical-id-must-not-leak";
  const sourceBytes = new TextEncoder().encode(sentinel);
  await store.putArtifact({
    artifactId: sourceId, content: sourceBytes, contentHash: hashBytes(sourceBytes), mediaType: "text/plain",
    visibility: "private", createdAt: timestamp(),
  });
  const db = (store as unknown as { db: Database.Database }).db;
  db.pragma("wal_checkpoint(TRUNCATE)");
  const walPath = `${path}-wal`;
  const baselineBytes = existsSync(walPath) ? readFileSync(walPath) : Buffer.alloc(0);
  const staged = await store.stagePublicToolResultDerivative(ready.input);
  assert.equal(staged.kind, "staged");
  if (staged.kind !== "staged") throw new Error("not_staged");
  const provenance = db.prepare("SELECT * FROM staged_public_artifact_provenance WHERE public_alias=?")
    .get(staged.manifest.artifactId) as Record<string, unknown>;
  const derivative = db.prepare("SELECT * FROM artifacts WHERE artifact_id=?")
    .get(provenance.physical_artifact_id) as Record<string, unknown>;
  assert.equal(Buffer.from(JSON.stringify(provenance)).includes(sentinel), false);
  assert.equal(Buffer.from(JSON.stringify(provenance)).includes(sourceId), false);
  assert.equal(Buffer.from(JSON.stringify(derivative)).includes(sentinel), false);
  assert.equal(Buffer.from(JSON.stringify(derivative)).includes(sourceId), false);
  const provenanceColumns = db.prepare("PRAGMA table_info(staged_public_artifact_provenance)").all() as Array<{ name: string }>;
  assert.equal(provenanceColumns.some(({ name }) => /source/i.test(name)), false);
  const walAfter = existsSync(walPath) ? readFileSync(walPath) : Buffer.alloc(0);
  assert.ok(walAfter.byteLength > baselineBytes.byteLength, "stage transaction must append WAL frames after the baseline checkpoint");
  store.close();
  const reopened = new SqliteSessionStore(path, { clock: () => new Date(current) });
  try {
    assert.equal((await reopened.resolveStagedPublicArtifact({ runId: "run", sessionId: "session", artifactId: staged.manifest.artifactId })).kind, "found");
  } finally { reopened.close(); }
});
