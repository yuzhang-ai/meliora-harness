import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Database from "better-sqlite3";
import { StoreIntegrityError } from "../src/errors.js";
import { hashBytes } from "../src/integrity.js";
import { SqliteSessionStore } from "../src/sqlite-session-store.js";
import { createTempDatabase, timestamp } from "./helpers.js";

const migrationOneName = "0001_initial.sql";
const migrationOneSql = readFileSync(new URL(`../migrations/${migrationOneName}`, import.meta.url), "utf8");

const createVersionOneDatabase = (path: string): void => {
  const db = new Database(path);
  db.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)");
  db.exec(migrationOneSql);
  db.prepare("INSERT INTO schema_migrations VALUES (?,?,?,?)")
    .run(1, migrationOneName, hashBytes(migrationOneSql), timestamp());
  db.pragma("user_version = 1");
  db.close();
};

const inspect = (path: string): Database.Database => new Database(path, { readonly: true });

test("fresh databases apply the complete immutable migration manifest", (t) => {
  const path = createTempDatabase(t);
  new SqliteSessionStore(path).close();
  new SqliteSessionStore(path).close();

  const db = inspect(path);
  assert.equal(db.pragma("user_version", { simple: true }), 2);
  assert.deepEqual(db.prepare("SELECT version,name FROM schema_migrations ORDER BY version").all(), [
    { version: 1, name: "0001_initial.sql" },
    { version: 2, name: "0002_durable_commands.sql" },
  ]);
  for (const table of ["run_commands", "run_command_inputs", "model_steps"]) {
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").pluck().get(table), 1);
  }
  assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
  assert.deepEqual(db.pragma("foreign_key_check"), []);
  db.close();
});

test("version one upgrades to version two without changing existing rows", (t) => {
  const path = createTempDatabase(t);
  createVersionOneDatabase(path);
  const before = new Database(path);
  before.prepare("INSERT INTO sessions VALUES (?,?,?,?)")
    .run("preserved-session", "preserved-workspace", timestamp(), timestamp());
  before.close();

  new SqliteSessionStore(path).close();
  const db = inspect(path);
  assert.equal(db.pragma("user_version", { simple: true }), 2);
  assert.deepEqual(db.prepare("SELECT session_id,workspace_id FROM sessions").get(), {
    session_id: "preserved-session",
    workspace_id: "preserved-workspace",
  });
  assert.equal(db.prepare("SELECT count(*) FROM schema_migrations").pluck().get(), 2);
  db.close();
});

test("migration history gaps and checksum or name drift are rejected", (t) => {
  for (const mutation of [
    "DELETE FROM schema_migrations WHERE version=1",
    "UPDATE schema_migrations SET checksum='tampered' WHERE version=1",
    "UPDATE schema_migrations SET name='renamed.sql' WHERE version=2",
  ]) {
    const path = createTempDatabase(t);
    new SqliteSessionStore(path).close();
    const db = new Database(path);
    db.exec(mutation);
    db.close();
    assert.throws(() => new SqliteSessionStore(path), StoreIntegrityError);
  }
});

test("a database newer than the adapter is rejected", (t) => {
  const path = createTempDatabase(t);
  new SqliteSessionStore(path).close();
  const db = new Database(path);
  db.pragma("user_version = 3");
  db.close();
  assert.throws(() => new SqliteSessionStore(path), StoreIntegrityError);
});
