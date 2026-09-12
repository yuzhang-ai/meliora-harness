import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { deepseekStreamTextSingleToolFixture } from "../../fixtures/contracts/v1/deepseek-stream-text-single-tool";
import type { CanonicalInputMessage, CanonicalModelEvent } from "../../packages/model-protocol/contracts";
import {
  ReadOnlyRunLoop,
  type ReadOnlyModelStepCheckpointGate,
  type ReadOnlyRunIds,
} from "../../packages/agent-runtime/read-only-run-loop";
import { MemorySessionStore } from "../../packages/session-store/memory-session-store";
import type { ToolCatalogSnapshot } from "../../packages/tool-runtime/contracts";

let sequence = 0;
const fixedNow = "2026-09-10T09:00:00.000Z";
const ids = (): ReadOnlyRunIds => ({
  nextModelStepId: () => `model-step-${++sequence}`,
  nextEventId: () => `event-${++sequence}`,
  nextReceiptId: () => `receipt-${++sequence}`,
  nextOutcomeId: () => `outcome-${++sequence}`,
});

const catalog: ToolCatalogSnapshot = {
  schemaVersion: "meliora.tool-catalog.v1",
  catalogVersion: "fixture-v1",
  catalogHash: "catalog-fixture-v1",
  definitions: [{
    schemaVersion: "meliora.tool.v1",
    name: "read_file",
    version: "1.0.0",
    description: "Read one workspace file",
    inputSchema: { type: "object" },
    schemaDialect: "https://json-schema.org/draft/2020-12/schema",
    risk: "L0",
    timeoutMs: 1_000,
    outputLimit: 1_000,
    capabilities: ["workspace.read"],
    cancellation: "cooperative",
    projector: "read_file_summary",
  }],
};

const finalStop = (modelStepId: string): readonly CanonicalModelEvent[] => [{
  schemaVersion: "meliora.model-event.v1",
  modelStepId,
  streamIndex: 0,
  occurredAt: fixedNow,
  kind: "assistant_text_delta",
  delta: "入口文件已读取并核验。",
}, {
  schemaVersion: "meliora.model-event.v1",
  modelStepId,
  streamIndex: 1,
  occurredAt: fixedNow,
  kind: "model_step_completed",
  finishReason: "stop",
}];

const checkpointGate = (
  onStart: () => void,
): ReadOnlyModelStepCheckpointGate => ({
  start: async (input) => {
    onStart();
    const requestFingerprint = createHash("sha256")
      .update(JSON.stringify({ messages: input.messages, catalogHash: input.catalog.catalogHash }))
      .digest("hex");
    return { kind: "started", requestFingerprint };
  },
  finish: async () => ({ kind: "committed" }),
});

function createLoop(
  modelSteps: readonly (readonly CanonicalModelEvent[])[],
  executionStatus: "succeeded" | "failed" = "succeeded",
  options: Readonly<{ now?: () => string; leaseTtlMs?: number; modelDelayMs?: number }> = {},
) {
  const now = options.now ?? (() => fixedNow);
  const store = new MemorySessionStore({ clock: () => new Date(now()) });
  let modelCalls = 0;
  let checkpointStarts = 0;
  let assistantProjectionCalls = 0;
  const loop = new ReadOnlyRunLoop({
    store,
    modelStepCheckpoint: checkpointGate(() => { checkpointStarts += 1; }),
    model: {
      next: async ({ modelStepId, messages }) => {
        modelCalls += 1;
        assert.equal(checkpointStarts, modelCalls, "each Provider call must follow a new durable Model Step checkpoint");
        if (options.modelDelayMs) await new Promise((resolve) => setTimeout(resolve, options.modelDelayMs));
        if (modelCalls === 1) assert.deepEqual(messages, [{ role: "user", content: "检查入口文件" }]);
        if (modelCalls === 2) {
          assert.deepEqual(messages.at(-2), {
            role: "assistant",
            content: "我先读取入口文件。",
            toolCalls: [{
              invocationId: "invocation-deepseek-0-0",
              toolName: "read_file",
              rawArguments: '{"path":"packages/agent-runtime/run-state.ts"}',
              providerToolCallId: "ds-call-read-file-001",
            }],
          });
          assert.deepEqual(messages.at(-1), { role: "tool", invocationId: "invocation-deepseek-0-0", content: "入口文件存在，读取成功。" });
        }
        const events = modelSteps[modelCalls - 1];
        if (!events) throw new Error("unexpected_model_step");
        return events.map((event) => ({ ...event, modelStepId }));
      },
    },
    tools: {
      execute: async (invocation) => {
        assert.equal(invocation.toolName, "read_file");
        assert.deepEqual(invocation.arguments, { path: "packages/agent-runtime/run-state.ts" });
        return executionStatus === "succeeded"
          ? {
              status: "succeeded",
              effectSummary: "private executor output API_KEY=secret",
              outputArtifactId: "private-artifact-id",
              verification: { verificationId: "verification-read-file", status: "passed", evidenceArtifactIds: ["private-artifact-id"] },
            }
          : { status: "failed", effectSummary: "private tool failure API_KEY=secret" };
      },
    },
    ids: ids(),
    now,
    hashArguments: (value) => `hash:${JSON.stringify(value)}`,
    projectToolResult: ({ execution }) => ({
      modelContent: execution.status === "succeeded" ? "入口文件存在，读取成功。" : "读取入口文件失败。",
      publicSummary: execution.status === "succeeded" ? "入口文件存在，读取成功。" : "读取入口文件失败。",
      publicArtifactIds: execution.status === "succeeded" ? ["artifact-read-file-summary", "private-artifact-id"] : [],
      publicVerificationArtifactIds: execution.status === "succeeded" ? ["artifact-read-file-summary", "private-artifact-id"] : [],
    }),
    projectAssistantText: ({ content }) => {
      assistantProjectionCalls += 1;
      return content;
    },
    isPublicArtifact: async (artifactId) => artifactId === "artifact-read-file-summary",
    ownerId: "fixture-worker",
    leaseTtlMs: options.leaseTtlMs ?? 60_000,
    policyVersion: "fixture-policy-v1",
    principalId: "fixture-user",
  });
  return { loop, store, modelCalls: () => modelCalls, assistantProjectionCalls: () => assistantProjectionCalls };
}

sequence = 0;
const success = createLoop([[
  {
    schemaVersion: "meliora.model-event.v1",
    modelStepId: "fixture-private-reasoning",
    streamIndex: 0,
    occurredAt: fixedNow,
    kind: "reasoning_delta",
    delta: "private model reasoning must not be projected",
    visibility: "private",
  },
  ...deepseekStreamTextSingleToolFixture.expectedEvents,
], finalStop("ignored")]);
const successResult = await success.loop.run({
  sessionId: "session-success", workspaceId: "workspace-success", turnId: "turn-success", runId: "run-success", attemptId: "attempt-success",
  intentRevision: 1, catalog, userMessage: "检查入口文件",
});
assert.equal(successResult.outcome.status, "completed");
assert.equal(success.modelCalls(), 2);
assert.equal(success.assistantProjectionCalls(), 1, "post-tool assistant text must not rely on the public projector to avoid leaking private observations");
assert.equal(successResult.outcome.receiptRefs.length, 1);
assert.equal((await success.store.readReceipt({
  runId: "run-success",
  attemptId: "attempt-success",
  receiptId: successResult.outcome.receiptRefs[0]!,
}))?.status, "succeeded", "receipt must be durable before the outcome is accepted");
assert.deepEqual(successResult.publicEvents.map((event) => event.kind), [
  "run_status_changed", "run_status_changed", "assistant_text_delta", "run_status_changed", "tool_call_presented",
  "run_status_changed", "tool_result_presented", "verification_updated", "run_status_changed", "assistant_text_delta",
  "run_status_changed", "run_status_changed", "run_completed",
]);
assert.equal(successResult.publicEvents.some((event) => JSON.stringify(event).includes("reasoning")), false);
const successAssistantText = successResult.publicEvents
  .filter((event): event is Extract<(typeof successResult.publicEvents)[number], { kind: "assistant_text_delta" }> => event.kind === "assistant_text_delta")
  .map((event) => event.payload.delta)
  .join("");
assert.match(successAssistantText, /我先读取入口文件。/u, "pre-tool safe assistant text should still be public");
assert.match(successAssistantText, /模型已基于私有工具结果生成回复，内容已隐藏/u, "post-tool assistant text should be fixed redaction");
assert.equal(JSON.stringify(successResult).includes("API_KEY=secret"), false, "executor text must cross a server-owned projector");
assert.equal(JSON.stringify(successResult).includes("private-artifact-id"), false, "private artifacts must not become public refs");
assert.equal((await success.store.readEvents({ runId: "run-success", limit: 100 })).events.some((event) => event.visibility === "private"), true);
const successReceipt = await success.store.readReceipt({
  runId: "run-success",
  attemptId: "attempt-success",
  receiptId: successResult.outcome.receiptRefs[0]!,
});
assert.equal(JSON.stringify(successReceipt).includes("API_KEY=secret"), false, "receipt summaries must use the safe projection");

sequence = 0;
const failure = createLoop([deepseekStreamTextSingleToolFixture.expectedEvents], "failed");
const failureResult = await failure.loop.run({
  sessionId: "session-failure", workspaceId: "workspace-failure", turnId: "turn-failure", runId: "run-failure", attemptId: "attempt-failure",
  intentRevision: 1, catalog, userMessage: "检查入口文件",
});
assert.equal(failureResult.outcome.status, "failed");
assert.equal(failure.modelCalls(), 1);
assert.equal(failureResult.publicEvents.at(-1)?.kind, "run_failed");

sequence = 0;
const controller = new AbortController();
controller.abort();
const cancelled = createLoop([deepseekStreamTextSingleToolFixture.expectedEvents]);
const cancelledResult = await cancelled.loop.run({
  sessionId: "session-cancelled", workspaceId: "workspace-cancelled", turnId: "turn-cancelled", runId: "run-cancelled", attemptId: "attempt-cancelled",
  intentRevision: 1, catalog, userMessage: "检查入口文件", signal: controller.signal,
});
assert.equal(cancelledResult.outcome.status, "cancelled");
assert.equal(cancelled.modelCalls(), 0);
assert.equal(cancelledResult.publicEvents.at(-1)?.kind, "run_cancelled");

sequence = 0;
const heartbeat = createLoop(
  [[...deepseekStreamTextSingleToolFixture.expectedEvents], finalStop("ignored")],
  "succeeded",
  { now: () => new Date().toISOString(), leaseTtlMs: 45, modelDelayMs: 90 },
);
const heartbeatResult = await heartbeat.loop.run({
  sessionId: "session-heartbeat", workspaceId: "workspace-heartbeat", turnId: "turn-heartbeat", runId: "run-heartbeat", attemptId: "attempt-heartbeat",
  intentRevision: 1, catalog, userMessage: "检查入口文件",
});
assert.equal(heartbeatResult.outcome.status, "completed", "lease heartbeat must cover slow provider steps");

sequence = 0;
const invalidLease = createLoop([deepseekStreamTextSingleToolFixture.expectedEvents], "succeeded", { leaseTtlMs: 0 });
await assert.rejects(() => invalidLease.loop.run({
  sessionId: "session-invalid-lease", workspaceId: "workspace-invalid-lease", turnId: "turn-invalid-lease", runId: "run-invalid-lease", attemptId: "attempt-invalid-lease",
  intentRevision: 1, catalog, userMessage: "检查入口文件",
}), /lease_ttl_invalid/u);

console.log(JSON.stringify({
  gate: "meliora-m0-read-only-run-loop",
  status: "PASS",
  scenarios: ["model-tool-receipt-provider-follow-up-outcome", "safe-tool-projection", "tool-failure", "cancel-before-start", "lease-heartbeat"],
}));
