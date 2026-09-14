import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";

import type { SessionStorePort } from "../contracts.js";
import { MemorySessionStore } from "../memory-session-store.js";
import { SqliteSessionStore } from "../src/sqlite-session-store.js";
import { createTempDatabase, event, timestamp } from "./helpers.js";

const seed = async (store: SessionStorePort) => {
  await store.createSession({ sessionId: "session-1", workspaceId: "workspace-1", createdAt: timestamp() });
  await store.createTurn({ sessionId: "session-1", turnId: "turn-1", intentRevision: 1, createdAt: timestamp() });
  await store.createRun({ sessionId: "session-1", turnId: "turn-1", runId: "run-1", initialAttemptId: "attempt-1", catalogHash: "catalog-hash", intentRevision: 1, createdAt: timestamp() });
  const lease = await store.acquireLease({ runId: "run-1", attemptId: "attempt-1", ownerId: "worker-1", ttlMs: 10_000, requestedAt: timestamp() });
  if (lease.kind !== "acquired") throw new Error("seed_lease_not_acquired");
  return lease;
};

const stores = (t: TestContext) => {
  const sqlite = new SqliteSessionStore(createTempDatabase(t));
  return { entries: [["memory", new MemorySessionStore()], ["sqlite", sqlite]] as const, close: () => sqlite.close() };
};

test("fixed-watermark event pages keep Memory and SQLite adapters in parity", async (t) => {
  const adapters = stores(t);
  try {
    for (const [name, store] of adapters.entries) {
      await t.test(name, async () => {
        const lease = await seed(store);
        const firstAppend = await store.appendEvents({
          runId: "run-1", attemptId: "attempt-1", leaseToken: lease.leaseToken, expectedSequence: 0,
          events: [event("event-1"), event("event-2"), event("event-3")],
        });
        assert.equal(firstAppend.kind, "appended");
        const first = await store.readEventLogPage({ runId: "run-1", afterSequence: 0, limit: 1 });
        assert.deepEqual(first.kind === "found" ? first.events.map((value) => value.sequence) : first, [1]);
        assert.equal(first.kind === "found" ? first.throughSequence : -1, 3);
        assert.equal(first.kind === "found" ? first.nextSequence : null, 1);

        const secondAppend = await store.appendEvents({
          runId: "run-1", attemptId: "attempt-1", leaseToken: lease.leaseToken, expectedSequence: 3,
          events: [event("event-4")],
        });
        assert.equal(secondAppend.kind, "appended");
        const remainder = await store.readEventLogPage({ runId: "run-1", afterSequence: 1, throughSequence: 3, limit: 10 });
        assert.deepEqual(remainder.kind === "found" ? remainder.events.map((value) => value.sequence) : remainder, [2, 3]);
        assert.equal(remainder.kind === "found" ? remainder.nextSequence : null, null);
        assert.deepEqual(await store.readEventLogPage({ runId: "missing", limit: 1 }), { kind: "not_found", code: "run_not_found" });
        assert.deepEqual(await store.readEventLogPage({ runId: "run-1", throughSequence: 5, limit: 1 }), { kind: "conflict", code: "event_watermark_conflict" });
        assert.deepEqual(await store.readEventLogPage({ runId: "run-1", throughSequence: -1, limit: 1 }), { kind: "conflict", code: "event_watermark_conflict" });
        assert.deepEqual(await store.readEventLogPage({ runId: "run-1", afterSequence: 4, throughSequence: 3, limit: 1 }), { kind: "conflict", code: "event_watermark_conflict" });
      });
    }
  } finally { adapters.close(); }
});
