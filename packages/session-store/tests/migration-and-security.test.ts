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
  assert.equal(db.pragma("user_version", { simple: true }), 1);
  assert.deepEqual(db.prepare("SELECT version,name FROM schema_migrations").all(), [{ version: 1, name: "0001_initial.sql" }]);
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
