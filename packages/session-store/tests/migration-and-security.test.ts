import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import Database from "better-sqlite3";
import { SensitiveDataError } from "../src/errors.js";
import { hashBytes } from "../src/integrity.js";
import { SqliteSessionStore } from "../src/sqlite-session-store.js";
import { createTempDatabase, event, seed } from "./helpers.js";

test("migration is forward-only, checksummed and idempotent", (t) => {
  const path = createTempDatabase(t); new SqliteSessionStore(path).close(); new SqliteSessionStore(path).close();
  const db = new Database(path, { readonly: true });
  assert.equal(db.pragma("user_version", { simple: true }), 2);
  assert.deepEqual(db.prepare("SELECT version,name FROM schema_migrations ORDER BY version").all(), [
    { version: 1, name: "0001_initial.sql" },
    { version: 2, name: "0002_durable_commands.sql" },
  ]);
  assert.equal(db.pragma("integrity_check", { simple: true }), "ok"); assert.deepEqual(db.pragma("foreign_key_check"), []); db.close();
});

test("sensitive values never reach database, WAL or SHM", async (t) => {
  const path = createTempDatabase(t); const secret = "sk-meliora-secret-123456789";
  const store = new SqliteSessionStore(path); const lease = await seed(store);
  await assert.rejects(store.appendEvents({ runId: "run-1", attemptId: "attempt-1", expectedSequence: 0, leaseToken: lease.leaseToken, events: [{ ...event("secret"), payload: { apiKey: secret } }] }), SensitiveDataError);
  await assert.rejects(store.appendEvents({
    runId: "run-1",
    attemptId: "attempt-1",
    expectedSequence: 0,
    leaseToken: lease.leaseToken,
    events: [{ ...event("header-secret"), payload: { headers: { "x-api-key": "opaque-provider-credential" } } }],
  }), SensitiveDataError);
  const safeContent = new TextEncoder().encode("safe artifact");
  await assert.rejects(store.putArtifact({
    artifactId: "secret-artifact",
    contentHash: hashBytes(safeContent),
    mediaType: "text/plain",
    content: safeContent,
    visibility: "private",
    metadata: { accessToken: secret },
    createdAt: new Date().toISOString(),
  }), SensitiveDataError);
  await assert.rejects(store.putArtifact({
    artifactId: "environment-secret-artifact",
    contentHash: hashBytes(safeContent),
    mediaType: "application/octet-stream",
    content: safeContent,
    visibility: "private",
    metadata: { OPENAI_API_KEY: "opaque-provider-credential" },
    createdAt: new Date().toISOString(),
  }), SensitiveDataError);
  const utf16Secret = Buffer.from(`{"x-api-key":"opaque-provider-credential","token":"${secret}"}`, "utf16le");
  await assert.rejects(store.putArtifact({
    artifactId: "utf16-secret-artifact",
    contentHash: hashBytes(utf16Secret),
    mediaType: "application/octet-stream",
    content: utf16Secret,
    visibility: "private",
    createdAt: new Date().toISOString(),
  }), SensitiveDataError);
  const cookieArtifacts = [
    { artifactId: "utf8-cookie-artifact", mediaType: "text/plain", content: Buffer.from("Cookie: sessionid=opaque-cookie-secret", "utf8") },
    { artifactId: "utf8-set-cookie-artifact", mediaType: "text/plain", content: Buffer.from("Set-Cookie: sessionid=opaque-set-cookie-secret; HttpOnly", "utf8") },
    { artifactId: "utf16-cookie-artifact", mediaType: "application/octet-stream", content: Buffer.from("cOoKiE = sessionid=opaque-cookie-variant", "utf16le") },
    { artifactId: "utf16-set-cookie-artifact", mediaType: "application/octet-stream", content: Buffer.from("SET_COOKIE : sessionid=opaque-set-cookie-variant", "utf16le") },
  ];
  for (const artifact of cookieArtifacts) {
    await assert.rejects(store.putArtifact({
      ...artifact,
      contentHash: hashBytes(artifact.content),
      visibility: "private",
      createdAt: new Date().toISOString(),
    }), SensitiveDataError);
  }
  store.close();
  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
    if (!existsSync(candidate)) continue;
    const bytes = readFileSync(candidate);
    assert.equal(bytes.includes(secret), false);
    assert.equal(bytes.includes(utf16Secret), false);
    for (const artifact of cookieArtifacts) assert.equal(bytes.includes(artifact.content), false);
  }
});

test("sensitive snapshot envelopes never reach database, WAL or SHM", async (t) => {
  const path = createTempDatabase(t); const store = new SqliteSessionStore(path); const lease = await seed(store);
  const attacks = [
    "Bearer opaque-snapshot-bearer-secret",
    "Bearer abcdefghijklmnop",
    "bEaReR = abcdefghijklmnop",
    "Bearer: opaque-snapshot-bearer-colon-secret",
    "Bearer : opaque-snapshot-bearer-space-colon-secret",
    "Bearer=opaque-snapshot-bearer-equals-secret",
    "bEaReR = opaque-snapshot-bearer-case-secret",
    "Cookie: sessionid=opaque-snapshot-cookie-secret",
    "Set-Cookie: sessionid=opaque-snapshot-set-cookie-secret; HttpOnly",
    "x-api-key: opaque-snapshot-api-key-secret",
    "X_API_KEY : opaque-snapshot-api-key-variant",
    "set_cookie : sessionid=opaque-snapshot-set-cookie-variant",
  ] as const;
  const snapshot = {
    schemaVersion: "meliora.run-snapshot.v1" as const,
    snapshotId: "snapshot-security",
    runId: "run-1",
    attemptId: "attempt-1",
    throughSequence: 0,
    state: {
      schemaVersion: "meliora.private-run-snapshot-state.v1" as const,
      phase: "model_streaming" as const,
      catalogHash: "catalog-hash",
      intentRevision: 1,
      modelHistoryArtifact: { artifactId: "history-1", contentHash: "a".repeat(64), mediaType: "application/json", byteLength: 1, visibility: "private" as const },
      pendingInvocations: [], receiptRefs: [], verificationRefs: [],
    },
    createdAt: new Date().toISOString(),
  };
  for (const value of attacks) {
    await assert.rejects(store.writeSnapshot({ snapshot: { ...snapshot, snapshotId: value }, expectedSequence: 0, leaseToken: lease.leaseToken }), SensitiveDataError);
    await assert.rejects(store.writeSnapshot({
      snapshot: {
        ...snapshot,
        state: {
          ...snapshot.state,
          modelHistoryArtifact: { ...snapshot.state.modelHistoryArtifact, mediaType: value },
        },
      },
      expectedSequence: 0,
      leaseToken: lease.leaseToken,
    }), SensitiveDataError);
  }
  store.close();
  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
    if (!existsSync(candidate)) continue;
    const bytes = readFileSync(candidate);
    for (const value of attacks) {
      assert.equal(bytes.includes(Buffer.from(value, "utf8")), false);
      assert.equal(bytes.includes(Buffer.from(value, "utf16le")), false);
    }
  }
});
