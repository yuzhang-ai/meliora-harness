import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createSafeRecoveryDispatcher } from "../../packages/agent-runtime/safe-recovery-dispatcher.js";
import type { SessionStorePort } from "../../packages/session-store/contracts.js";
import { MemorySessionStore } from "../../packages/session-store/memory-session-store.js";
import { canonicalRunCommandRequestHash } from "../../packages/session-store/run-command-contract.js";
import { SqliteSessionStore } from "../../packages/session-store/src/sqlite-session-store.js";
import { createTempDatabase, timestamp } from "../../packages/session-store/tests/helpers.js";

type Store = SessionStorePort & Readonly<{ close?: () => void }>;
const scope = { localPrincipalId: "principal", workspaceId: "workspace", idempotencyKey: "key" };
const adapters: readonly [string, (now: () => number, t: TestContext) => Store][] = [
  ["memory", (now) => new MemorySessionStore({ clock: () => new Date(now()) })],
  ["sqlite", (now, t) => new SqliteSessionStore(createTempDatabase(t), { clock: () => new Date(now()) })],
];

for (const [name, create] of adapters) {
  test(`${name} C.2b explicit dispatcher has one winner and supplies Attempt #2 authority`, async (t) => {
    let current = Date.parse(timestamp());
    const now = () => new Date(current).toISOString();
    const store = create(() => current, t);
    try {
      const reserved = await store.reserveRunCommand({
        ...scope, canonicalRequestHash: canonicalRunCommandRequestHash({ workspaceId: "workspace", message: "recover" }),
        sessionId: "session", turnId: "turn", runId: "run", attemptId: "attempt-initial", catalogHash: "catalog",
        intentRevision: 1, userMessage: "recover", reservedAt: now(),
      });
      assert.equal(reserved.kind, "owner");
      const lease = await store.acquireLease({ runId: "run", attemptId: "attempt-initial", ownerId: "old", ttlMs: 1_000, requestedAt: now() });
      assert.equal(lease.kind, "acquired");
      if (lease.kind !== "acquired") throw new Error("lease_expected");
      assert.equal((await store.transitionRunCommand({
        ...scope, runId: "run", attemptId: "attempt-initial", leaseToken: lease.leaseToken,
        expectedStatus: "reserved", nextStatus: "accepted", updatedAt: now(),
      })).kind, "updated");
      current += 1_001;
      const executed: string[] = [];
      const dispatcher = createSafeRecoveryDispatcher({
        store, ownerId: "new", leaseTtlMs: 1_000, now, nextAttemptId: () => "attempt-recovered",
        execute: async ({ authority, continuation }) => {
          executed.push(`${authority.attemptId}:${continuation.status}:${continuation.sequence}`);
        },
      });
      const results = await Promise.all([dispatcher.dispatchOne({ ...scope, runId: "run" }), dispatcher.dispatchOne({ ...scope, runId: "run" })]);
      assert.equal(results.filter((result) => result.kind === "dispatched").length, 1);
      assert.deepEqual(executed, ["attempt-recovered:created:0"]);
      const bundle = await store.readRecoveryBundle({ runId: "run", eventLimit: 8 });
      assert.equal(bundle.kind, "found");
      if (bundle.kind !== "found") throw new Error("bundle_expected");
      assert.equal(bundle.bundle.activeAttempt.attemptId, "attempt-recovered");
      assert.equal(bundle.bundle.latestAttemptNumber, 2);
    } finally { store.close?.(); }
  });
}
