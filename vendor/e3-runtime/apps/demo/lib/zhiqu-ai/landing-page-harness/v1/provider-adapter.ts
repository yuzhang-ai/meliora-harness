import { createHash, randomUUID } from "node:crypto";
import { createHarnessModelProvider, type HarnessModelProvider } from "../../harness/model-provider";
import type { ModelMessage, ToolDefinition } from "../../harness/contracts";
import { ActorProviderErrorV1, type ActorModelPortV1, type ActorTurnInputV1, type ActorTurnOutputV1 } from "./model-port";

export type H1ProviderExecutionEvidenceV1 = NonNullable<
  ActorTurnInputV1["executionEvidence"]
>;

export type H1ProviderAttemptEvidenceV1 = Readonly<{
  attemptId: string;
  actorInvocationId: string;
  attemptIndex: number;
  status: "started" | "response" | "network_error" | "cancelled" | "abandoned";
  scopeId: string;
  workerId: string;
  runId: string;
  actorCallId: string;
  actorBindingHash: string;
  requestHash: string;
  catalogBindingHash: string;
  modelIdentity: string;
  httpStatus: number | null;
  errorCode: string | null;
  durationMs: number | null;
}>;

export type H1ActorOutputEvidenceV1 = Readonly<{
  actorInvocationId: string;
  rawFinishReason: string;
  normalizedFinishReason: ActorTurnOutputV1["finishReason"];
  contentBytes: number;
  contentHash: string;
  toolIds: readonly string[];
}>;

export interface B2ProviderAttemptLedgerPortV1 {
  readonly maximumAttempts: number;
  start(input: Readonly<{
    actorInvocationId: string;
    attemptIndex: number;
    evidence: H1ProviderExecutionEvidenceV1;
    modelIdentity: string;
  }>): Promise<{ attemptId: string }>;
  finish(input: Readonly<{
    attemptId: string;
    status: "response" | "network_error" | "cancelled";
    httpStatus: number | null;
    errorCode: string | null;
    durationMs: number;
  }>): Promise<void>;
  recordActorOutput(
    actorInvocationId: string,
    output: Readonly<{
      content: string;
      finishReason?: string;
      toolCalls: readonly Readonly<{ name: string }>[];
    }>
  ): void;
  snapshot(): Readonly<{
    maximumAttempts: number;
    consumedAttempts: number;
    attempts: readonly H1ProviderAttemptEvidenceV1[];
    actorOutputs: readonly H1ActorOutputEvidenceV1[];
  }>;
}

export class B2LocalProviderAttemptLedgerV1
  implements B2ProviderAttemptLedgerPortV1
{
  private readonly attempts = new Map<string, H1ProviderAttemptEvidenceV1>();
  private readonly actorOutputs = new Map<string, H1ActorOutputEvidenceV1>();

  constructor(readonly maximumAttempts: number) {
    if (!Number.isInteger(maximumAttempts) || maximumAttempts < 1) {
      throw new Error("b2_provider_attempt_budget_invalid");
    }
  }

  async start(input: Readonly<{
    actorInvocationId: string;
    attemptIndex: number;
    evidence: H1ProviderExecutionEvidenceV1;
    modelIdentity: string;
  }>) {
    const { actorInvocationId, attemptIndex, evidence } = input;
    if (attemptIndex !== 0) {
      throw new Error("b2_provider_hidden_retry_forbidden");
    }
    if (this.attempts.size >= this.maximumAttempts) {
      throw new Error("b2_provider_attempt_budget_exhausted");
    }
    const attemptId = `b2-provider-attempt-${randomUUID()}`;
    this.attempts.set(attemptId, {
      attemptId,
      actorInvocationId,
      attemptIndex,
      status: "started",
      scopeId: "memory-b2-fixture",
      workerId: evidence.workerId,
      runId: evidence.runId,
      actorCallId: evidence.actorCallId,
      actorBindingHash: evidence.actorBindingHash,
      requestHash: evidence.actorRequestHash,
      catalogBindingHash: evidence.catalogBindingHash,
      modelIdentity: input.modelIdentity,
      httpStatus: null,
      errorCode: null,
      durationMs: null,
    });
    return { attemptId };
  }

  async finish(input: Readonly<{
    attemptId: string;
    status: "response" | "network_error" | "cancelled";
    httpStatus: number | null;
    errorCode: string | null;
    durationMs: number;
  }>) {
    const current = this.attempts.get(input.attemptId);
    if (!current || current.status !== "started") {
      throw new Error("b2_provider_attempt_settlement_invalid");
    }
    this.attempts.set(input.attemptId, {
      ...current,
      status: input.status,
      httpStatus: input.httpStatus,
      errorCode: input.errorCode,
      durationMs: Math.max(0, input.durationMs),
    });
  }

  recordActorOutput(
    actorInvocationId: string,
    output: Readonly<{
      content: string;
      finishReason?: string;
      toolCalls: readonly Readonly<{ name: string }>[];
    }>
  ) {
    if (this.actorOutputs.has(actorInvocationId)) {
      throw new Error("b2_provider_actor_output_duplicate");
    }
    const normalizedFinishReason = normalizeFinishReason(output.finishReason);
    this.actorOutputs.set(actorInvocationId, {
      actorInvocationId,
      rawFinishReason: output.finishReason || "unavailable",
      normalizedFinishReason,
      contentBytes: new TextEncoder().encode(output.content).byteLength,
      contentHash: createHash("sha256")
        .update(output.content, "utf8")
        .digest("hex"),
      toolIds: output.toolCalls.map((call) => call.name),
    });
  }

  snapshot() {
    return {
      maximumAttempts: this.maximumAttempts,
      consumedAttempts: this.attempts.size,
      attempts: [...this.attempts.values()].map((item) => structuredClone(item)),
      actorOutputs: [...this.actorOutputs.values()].map((item) =>
        structuredClone(item)
      ),
    } as const;
  }
}

export type HarnessProviderActorAdapterOptionsV1 = Readonly<{
  b2AttemptLedger?: B2ProviderAttemptLedgerPortV1;
  totalAttemptBudgetMs?: number;
}>;

const normalizeFinishReason = (value: string | undefined): ActorTurnOutputV1["finishReason"] => {
  if (value === "stop" || value === "end_turn" || value === "stop_sequence") return "stop";
  if (value === "tool_calls" || value === "tool_use") return "tool_calls";
  if (value === "length" || value === "max_tokens") return "length";
  if (value === "content_filter") return "content_filter";
  if (value === "cancelled" || value === "canceled") return "cancelled";
  return "unknown";
};

const classifyProviderError = (error: unknown, aborted: boolean): ActorProviderErrorV1["publicCode"] => {
  if (aborted) return "model_cancelled";
  if (error && typeof error === "object") {
    const value = error as { timedOut?: unknown; status?: unknown; statusCode?: unknown; httpStatus?: unknown; code?: unknown; name?: unknown };
    if (value.timedOut === true || value.code === "ETIMEDOUT" || value.name === "TimeoutError") return "model_provider_timeout";
    if (value.status === 429 || value.statusCode === 429 || value.httpStatus === 429) return "model_rate_limited";
  }
  return "model_provider_failed";
};

export class HarnessProviderActorAdapterV1 implements ActorModelPortV1 {
  readonly modelIdentity: string;
  readonly modelRuntimeBinding: Readonly<{
    provider: string;
    profileId: string;
    model: string;
    protocol: string;
    serviceTier: string;
    endpointHash: string;
  }>;
  constructor(
    private readonly provider: HarnessModelProvider = createHarnessModelProvider(),
    private readonly options: HarnessProviderActorAdapterOptionsV1 = {}
  ) {
    this.modelIdentity = `${provider.info.provider}:${provider.info.model}`;
    this.modelRuntimeBinding = Object.freeze({
      provider: provider.info.provider,
      profileId: provider.info.profileId || "unconfigured",
      model: provider.info.model,
      protocol: provider.info.protocol || "unconfigured",
      serviceTier: provider.info.serviceTier || "unconfigured",
      endpointHash: createHash("sha256")
        .update(provider.info.requestUrl || "unconfigured", "utf8")
        .digest("hex"),
    });
  }
  async completeTurn(input: Parameters<ActorModelPortV1["completeTurn"]>[0]) {
    const actorInvocationId =
      input.executionEvidence?.actorCallId ||
      `actor-invocation-${randomUUID()}`;
    try {
      const output = await this.provider.completeTurn({
        messages: input.messages.map((message) => ({
          role: message.role,
          content: message.content,
          ...(message.toolCallId ? { toolCallId: message.toolCallId } : {}),
          ...(message.toolCalls ? { toolCalls: message.toolCalls.map((call) => ({ id: call.callId, name: call.toolId, arguments: call.argumentsJson })) } : {}),
        })) as ModelMessage[],
        tools: input.tools.map((tool) => ({ name: tool.toolId, description: tool.description, inputSchema: tool.inputSchema })) as ToolDefinition[],
        toolChoice: "auto",
        thinking: "adaptive",
        maxTokens: 4_000,
        ...(this.options.totalAttemptBudgetMs
          ? { totalAttemptBudgetMs: this.options.totalAttemptBudgetMs }
          : {}),
        abortSignal: input.abortSignal,
        onContentDelta: input.onContentDelta,
        ...(this.options.b2AttemptLedger && input.executionEvidence
          ? {
              onProviderAttemptStart: ({ attemptIndex }) =>
                this.options.b2AttemptLedger!.start({
                  actorInvocationId,
                  attemptIndex,
                  evidence: input.executionEvidence!,
                  modelIdentity: this.modelIdentity,
                }),
              onProviderAttemptFinish: (attempt) =>
                this.options.b2AttemptLedger!.finish({
                  attemptId: attempt.attemptId,
                  status: attempt.status,
                  httpStatus: attempt.httpStatus,
                  errorCode: attempt.errorCode,
                  durationMs: attempt.durationMs,
                }),
            }
          : {}),
      });
      if (this.options.b2AttemptLedger && input.executionEvidence) {
        this.options.b2AttemptLedger.recordActorOutput(
          actorInvocationId,
          output
        );
      }
      const toolCalls = output.toolCalls.map((call) => ({ callId: call.id, toolId: call.name, argumentsJson: call.arguments }));
      return { content: output.content, toolCalls, finishReason: normalizeFinishReason(output.finishReason) };
    } catch (error) {
      throw new ActorProviderErrorV1(classifyProviderError(error, Boolean(input.abortSignal?.aborted)), { cause: error });
    }
  }
}
