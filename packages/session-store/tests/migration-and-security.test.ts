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
  store.close();
  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) if (existsSync(candidate)) assert.equal(readFileSync(candidate).toString("latin1").includes(secret), false);
});
