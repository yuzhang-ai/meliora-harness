import type {
  CanonicalInputMessage,
  CanonicalModelEvent,
  JsonObject,
  JsonValue,
} from "../model-protocol/contracts";
import type {
  NewEvent,
  SessionStorePort,
} from "../session-store/contracts";
import type {
  NormalizedToolInvocation,
  ToolCatalogSnapshot,
  ToolDefinition,
  ToolReceipt,
} from "../tool-runtime/contracts";
import { evaluateActionGate } from "../tool-runtime/evaluate-action-gate";
import { checkOutcomeContract, type TurnOutcome } from "./outcome";
import {
  PUBLIC_RUN_EVENT_SCHEMA_VERSION,
  type PublicArtifactRef,
  type PublicRunEvent,
} from "./public-events";
import { canTransitionRun, type RunStatus } from "./run-state";

/**
 * M0 fixture-oriented orchestration boundary.  Provider transport, schema
 * validation and Workspace Host execution stay behind these ports so this loop
 * can be replayed without credentials or filesystem access.
 */
export type ReadOnlyRunModelPort = Readonly<{
  next(input: Readonly<{
    modelStepId: string;
    messages: readonly CanonicalInputMessage[];
    signal: AbortSignal;
  }>): Promise<readonly CanonicalModelEvent[]>;
}>;

export type ReadOnlyToolExecution = Readonly<{
  status: "succeeded" | "failed" | "cancelled";
  effectSummary: string;
  outputArtifactId?: string;
  verification?: Readonly<{
    verificationId: string;
    status: "passed" | "failed" | "not_run";
    evidenceArtifactIds: readonly string[];
  }>;
}>;

export type ReadOnlyToolProjection = Readonly<{
  /** Redacted content that may be sent back to the model provider. */
  modelContent: string;
  /** Redacted summary that may be persisted in receipts and public events. */
  publicSummary: string;
  /** Candidate refs; the loop still checks each ref with isPublicArtifact. */
  publicArtifactIds: readonly string[];
  publicVerificationArtifactIds: readonly string[];
}>;

export type ReadOnlyToolPort = Readonly<{
  execute(invocation: NormalizedToolInvocation, signal: AbortSignal): Promise<ReadOnlyToolExecution>;
}>;

export type ReadOnlyRunIds = Readonly<{
  nextModelStepId(): string;
  nextEventId(): string;
  nextReceiptId(): string;
  nextOutcomeId(): string;
}>;

export type ReadOnlyModelStepCheckpointGate = Readonly<{
  start(input: Readonly<{
    runId: string;
    attemptId: string;
    leaseToken: string;
    modelStepId: string;
    messages: readonly CanonicalInputMessage[];
    catalog: ToolCatalogSnapshot;
    startedAt: string;
  }>): Promise<
    | Readonly<{ kind: "started"; requestFingerprint: string }>
    | Readonly<{ kind: "replay"; requestFingerprint: string; status: "terminal" | "failed" }>
    | Readonly<{ kind: "conflict"; code: string }>
  >;
  finish(input: Readonly<{
    runId: string;
    attemptId: string;
    leaseToken: string;
    modelStepId: string;
    requestFingerprint: string;
    outcome:
      | Readonly<{ status: "terminal"; finishedAt: string }>
      | Readonly<{ status: "failed"; failureCode: string; finishedAt: string }>;
  }>): Promise<
    | Readonly<{ kind: "committed" | "replay" }>
    | Readonly<{ kind: "conflict"; code: string }>
  >;
}>;

export type ReadOnlyRunLoopDependencies = Readonly<{
  store: SessionStorePort;
  model: ReadOnlyRunModelPort;
  tools: ReadOnlyToolPort;
  ids: ReadOnlyRunIds;
  /** Mandatory durable gate: Provider I/O is forbidden until start returns a new checkpoint. */
  modelStepCheckpoint: ReadOnlyModelStepCheckpointGate;
  now(): string;
  hashArguments(argumentsValue: JsonObject): string;
  validateArguments?(definition: ToolDefinition, argumentsValue: JsonObject): string | null;
  describeTool?(definition: ToolDefinition, argumentsValue: JsonObject): string;
  projectToolResult(input: Readonly<{
    definition: ToolDefinition;
    invocation: NormalizedToolInvocation;
    execution: ReadOnlyToolExecution;
  }>): ReadOnlyToolProjection | Promise<ReadOnlyToolProjection>;
  /**
   * Server-owned public projection for assistant text before any private tool
   * observation has entered the current model-call context. Once a private tool
   * observation is present, the loop publishes only a fixed redaction notice.
   */
  projectAssistantText(input: Readonly<{ content: string }>): string | Promise<string>;
  isPublicArtifact(artifactId: string): Promise<boolean>;
  ownerId: string;
  leaseTtlMs: number;
  policyVersion: string;
  principalId: string;
}>;

export type ReadOnlyRunLoopInput = Readonly<{
  sessionId: string;
  workspaceId: string;
  turnId: string;
  runId: string;
  attemptId: string;
  intentRevision: number;
  catalog: ToolCatalogSnapshot;
  userMessage: string;
  signal?: AbortSignal;
  maxModelSteps?: number;
  precreated?: Readonly<{
    leaseToken: string;
  }>;
}>;

export type ReadOnlyRunLoopResult = Readonly<{
  outcome: TurnOutcome;
  publicEvents: readonly PublicRunEvent[];
}>;

type CompletedToolCall = Readonly<{
  invocationId: string;
  toolName: string;
  rawArguments: string;
  providerToolCallId?: string;
}>;

const jsonObject = (raw: string): JsonObject | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as JsonObject
      : null;
  } catch {
    return null;
  }
};

const asPublicArtifacts = (ids: readonly string[]): PublicArtifactRef[] =>
  ids.map((artifactId) => ({ artifactId, visibility: "public" }));

const MODEL_STEP_OUTCOME_UNKNOWN_CODE = "model_step_outcome_unknown";
const MODEL_STEP_OUTCOME_UNKNOWN_SUMMARY = "模型步骤结果未知，已停止自动重发 Provider 请求。";
const MODEL_STEP_OUTCOME_UNKNOWN_ACTIONS = ["从持久化事件、Provider 幂等查询或后续恢复快照确认结果后再继续。"] as const;
const DETERMINISTIC_PROVIDER_FAILURE_CODES = new Set(["provider_authentication_failed", "provider_rate_limited"]);
const PRIVATE_TOOL_RESULT_ASSISTANT_REDACTION = "模型已基于私有工具结果生成回复，内容已隐藏。";
const defaultSummary = (definition: ToolDefinition): string => `正在执行只读工具 ${definition.name}。`;
const isLeaseLostError = (error: unknown): boolean => error instanceof Error && error.message === "run_lease_lost";
const isAmbiguousProviderFailure = (event: Extract<CanonicalModelEvent, { kind: "model_step_failed" }>): boolean =>
  !DETERMINISTIC_PROVIDER_FAILURE_CODES.has(event.code);

/**
 * Durable minimum Run loop for M0. It intentionally accepts only L0 tools;
 * write/approval flows remain a later state-machine slice.
 */
export class ReadOnlyRunLoop {
  private readonly validateArguments: NonNullable<ReadOnlyRunLoopDependencies["validateArguments"]>;
  private readonly describeTool: NonNullable<ReadOnlyRunLoopDependencies["describeTool"]>;

  constructor(private readonly dependencies: ReadOnlyRunLoopDependencies) {
    this.validateArguments = dependencies.validateArguments ?? (() => null);
    this.describeTool = dependencies.describeTool ?? defaultSummary;
  }

  async run(input: ReadOnlyRunLoopInput): Promise<ReadOnlyRunLoopResult> {
    const signal = input.signal ?? new AbortController().signal;
    const publicEvents: PublicRunEvent[] = [];
    let sequence = 0;
    let status: RunStatus = "created";
    let leaseToken = "";
    const receipts: ToolReceipt[] = [];
    const verificationIds: string[] = [];
    const publicEvidenceIds: string[] = [];
    let hasPrivateToolResultObservation = false;
    const messages: CanonicalInputMessage[] = [{ role: "user", content: input.userMessage }];
    const catalogByName = new Map(input.catalog.definitions.map((definition) => [definition.name, definition]));

    if (!Number.isSafeInteger(this.dependencies.leaseTtlMs) || this.dependencies.leaseTtlMs <= 0) {
      throw new Error("lease_ttl_invalid");
    }

    let leaseLost = false;
    let heartbeatTail = Promise.resolve();

    const renewLeaseOrThrow = async (): Promise<void> => {
      if (leaseLost || leaseToken.length === 0) throw new Error("run_lease_lost");
      const renewed = await this.dependencies.store.renewLease({
        runId: input.runId,
        attemptId: input.attemptId,
        leaseToken,
        ttlMs: this.dependencies.leaseTtlMs,
        renewedAt: this.dependencies.now(),
      });
      if (!renewed) {
        leaseLost = true;
        throw new Error("run_lease_lost");
      }
    };

    const withLeaseHeartbeat = async <T>(operation: () => Promise<T>): Promise<T> => {
      await renewLeaseOrThrow();
      const intervalMs = Math.max(1, Math.min(1_000, Math.floor(this.dependencies.leaseTtlMs / 3)));
      const timer = setInterval(() => {
        heartbeatTail = heartbeatTail
          .then(() => renewLeaseOrThrow())
          .catch(() => { leaseLost = true; });
      }, intervalMs);
      timer.unref?.();
      try {
        const result = await operation();
        await heartbeatTail;
        await renewLeaseOrThrow();
        return result;
      } finally {
        clearInterval(timer);
      }
    };

    const append = async (events: readonly NewEvent[]): Promise<void> => {
      await renewLeaseOrThrow();
      const result = await this.dependencies.store.appendEvents({
        runId: input.runId,
        attemptId: input.attemptId,
        expectedSequence: sequence,
        leaseToken,
        events,
      });
      if (result.kind !== "appended") {
        throw new Error(`session_store_append_${result.code}`);
      }
      sequence = result.lastSequence;
    };

    const publish = async <K extends PublicRunEvent["kind"]>(
      kind: K,
      payload: Extract<PublicRunEvent, { kind: K }>["payload"],
    ): Promise<void> => {
      const eventId = this.dependencies.ids.nextEventId();
      const timestamp = this.dependencies.now();
      await append([{
        schemaVersion: "meliora.session-event.v1",
        eventId,
        kind,
        visibility: "public",
        payload: payload as JsonValue,
        createdAt: timestamp,
      }]);
      publicEvents.push({
        schemaVersion: PUBLIC_RUN_EVENT_SCHEMA_VERSION,
        eventId,
        sessionId: input.sessionId,
        runId: input.runId,
        sequence,
        timestamp,
        visibility: "public",
        kind,
        payload,
      } as Extract<PublicRunEvent, { kind: K }>);
    };

    const persistModelEvent = async (event: CanonicalModelEvent): Promise<void> => {
      await append([{
        schemaVersion: "meliora.session-event.v1",
        eventId: this.dependencies.ids.nextEventId(),
        kind: `model.${event.kind}`,
        visibility: "private",
        payload: event as JsonValue,
        createdAt: this.dependencies.now(),
      }]);
    };

    const changeStatus = async (next: RunStatus, reason?: string): Promise<void> => {
      if (!canTransitionRun(status, next)) {
        throw new Error(`invalid_run_transition_${status}_to_${next}`);
      }
      status = next;
      await publish("run_status_changed", reason === undefined ? { status: next } : { status: next, reason });
    };

    const terminal = async (
      terminalStatus: Extract<RunStatus, "completed" | "blocked" | "failed" | "cancelled">,
      summary: string,
      code?: string,
      retryable = false,
      userActions: readonly string[] = [],
    ): Promise<ReadOnlyRunLoopResult> => {
      if (status !== "verifying" && status !== "model_streaming" && status !== "tool_assembling" && status !== "executing_tools" && status !== "preparing") {
        throw new Error(`invalid_terminal_source_${status}`);
      }
      if (terminalStatus === "completed" && status !== "verifying") await changeStatus("verifying");
      await changeStatus(terminalStatus, code);
      const outcome: TurnOutcome = {
        schemaVersion: "meliora.turn-outcome.v1",
        outcomeId: this.dependencies.ids.nextOutcomeId(),
        sessionId: input.sessionId,
        turnId: input.turnId,
        runId: input.runId,
        attemptId: input.attemptId,
        status: terminalStatus,
        summary,
        deliverableRefs: [],
        receiptRefs: receipts.map((receipt) => receipt.receiptId),
        verificationRefs: verificationIds,
        unresolved: terminalStatus === "completed" ? [] : [{ code: code ?? terminalStatus, message: summary, blocking: terminalStatus === "blocked" }],
        userActions,
        evidenceRefs: [...new Set(publicEvidenceIds)],
        proposedAt: this.dependencies.now(),
        ...(terminalStatus === "completed" ? { acceptedAt: this.dependencies.now() } : {}),
      };
      if (terminalStatus === "completed") {
        const checked = checkOutcomeContract(outcome, {
          pendingInvocationIds: [],
          pendingApprovalIds: [],
          requiredReceiptIds: [],
          receiptIds: receipts.map((receipt) => receipt.receiptId),
          verificationIds,
          terminalEventPersisted: true,
        });
        if (checked.decision === "rejected") {
          throw new Error(`completion_rejected_${checked.reasons.map((reason) => reason.code).join("_")}`);
        }
        await publish("run_completed", { outcomeId: outcome.outcomeId, summary });
      } else if (terminalStatus === "blocked") {
        await publish("run_blocked", { code: code ?? "run_blocked", message: summary, userActions: [...userActions] });
      } else if (terminalStatus === "failed") {
        await publish("run_failed", { code: code ?? "run_failed", retryable, message: summary });
      } else {
        await publish("run_cancelled", { reason: summary });
      }
      return { outcome, publicEvents };
    };
    const terminalModelStepOutcomeUnknown = (): Promise<ReadOnlyRunLoopResult> =>
      terminal(
        "blocked",
        MODEL_STEP_OUTCOME_UNKNOWN_SUMMARY,
        MODEL_STEP_OUTCOME_UNKNOWN_CODE,
        false,
        MODEL_STEP_OUTCOME_UNKNOWN_ACTIONS,
      );

    const startedCheckpointRemains = async (
      modelStepId: string,
      requestFingerprint?: string,
    ): Promise<boolean> => {
      const checkpoint = await this.dependencies.store.readModelStep({ runId: input.runId, modelStepId });
      return checkpoint?.status === "started"
        && checkpoint.attemptId === input.attemptId
        && (requestFingerprint === undefined || checkpoint.requestFingerprint === requestFingerprint);
    };

    if (input.precreated) {
      if (input.precreated.leaseToken.length === 0) throw new Error("run_lease_missing");
      leaseToken = input.precreated.leaseToken;
    } else {
      await this.dependencies.store.createSession({ sessionId: input.sessionId, workspaceId: input.workspaceId, createdAt: this.dependencies.now() });
      await this.dependencies.store.createTurn({ sessionId: input.sessionId, turnId: input.turnId, intentRevision: input.intentRevision, createdAt: this.dependencies.now() });
      await this.dependencies.store.createRun({
        sessionId: input.sessionId,
        turnId: input.turnId,
        runId: input.runId,
        initialAttemptId: input.attemptId,
        catalogHash: input.catalog.catalogHash,
        intentRevision: input.intentRevision,
        createdAt: this.dependencies.now(),
      });
      const lease = await this.dependencies.store.acquireLease({
        runId: input.runId,
        attemptId: input.attemptId,
        ownerId: this.dependencies.ownerId,
        ttlMs: this.dependencies.leaseTtlMs,
        requestedAt: this.dependencies.now(),
      });
      if (lease.kind !== "acquired") throw new Error(`run_lease_${lease.kind}`);
      leaseToken = lease.leaseToken;
    }
    await changeStatus("preparing");

    if (signal.aborted) return terminal("cancelled", "任务已在执行前取消。", "cancelled_before_start");

    const maxModelSteps = input.maxModelSteps ?? 8;
    for (let step = 0; step < maxModelSteps; step += 1) {
      if (signal.aborted) return terminal("cancelled", "用户取消了当前任务。", "user_requested");
      await changeStatus("model_streaming");
      const modelStepId = this.dependencies.ids.nextModelStepId();
      let requestFingerprint: string | undefined;
      let modelEvents: readonly CanonicalModelEvent[];
      try {
        const checkpoint = await this.dependencies.modelStepCheckpoint.start({
          runId: input.runId,
          attemptId: input.attemptId,
          leaseToken,
          modelStepId,
          messages,
          catalog: input.catalog,
          startedAt: this.dependencies.now(),
        });
        if (checkpoint.kind === "conflict") {
          return terminal(
            checkpoint.code === "model_step_in_progress" ? "blocked" : "failed",
            "模型步骤 checkpoint 无法安全开始。",
            checkpoint.code,
            checkpoint.code !== "model_step_in_progress",
            checkpoint.code === "model_step_in_progress" ? ["等待当前模型步骤结果确认后再恢复。"] : [],
          );
        }
        if (checkpoint.kind === "replay") {
          return terminal(
            checkpoint.status === "terminal" ? "blocked" : "failed",
            "模型步骤已存在，当前执行不会重复请求 Provider。",
            checkpoint.status === "terminal" ? "model_step_replay_without_recovery" : "model_step_failed_checkpoint",
            false,
            checkpoint.status === "terminal" ? ["从持久化事件或快照恢复该 Run。"] : [],
          );
        }
        requestFingerprint = checkpoint.requestFingerprint;
        modelEvents = await withLeaseHeartbeat(() => this.dependencies.model.next({ modelStepId, messages, signal }));
      } catch (error) {
        if (isLeaseLostError(error)) throw error;
        if (await startedCheckpointRemains(modelStepId, requestFingerprint)) {
          return terminalModelStepOutcomeUnknown();
        }
        return terminal("failed", "模型调用失败。", "provider_request_failed", true);
      }
      if (requestFingerprint) {
        const failedEvent = modelEvents.find((event): event is Extract<CanonicalModelEvent, { kind: "model_step_failed" }> =>
          event.kind === "model_step_failed",
        );
        if (failedEvent && isAmbiguousProviderFailure(failedEvent)) {
          return terminalModelStepOutcomeUnknown();
        }
        let finished: Awaited<ReturnType<ReadOnlyModelStepCheckpointGate["finish"]>>;
        try {
          finished = await this.dependencies.modelStepCheckpoint.finish({
            runId: input.runId,
            attemptId: input.attemptId,
            leaseToken,
            modelStepId,
            requestFingerprint,
            outcome: failedEvent
              ? { status: "failed", failureCode: failedEvent.code, finishedAt: this.dependencies.now() }
              : { status: "terminal", finishedAt: this.dependencies.now() },
          });
        } catch (error) {
          if (isLeaseLostError(error)) throw error;
          if (await startedCheckpointRemains(modelStepId, requestFingerprint)) {
            return terminalModelStepOutcomeUnknown();
          }
          throw error;
        }
        if (finished?.kind === "conflict") {
          if (await startedCheckpointRemains(modelStepId, requestFingerprint)) {
            return terminalModelStepOutcomeUnknown();
          }
          return terminal("failed", "模型步骤 checkpoint 无法安全结束。", finished.code, true);
        }
      }
      const completedCalls: CompletedToolCall[] = [];
      let assistantContent = "";
      const assistantDeltas: string[] = [];
      let finishReason: Extract<CanonicalModelEvent, { kind: "model_step_completed" }>["finishReason"] | undefined;
      for (const event of modelEvents) {
        await persistModelEvent(event);
        if (event.kind === "assistant_text_delta") {
          assistantContent += event.delta;
          assistantDeltas.push(event.delta);
        } else if (event.kind === "tool_call_completed") {
          const started = modelEvents.find((candidate): candidate is Extract<CanonicalModelEvent, { kind: "tool_call_started" }> =>
            candidate.kind === "tool_call_started" && candidate.invocationId === event.invocationId,
          );
          if (started) completedCalls.push({
            invocationId: event.invocationId,
            toolName: started.toolName,
            rawArguments: event.rawArguments,
            ...(started.providerToolCallId === undefined ? {} : { providerToolCallId: started.providerToolCallId }),
          });
        } else if (event.kind === "model_step_failed") {
          return terminal("failed", event.safeMessage ?? "模型流中断。", event.code, event.retryable);
        } else if (event.kind === "model_step_completed") {
          finishReason = event.finishReason;
        }
      }
      if (assistantDeltas.length > 0) {
        let publicAssistantContent: string;
        if (hasPrivateToolResultObservation) {
          publicAssistantContent = PRIVATE_TOOL_RESULT_ASSISTANT_REDACTION;
        } else {
          try {
            publicAssistantContent = await withLeaseHeartbeat(() => Promise.resolve(
              this.dependencies.projectAssistantText({ content: assistantContent }),
            ));
          } catch (error) {
            if (isLeaseLostError(error)) throw error;
            publicAssistantContent = "模型输出包含无法安全公开的内容，已隐藏。";
          }
        }
        if (publicAssistantContent === assistantContent) {
          for (const delta of assistantDeltas) await publish("assistant_text_delta", { delta });
        } else if (publicAssistantContent.length > 0) {
          await publish("assistant_text_delta", { delta: publicAssistantContent });
        }
      }
      if (assistantContent.length > 0 || completedCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: assistantContent,
          ...(completedCalls.length === 0 ? {} : {
            toolCalls: completedCalls.map((call) => ({
              invocationId: call.invocationId,
              toolName: call.toolName,
              rawArguments: call.rawArguments,
              ...(call.providerToolCallId === undefined ? {} : { providerToolCallId: call.providerToolCallId }),
            })),
          }),
        });
      }
      if (signal.aborted) return terminal("cancelled", "用户取消了当前任务。", "user_requested");
      if (finishReason === "length" || finishReason === "content_filter" || finishReason === "unknown" || finishReason === undefined) {
        return terminal("blocked", "模型未提供可继续执行的完成原因。", "model_completion_incomplete", false, ["请缩小任务范围或重试。"]);
      }
      if (finishReason === "cancelled") return terminal("cancelled", "模型流已取消。", "provider_cancelled");
      if (completedCalls.length === 0) {
        if (finishReason === "tool_calls") return terminal("failed", "模型请求工具但没有完整工具调用。", "incomplete_tool_call");
        await changeStatus("verifying");
        if (verificationIds.length === 0) {
          return terminal("blocked", "缺少可验证的只读工具证据。", "verification_missing", false, ["请让模型执行必要的只读检查。"]);
        }
        return terminal("completed", "只读检查已完成并已验证。");
      }

      await changeStatus("tool_assembling");
      let toolsStarted = false;
      for (const call of completedCalls) {
        const definition = catalogByName.get(call.toolName);
        const argumentsValue = jsonObject(call.rawArguments);
        if (!definition || !argumentsValue) {
          return terminal("failed", "工具调用名称或参数不符合冻结目录。", "tool_call_invalid");
        }
        if (definition.risk !== "L0") {
          return terminal("blocked", "当前最小运行环只允许只读工具。", "non_read_only_tool", false, ["请创建包含审批流程的新 Run。"]);
        }
        const validationError = this.validateArguments(definition, argumentsValue);
        if (validationError) return terminal("failed", validationError, "tool_arguments_invalid");
        const argumentsHash = this.dependencies.hashArguments(argumentsValue);
        const gate = evaluateActionGate({
          schemaVersion: "meliora.action-gate.v1",
          principal: { id: this.dependencies.principalId, kind: "user" },
          workspaceId: input.workspaceId,
          runId: input.runId,
          attemptId: input.attemptId,
          tool: { name: definition.name, version: definition.version },
          effectiveRisk: definition.risk,
          catalogHash: input.catalog.catalogHash,
          policyVersion: this.dependencies.policyVersion,
          argumentsHash,
          grants: [],
          priorReceiptIds: receipts.map((receipt) => receipt.receiptId),
        }, new Date(this.dependencies.now()));
        if (gate.decision !== "allow") {
          return terminal("blocked", "只读工具未通过执行策略。", gate.reasonCode, false, ["检查工具目录与权限策略。"]);
        }
        const invocation: NormalizedToolInvocation = {
          schemaVersion: "meliora.tool-invocation.v1",
          invocationId: call.invocationId,
          runId: input.runId,
          attemptId: input.attemptId,
          toolName: definition.name,
          toolVersion: definition.version,
          arguments: argumentsValue,
          argumentsHash,
          catalogHash: input.catalog.catalogHash,
          idempotencyKey: `${input.runId}:${input.attemptId}:${call.invocationId}:${argumentsHash}`,
          status: "reserved",
        };
        await publish("tool_call_presented", {
          invocationId: invocation.invocationId,
          toolName: definition.name,
          risk: definition.risk,
          summary: this.describeTool(definition, argumentsValue),
        });
        const reservation = await this.dependencies.store.reserveInvocation({
          invocation,
          leaseToken,
          reservedAt: this.dependencies.now(),
        });
        if (reservation.kind === "conflict") return terminal("failed", "无法保留工具调用。", reservation.code, true);
        if (!toolsStarted) {
          await changeStatus("executing_tools");
          toolsStarted = true;
        }
        let execution: ReadOnlyToolExecution;
        const startedAt = this.dependencies.now();
        if (reservation.kind === "replay" && reservation.receipt) {
          execution = {
            status: reservation.receipt.status,
            effectSummary: reservation.receipt.effectSummary,
            outputArtifactId: reservation.receipt.outputArtifactId,
            verification: reservation.receipt.verificationArtifactIds.length > 0
              ? { verificationId: `verification:${reservation.receipt.receiptId}`, status: "passed", evidenceArtifactIds: reservation.receipt.verificationArtifactIds }
              : undefined,
          };
        } else {
          try {
            execution = await withLeaseHeartbeat(() => this.dependencies.tools.execute(invocation, signal));
          } catch (error) {
            if (isLeaseLostError(error)) throw error;
            execution = { status: signal.aborted ? "cancelled" : "failed", effectSummary: "只读工具执行失败。" };
          }
        }
        if (signal.aborted || execution.status === "cancelled") return terminal("cancelled", "用户取消了当前任务。", "user_requested");
        let projection: ReadOnlyToolProjection;
        try {
          projection = await withLeaseHeartbeat(() => Promise.resolve(
            this.dependencies.projectToolResult({ definition, invocation, execution }),
          ));
        } catch (error) {
          if (isLeaseLostError(error)) throw error;
          projection = {
            modelContent: "只读工具结果无法安全投影。",
            publicSummary: "只读工具结果无法安全投影。",
            publicArtifactIds: [],
            publicVerificationArtifactIds: [],
          };
        }
        const publicArtifactIds: string[] = [];
        for (const artifactId of [...new Set([
          ...projection.publicArtifactIds,
          ...projection.publicVerificationArtifactIds,
        ])]) {
          if (await withLeaseHeartbeat(() => this.dependencies.isPublicArtifact(artifactId))) publicArtifactIds.push(artifactId);
        }
        if (signal.aborted) return terminal("cancelled", "用户取消了当前任务。", "user_requested");
        const publicVerificationArtifactIds = projection.publicVerificationArtifactIds.filter((id) => publicArtifactIds.includes(id));
        const newReceipt: ToolReceipt = {
          schemaVersion: "meliora.tool-receipt.v1",
          receiptId: this.dependencies.ids.nextReceiptId(),
          invocationId: invocation.invocationId,
          runId: input.runId,
          attemptId: input.attemptId,
          toolName: definition.name,
          toolVersion: definition.version,
          argumentsHash,
          catalogHash: input.catalog.catalogHash,
          decision: "allow",
          startedAt,
          endedAt: this.dependencies.now(),
          status: execution.status,
          effectSummary: projection.publicSummary,
          ...(publicArtifactIds[0] === undefined ? {} : { outputArtifactId: publicArtifactIds[0] }),
          verificationArtifactIds: publicVerificationArtifactIds,
          redactions: [],
        };
        const committed = reservation.kind === "replay" && reservation.receipt
          ? { kind: "replay" as const, receiptId: reservation.receipt.receiptId }
          : await (async () => {
              await renewLeaseOrThrow();
              return this.dependencies.store.commitReceipt({ runId: input.runId, attemptId: input.attemptId, leaseToken, reservationId: reservation.reservationId, receipt: newReceipt });
            })();
        if (committed.kind === "conflict") return terminal("failed", "无法提交工具回执。", committed.code, true);
        receipts.push(reservation.kind === "replay" && reservation.receipt ? reservation.receipt : newReceipt);
        publicEvidenceIds.push(...publicVerificationArtifactIds);
        await publish("tool_result_presented", {
          invocationId: invocation.invocationId,
          status: execution.status,
          summary: projection.publicSummary,
          artifactRefs: asPublicArtifacts(publicArtifactIds),
        });
        if ((execution.outputArtifactId !== undefined || projection.modelContent !== projection.publicSummary) && projection.modelContent.length > 0) {
          hasPrivateToolResultObservation = true;
        }
        if (execution.status === "failed") return terminal("failed", projection.publicSummary, "tool_execution_failed", true);
        if (!execution.verification || execution.verification.status !== "passed") {
          return terminal("blocked", "只读工具完成，但验证尚未通过。", "verification_missing", false, ["请执行或补充验证。"]);
        }
        verificationIds.push(execution.verification.verificationId);
        await publish("verification_updated", {
          verificationId: execution.verification.verificationId,
          status: execution.verification.status,
          evidenceRefs: asPublicArtifacts(publicVerificationArtifactIds),
        });
        messages.push({ role: "tool", invocationId: invocation.invocationId, content: projection.modelContent });
      }
    }
    return terminal("blocked", "达到模型步骤预算，尚未得到可验证完成结果。", "model_step_budget_exhausted", false, ["请缩小范围或继续执行。"]);
  }
}
