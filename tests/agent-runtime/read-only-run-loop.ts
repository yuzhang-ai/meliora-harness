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
import { canonicalRunCommandRequestHash } from "../../packages/session-store/run-command-contract";
import type { ToolCatalogSnapshot, ToolReceipt } from "../../packages/tool-runtime/contracts";

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
  store: MemorySessionStore,
  onStart: () => void,
): ReadOnlyModelStepCheckpointGate => ({
  start: async (input) => {
    onStart();
    const requestFingerprint = createHash("sha256")
      .update(JSON.stringify({ messages: input.messages, catalogHash: input.catalog.catalogHash }))
      .digest("hex");
    const result = await store.startModelStep({
      runId: input.runId, attemptId: input.attemptId, leaseToken: input.leaseToken,
      modelStepId: input.modelStepId, requestFingerprint, startedAt: input.startedAt,
    });
    return result.kind === "started"
      ? { kind: "started", requestFingerprint }
      : result.kind === "replay"
        ? { kind: "replay", requestFingerprint: result.checkpoint.requestFingerprint, status: result.checkpoint.status === "terminal" ? "terminal" : "failed" }
        : { kind: "conflict", code: result.code };
  },
  finish: async (input) => {
    const result = await store.finishModelStep(input);
    return result.kind === "conflict" ? { kind: "conflict", code: result.code } : { kind: result.kind };
  },
});

function createLoop(
  modelSteps: readonly (readonly CanonicalModelEvent[])[],
  executionStatus: "succeeded" | "failed" | "cancelled" = "succeeded",
  options: Readonly<{
    now?: () => string;
    leaseTtlMs?: number;
    modelDelayMs?: number;
    store?: MemorySessionStore;
    throwFromHost?: boolean;
    onHostStart?: () => void;
    expectedUserMessage?: string;
    expectedFirstAssistantContent?: string;
  }> = {},
) {
  const now = options.now ?? (() => fixedNow);
  const store = options.store ?? new MemorySessionStore({ clock: () => new Date(now()) });
  let modelCalls = 0;
  let checkpointStarts = 0;
  let assistantProjectionCalls = 0;
  let hostCalls = 0;
  const loop = new ReadOnlyRunLoop({
    store,
    modelStepCheckpoint: checkpointGate(store, () => { checkpointStarts += 1; }),
    model: {
      next: async ({ modelStepId, messages }) => {
        modelCalls += 1;
        assert.equal(checkpointStarts, modelCalls, "each Provider call must follow a new durable Model Step checkpoint");
        if (options.modelDelayMs) await new Promise((resolve) => setTimeout(resolve, options.modelDelayMs));
        if (modelCalls === 1) assert.deepEqual(messages, [{ role: "user", content: options.expectedUserMessage ?? "检查入口文件" }]);
        if (modelCalls === 2) {
          assert.deepEqual(messages.at(-2), {
            role: "assistant",
            content: options.expectedFirstAssistantContent ?? "我先读取入口文件。",
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
        hostCalls += 1;
        options.onHostStart?.();
        assert.equal(invocation.toolName, "read_file");
        assert.deepEqual(invocation.arguments, { path: "packages/agent-runtime/run-state.ts" });
        if (options.throwFromHost) throw new Error("injected_host_failure");
        return executionStatus === "succeeded"
          ? {
              status: "succeeded",
              effectSummary: "private executor output API_KEY=secret",
              outputArtifactId: "private-artifact-id",
              verification: { verificationId: "verification-read-file", status: "passed", evidenceArtifactIds: ["private-artifact-id"] },
            }
          : executionStatus === "failed"
            ? { status: "failed", effectSummary: "private tool failure API_KEY=secret" }
            : { status: "cancelled", effectSummary: "explicit tool cancellation" };
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
  return { loop, store, leaseTtlMs: options.leaseTtlMs ?? 60_000, modelCalls: () => modelCalls, hostCalls: () => hostCalls, assistantProjectionCalls: () => assistantProjectionCalls };
}

const runWithCommand = async (
  fixture: ReturnType<typeof createLoop>,
  input: Parameters<ReadOnlyRunLoop["run"]>[0],
) => {
  // The fixture's verified read result is private durable evidence. B1b must
  // re-read it before the following Model Step snapshots receipt/verification
  // state, rather than treating an executor-supplied ID as proof.
  if (!await fixture.store.getArtifact("private-artifact-id")) {
    const content = new TextEncoder().encode("private read evidence");
    await fixture.store.putArtifact({
      artifactId: "private-artifact-id",
      contentHash: createHash("sha256").update(content).digest("hex"),
      mediaType: "text/plain",
      content,
      visibility: "private",
      createdAt: fixedNow,
    });
  }
  const reserved = await fixture.store.reserveRunCommand({
    localPrincipalId: "fixture-principal", workspaceId: input.workspaceId, idempotencyKey: `key-${input.runId}`,
    sessionId: input.sessionId, turnId: input.turnId, runId: input.runId, attemptId: input.attemptId,
    catalogHash: input.catalog.catalogHash, intentRevision: input.intentRevision, userMessage: input.userMessage,
    reservedAt: fixedNow, canonicalRequestHash: canonicalRunCommandRequestHash({ workspaceId: input.workspaceId, message: input.userMessage }),
  });
  assert.equal(reserved.kind, "owner");
  if (reserved.kind !== "owner") throw new Error("command reservation");
  const lease = await fixture.store.acquireLease({ runId: input.runId, attemptId: input.attemptId, ownerId: "fixture-worker", ttlMs: fixture.leaseTtlMs, requestedAt: fixedNow });
  assert.equal(lease.kind, "acquired");
  if (lease.kind !== "acquired") throw new Error("lease");
  assert.equal((await fixture.store.transitionRunCommand({
    localPrincipalId: "fixture-principal", workspaceId: input.workspaceId, idempotencyKey: `key-${input.runId}`,
    runId: input.runId, attemptId: input.attemptId, leaseToken: lease.leaseToken,
    expectedStatus: "reserved", nextStatus: "accepted", updatedAt: fixedNow,
  })).kind, "updated");
  return fixture.loop.run({ ...input, precreated: { leaseToken: lease.leaseToken } });
};

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
const successResult = await runWithCommand(success, {
  sessionId: "session-success", workspaceId: "workspace-success", turnId: "turn-success", runId: "run-success", attemptId: "attempt-success",
  intentRevision: 1, catalog, userMessage: "检查入口文件",
});
assert.equal(successResult.outcome.status, "completed");
assert.equal(success.modelCalls(), 2);
assert.equal(success.hostCalls(), 1, "only a started invocation execution permit may reach Host");
assert.equal(success.assistantProjectionCalls(), 0, "M0 must never project Provider assistant text into the public surface");
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
assert.match(successAssistantText, /模型响应已私有持久化，公开摘要尚未启用。/u, "pre-tool Provider text must be replaced by the fixed M0 notice");
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
const latestSuccessSnapshot = await success.store.readSnapshot("run-success");
assert.ok(latestSuccessSnapshot);
assert.deepEqual(latestSuccessSnapshot?.state.receiptRefs, [successResult.outcome.receiptRefs[0]!]);
assert.deepEqual(latestSuccessSnapshot?.state.verificationRefs, [{
  artifactId: "private-artifact-id",
  contentHash: createHash("sha256").update("private read evidence").digest("hex"),
  mediaType: "text/plain",
  byteLength: new TextEncoder().encode("private read evidence").byteLength,
  visibility: "private",
}]);
const successHistoryArtifact = await success.store.getArtifact(latestSuccessSnapshot!.state.modelHistoryArtifact.artifactId);
assert.ok(successHistoryArtifact);
const successHistory = JSON.parse(new TextDecoder().decode(successHistoryArtifact!.content)) as { messages: unknown[] };
assert.deepEqual(successHistory.messages, [
  { role: "user", content: "检查入口文件" },
  {
    role: "assistant",
    content: "我先读取入口文件。",
    toolCalls: [{
      invocationId: "invocation-deepseek-0-0",
      toolName: "read_file",
      rawArguments: '{"path":"packages/agent-runtime/run-state.ts"}',
      providerToolCallId: "ds-call-read-file-001",
    }],
  },
  { role: "tool", invocationId: "invocation-deepseek-0-0", content: "入口文件存在，读取成功。" },
  { role: "assistant", content: "入口文件已读取并核验。" },
]);

sequence = 0;
const privateUserMarker = "M0_PRIVATE_USER_ECHO_MARKER";
const exactPreToolEchoEvents = deepseekStreamTextSingleToolFixture.expectedEvents.map((event) =>
  event.kind === "assistant_text_delta" ? { ...event, delta: privateUserMarker } : event,
);
const exactPreToolEcho = createLoop([exactPreToolEchoEvents, finalStop("ignored")], "succeeded", {
  expectedUserMessage: privateUserMarker,
  expectedFirstAssistantContent: privateUserMarker,
});
const exactPreToolEchoResult = await runWithCommand(exactPreToolEcho, {
  sessionId: "session-pre-tool-echo", workspaceId: "workspace-pre-tool-echo", turnId: "turn-pre-tool-echo", runId: "run-pre-tool-echo", attemptId: "attempt-pre-tool-echo",
  intentRevision: 1, catalog, userMessage: privateUserMarker,
});
assert.equal(exactPreToolEchoResult.outcome.status, "completed");
assert.equal(JSON.stringify(exactPreToolEchoResult.publicEvents).includes(privateUserMarker), false, "pre-tool Provider echo must not reach the public Runtime result");
const exactPreToolPrivateEvents = await exactPreToolEcho.store.readEvents({ runId: "run-pre-tool-echo", limit: 100 });
assert.equal(exactPreToolPrivateEvents.events.some((event) => event.visibility === "private" && JSON.stringify(event.payload).includes(privateUserMarker)), true, "private canonical Provider events retain the original echo for the next model step");

sequence = 0;
const failure = createLoop([deepseekStreamTextSingleToolFixture.expectedEvents], "failed");
const failureResult = await runWithCommand(failure, {
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
const cancelledResult = await runWithCommand(cancelled, {
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
const heartbeatResult = await runWithCommand(heartbeat, {
  sessionId: "session-heartbeat", workspaceId: "workspace-heartbeat", turnId: "turn-heartbeat", runId: "run-heartbeat", attemptId: "attempt-heartbeat",
  intentRevision: 1, catalog, userMessage: "检查入口文件",
});
assert.equal(heartbeatResult.outcome.status, "completed", "lease heartbeat must cover slow provider steps");

sequence = 0;
const invalidLease = createLoop([deepseekStreamTextSingleToolFixture.expectedEvents], "succeeded", { leaseTtlMs: 0 });
await assert.rejects(() => runWithCommand(invalidLease, {
  sessionId: "session-invalid-lease", workspaceId: "workspace-invalid-lease", turnId: "turn-invalid-lease", runId: "run-invalid-lease", attemptId: "attempt-invalid-lease",
  intentRevision: 1, catalog, userMessage: "检查入口文件",
}), /lease_ttl_invalid/u);

class ThrowingRenewalAfterHostStore extends MemorySessionStore {
  hostStarted = false;
  private remainingFailure = 1;

  override async renewLease(...input: Parameters<MemorySessionStore["renewLease"]>) {
    if (this.hostStarted && this.remainingFailure > 0) {
      this.remainingFailure -= 1;
      throw new Error("adapter_renewal_detail_must_not_escape");
    }
    return super.renewLease(input[0]);
  }
}

const renewalExceptionStore = new ThrowingRenewalAfterHostStore({ clock: () => new Date(fixedNow) });
const renewalException = createLoop([deepseekStreamTextSingleToolFixture.expectedEvents], "succeeded", {
  store: renewalExceptionStore,
  onHostStart: () => { renewalExceptionStore.hostStarted = true; },
});
await assert.rejects(() => runWithCommand(renewalException, {
  sessionId: "session-renew-throw", workspaceId: "workspace-renew-throw", turnId: "turn-renew-throw", runId: "run-renew-throw", attemptId: "attempt-renew-throw",
  intentRevision: 1, catalog, userMessage: "检查入口文件",
}), /run_lease_lost/u);
assert.equal(renewalException.hostCalls(), 1, "a renewal exception after Host must not replay Host");
const renewalExceptionBundle = await renewalExceptionStore.readRecoveryBundle({ runId: "run-renew-throw", eventLimit: 20 });
assert.equal(renewalExceptionBundle.kind, "found");
if (renewalExceptionBundle.kind === "found") {
  assert.equal(renewalExceptionBundle.bundle.invocations[0]?.invocation.status, "executing");
  assert.equal(renewalExceptionBundle.bundle.invocations[0]?.receipt, null);
}

class ThrowingAtomicTerminalCommitStore extends MemorySessionStore {
  override async commitTerminalModelStepResultAndSnapshot(
    ..._input: Parameters<MemorySessionStore["commitTerminalModelStepResultAndSnapshot"]>
  ): Promise<never> {
    throw new Error("injected_atomic_terminal_commit_failure");
  }
}

class UnknownInvocationExecutionStore extends MemorySessionStore {
  override async beginInvocationExecution(
    ..._input: Parameters<MemorySessionStore["beginInvocationExecution"]>
  ): Promise<{ kind: "already_executing_or_unknown" }> {
    return { kind: "already_executing_or_unknown" };
  }
}

class ThrowingBeginInvocationStore extends MemorySessionStore {
  override async beginInvocationExecution(
    ..._input: Parameters<MemorySessionStore["beginInvocationExecution"]>
  ): Promise<never> {
    throw new Error("injected_begin_invocation_execution_failure");
  }
}

class ConflictingBeginInvocationStore extends MemorySessionStore {
  override async beginInvocationExecution(
    ..._input: Parameters<MemorySessionStore["beginInvocationExecution"]>
  ) {
    return { kind: "conflict" as const, code: "invocation_execution_conflict" as const };
  }
}

class PersistentReceiptReplayStore extends MemorySessionStore {
  override async beginInvocationExecution(
    ...input: Parameters<MemorySessionStore["beginInvocationExecution"]>
  ) {
    const started = await super.beginInvocationExecution(input[0]);
    if (started.kind !== "started") return started;
    const reservation = await super.readReservation({
      runId: input[0].runId,
      attemptId: input[0].attemptId,
      invocationId: "invocation-deepseek-0-0",
    });
    if (!reservation) return { kind: "conflict" as const, code: "invocation_execution_conflict" as const };
    const receipt: ToolReceipt = {
      schemaVersion: "meliora.tool-receipt.v1",
      receiptId: "durable-replay-receipt",
      invocationId: reservation.invocationId,
      runId: reservation.runId,
      attemptId: reservation.attemptId,
      toolName: "read_file",
      toolVersion: "1.0.0",
      argumentsHash: 'hash:{"path":"packages/agent-runtime/run-state.ts"}',
      catalogHash: "catalog-fixture-v1",
      decision: "allow",
      startedAt: fixedNow,
      endedAt: fixedNow,
      status: "succeeded",
      effectSummary: "durable replay proof",
      verificationArtifactIds: ["private-artifact-id"],
      redactions: [],
    };
    const committed = await super.commitReceipt({
      runId: reservation.runId,
      attemptId: reservation.attemptId,
      leaseToken: input[0].leaseToken,
      reservationId: reservation.reservationId,
      receipt,
    });
    if (committed.kind !== "committed") throw new Error("fixture_durable_receipt_failed");
    return { kind: "receipt_replay" as const, receiptId: receipt.receiptId };
  }
}

sequence = 0;
const atomicFailure = createLoop([deepseekStreamTextSingleToolFixture.expectedEvents], "succeeded", {
  store: new ThrowingAtomicTerminalCommitStore({ clock: () => new Date(fixedNow) }),
});
const atomicFailureResult = await runWithCommand(atomicFailure, {
  sessionId: "session-atomic-failure", workspaceId: "workspace-atomic-failure", turnId: "turn-atomic-failure", runId: "run-atomic-failure", attemptId: "attempt-atomic-failure",
  intentRevision: 1, catalog, userMessage: "检查入口文件",
});
assert.equal(atomicFailureResult.outcome.status, "blocked");
assert.equal(atomicFailureResult.outcome.unresolved[0]?.code, "model_step_outcome_unknown");
assert.equal(atomicFailure.hostCalls(), 0, "an ambiguous terminal commit must not expose work to Host");
assert.equal((await atomicFailure.store.readLatestModelStep({ runId: "run-atomic-failure" }))?.status, "started");

sequence = 0;
const executionUnknown = createLoop([deepseekStreamTextSingleToolFixture.expectedEvents], "succeeded", {
  store: new UnknownInvocationExecutionStore({ clock: () => new Date(fixedNow) }),
});
const executionUnknownResult = await runWithCommand(executionUnknown, {
  sessionId: "session-execution-unknown", workspaceId: "workspace-execution-unknown", turnId: "turn-execution-unknown", runId: "run-execution-unknown", attemptId: "attempt-execution-unknown",
  intentRevision: 1, catalog, userMessage: "检查入口文件",
});
assert.equal(executionUnknownResult.outcome.status, "blocked");
assert.equal(executionUnknownResult.outcome.unresolved[0]?.code, "tool_invocation_outcome_unknown");
assert.equal(executionUnknown.hostCalls(), 0, "unknown invocation ownership must never execute Host");

for (const scenario of [
  { name: "throw", store: new ThrowingBeginInvocationStore({ clock: () => new Date(fixedNow) }) },
  { name: "conflict", store: new ConflictingBeginInvocationStore({ clock: () => new Date(fixedNow) }) },
] as const) {
  sequence = 0;
  const beginUncertain = createLoop([deepseekStreamTextSingleToolFixture.expectedEvents], "succeeded", { store: scenario.store });
  const beginUncertainResult = await runWithCommand(beginUncertain, {
    sessionId: `session-begin-${scenario.name}`, workspaceId: `workspace-begin-${scenario.name}`, turnId: `turn-begin-${scenario.name}`, runId: `run-begin-${scenario.name}`, attemptId: `attempt-begin-${scenario.name}`,
    intentRevision: 1, catalog, userMessage: "检查入口文件",
  });
  assert.equal(beginUncertainResult.outcome.status, "blocked");
  assert.equal(beginUncertainResult.outcome.unresolved[0]?.code, "tool_invocation_outcome_unknown");
  assert.equal(beginUncertain.hostCalls(), 0, `begin ${scenario.name} must not permit Host execution`);
}

sequence = 0;
const hostThrow = createLoop([deepseekStreamTextSingleToolFixture.expectedEvents], "succeeded", { throwFromHost: true });
const hostThrowResult = await runWithCommand(hostThrow, {
  sessionId: "session-host-throw", workspaceId: "workspace-host-throw", turnId: "turn-host-throw", runId: "run-host-throw", attemptId: "attempt-host-throw",
  intentRevision: 1, catalog, userMessage: "检查入口文件",
});
assert.equal(hostThrowResult.outcome.status, "blocked");
assert.equal(hostThrowResult.outcome.unresolved[0]?.code, "tool_invocation_outcome_unknown");
assert.equal(hostThrow.hostCalls(), 1);
const hostThrowBundle = await hostThrow.store.readRecoveryBundle({ runId: "run-host-throw", eventLimit: 20 });
assert.equal(hostThrowBundle.kind, "found");
if (hostThrowBundle.kind === "found") {
  assert.equal(hostThrowBundle.bundle.invocations[0]?.invocation.status, "executing");
  assert.equal(hostThrowBundle.bundle.invocations[0]?.receipt, null, "a Host throw must leave no synthetic receipt");
}

sequence = 0;
const durableReceiptReplay = createLoop([
  deepseekStreamTextSingleToolFixture.expectedEvents,
  finalStop("ignored"),
], "succeeded", {
  store: new PersistentReceiptReplayStore({ clock: () => new Date(fixedNow) }),
});
const durableReceiptReplayResult = await runWithCommand(durableReceiptReplay, {
  sessionId: "session-durable-replay", workspaceId: "workspace-durable-replay", turnId: "turn-durable-replay", runId: "run-durable-replay", attemptId: "attempt-durable-replay",
  intentRevision: 1, catalog, userMessage: "检查入口文件",
});
assert.equal(durableReceiptReplayResult.outcome.status, "completed");
assert.equal(durableReceiptReplay.hostCalls(), 0, "begin receipt_replay must use Store receipt without calling Host");
assert.deepEqual(durableReceiptReplayResult.outcome.receiptRefs, ["durable-replay-receipt"], "the current execution's newly generated receipt must not impersonate the durable receipt");
assert.equal((await durableReceiptReplay.store.readReceipt({ runId: "run-durable-replay", attemptId: "attempt-durable-replay", receiptId: "durable-replay-receipt" }))?.effectSummary, "durable replay proof");

sequence = 0;
const explicitCancelled = createLoop([deepseekStreamTextSingleToolFixture.expectedEvents], "cancelled");
const explicitCancelledResult = await runWithCommand(explicitCancelled, {
  sessionId: "session-explicit-cancel", workspaceId: "workspace-explicit-cancel", turnId: "turn-explicit-cancel", runId: "run-explicit-cancel", attemptId: "attempt-explicit-cancel",
  intentRevision: 1, catalog, userMessage: "检查入口文件",
});
assert.equal(explicitCancelledResult.outcome.status, "cancelled");
assert.equal(explicitCancelled.hostCalls(), 1);
assert.equal((await explicitCancelled.store.readReceipt({
  runId: "run-explicit-cancel", attemptId: "attempt-explicit-cancel", receiptId: explicitCancelledResult.outcome.receiptRefs[0]!,
}))?.status, "cancelled", "an explicitly returned cancellation is durable evidence, unlike a throw/abort");

console.log(JSON.stringify({
  gate: "meliora-m0-read-only-run-loop",
  status: "PASS",
  scenarios: ["model-tool-receipt-provider-follow-up-outcome", "safe-tool-projection", "tool-failure", "cancel-before-start", "lease-heartbeat", "atomic-commit-host-zero", "unknown-execution-host-zero", "begin-throw-conflict-host-zero", "host-throw-preserves-executing", "durable-receipt-replay-host-zero", "explicit-cancel-receipted"],
}));
