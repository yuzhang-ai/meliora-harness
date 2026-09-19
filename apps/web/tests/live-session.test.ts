import assert from "node:assert/strict";
import test from "node:test";

import { LIVE_SESSION_KEY, parseLiveSession, readLiveSession, saveLiveSession } from "../src/live-session";

test("live recovery persists only opaque workspace/run IDs", () => {
  const items = new Map<string, string>();
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
  };
  saveLiveSession(storage, { kind: "run", workspaceId: "workspace-one", runId: "run:123" });
  assert.equal(items.get(LIVE_SESSION_KEY), '{"kind":"run","workspaceId":"workspace-one","runId":"run:123"}');
  assert.deepEqual(readLiveSession(storage), { kind: "run", workspaceId: "workspace-one", runId: "run:123" });
  saveLiveSession(storage, { kind: "pending", workspaceId: "workspace-one", idempotencyKey: "web:123" });
  assert.deepEqual(readLiveSession(storage), { kind: "pending", workspaceId: "workspace-one", idempotencyKey: "web:123" });
});

test("live recovery rejects unexpected fields, paths, and oversized records", () => {
  assert.equal(parseLiveSession('{"kind":"run","workspaceId":"w","runId":"r","message":"private"}'), null);
  assert.equal(parseLiveSession('{"kind":"run","workspaceId":"../repo","runId":"r"}'), null);
  assert.equal(parseLiveSession("x".repeat(1_001)), null);
});
