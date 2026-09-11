import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import type { NewEvent } from "../contracts.js";
import type { NormalizedToolInvocation, ToolReceipt } from "../../tool-runtime/contracts.js";
import { SqliteSessionStore } from "../src/sqlite-session-store.js";

export const timestamp = (offset = 0) => new Date(Date.UTC(2026, 8, 10, 12, 0, 0) + offset).toISOString();
export const createTempDatabase = (t: TestContext): string => {
  const root = mkdtempSync(join(tmpdir(), "meliora-session-store-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return join(root, "session.sqlite");
};
export const event = (eventId: string, visibility: "public" | "private" = "public"): NewEvent => ({
  schemaVersion: "meliora.session-event.v1", eventId, kind: "run_status_changed", visibility,
  payload: { message: eventId }, createdAt: timestamp(),
});
export const invocation = (id = "invocation-1"): NormalizedToolInvocation => ({
  schemaVersion: "meliora.tool-invocation.v1", invocationId: id, runId: "run-1", attemptId: "attempt-1",
  toolName: "read_file", toolVersion: "1", arguments: { path: "README.md" }, argumentsHash: "arguments-hash",
  catalogHash: "catalog-hash", idempotencyKey: `key-${id}`, status: "reserved",
});
export const receipt = (id = "invocation-1"): ToolReceipt => ({
  schemaVersion: "meliora.tool-receipt.v1", receiptId: `receipt-${id}`, invocationId: id,
  runId: "run-1", attemptId: "attempt-1", toolName: "read_file", toolVersion: "1",
  argumentsHash: "arguments-hash", catalogHash: "catalog-hash", decision: "allow",
  startedAt: timestamp(), endedAt: timestamp(1), status: "succeeded", effectSummary: "read completed",
  verificationArtifactIds: [], redactions: [],
});
export async function seed(store: SqliteSessionStore) {
  await store.createSession({ sessionId: "session-1", workspaceId: "workspace-1", createdAt: timestamp() });
  await store.createTurn({ sessionId: "session-1", turnId: "turn-1", intentRevision: 1, createdAt: timestamp() });
  await store.createRun({ sessionId: "session-1", turnId: "turn-1", runId: "run-1", initialAttemptId: "attempt-1", catalogHash: "catalog-hash", intentRevision: 1, createdAt: timestamp() });
  const lease = await store.acquireLease({ runId: "run-1", attemptId: "attempt-1", ownerId: "worker-1", ttlMs: 10_000, requestedAt: timestamp() });
  if (lease.kind !== "acquired") throw new Error("seed_lease_not_acquired");
  return lease;
}
