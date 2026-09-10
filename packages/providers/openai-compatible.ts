import {
  MODEL_EVENT_SCHEMA_VERSION,
  type CanonicalModelEvent,
} from "../model-protocol/contracts";
import type { ProviderCodecContext, ProviderId, ProviderStreamDecoder } from "./contracts";

type OpenAiToolCallState = {
  readonly choiceIndex: number;
  readonly toolCallIndex: number;
  providerToolCallId?: string;
  toolName?: string;
  invocationId?: string;
  rawArguments: string;
  argumentDeltas: string[];
  emittedArgumentDeltaCount: number;
  completed: boolean;
};

type UnstampedModelEvent = CanonicalModelEvent extends infer Event
  ? Event extends unknown
    ? Omit<Event, "schemaVersion" | "modelStepId" | "streamIndex" | "occurredAt">
    : never
  : never;

function asObject(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function asArray(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function finishReason(value: string): Extract<CanonicalModelEvent, { kind: "model_step_completed" }>["finishReason"] {
  switch (value) {
    case "stop":
    case "tool_calls":
    case "length":
    case "content_filter":
    case "cancelled":
      return value;
    default:
      return "unknown";
  }
}

/**
 * Decodes the OpenAI Chat Completions streaming shape shared by the current
 * DeepSeek and Kimi APIs. It is deliberately data-only: network transport,
 * credentials, retries, tool execution, and durable state belong elsewhere.
 */
export function decodeOpenAiCompatibleChatCompletionChunks(
  provider: ProviderId,
  rawChunks: readonly Readonly<Record<string, unknown>>[],
  context: ProviderCodecContext,
): readonly CanonicalModelEvent[] {
  const events: CanonicalModelEvent[] = [];
  const toolCalls = new Map<string, OpenAiToolCallState>();
  let providerResponseId: string | undefined;
  let terminalFinishReason: Extract<CanonicalModelEvent, { kind: "model_step_completed" }>["finishReason"] | undefined;

  const emit = (event: UnstampedModelEvent): void => {
    const streamIndex = events.length;
    events.push({
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: context.modelStepId,
      streamIndex,
      occurredAt: context.occurredAt(streamIndex),
      ...event,
    } as CanonicalModelEvent);
  };

  const startToolCallIfReady = (state: OpenAiToolCallState): void => {
    if (state.invocationId !== undefined || state.toolName === undefined) return;
    state.invocationId = context.createInvocationId({
      provider,
      choiceIndex: state.choiceIndex,
      toolCallIndex: state.toolCallIndex,
      toolName: state.toolName,
      providerToolCallId: state.providerToolCallId,
    });
    emit({
      kind: "tool_call_started",
      invocationId: state.invocationId,
      toolName: state.toolName,
      ...(state.providerToolCallId === undefined ? {} : { providerToolCallId: state.providerToolCallId }),
    });
  };

  const completeChoiceToolCalls = (choiceIndex: number): void => {
    for (const state of toolCalls.values()) {
      if (state.choiceIndex !== choiceIndex || state.completed) continue;
      startToolCallIfReady(state);
      emitPendingArgumentDeltas(state);
      if (state.invocationId === undefined) continue;
      state.completed = true;
      emit({
        kind: "tool_call_completed",
        invocationId: state.invocationId,
        rawArguments: state.rawArguments,
      });
    }
  };

  const emitPendingArgumentDeltas = (state: OpenAiToolCallState): void => {
    if (state.invocationId === undefined) return;
    while (state.emittedArgumentDeltaCount < state.argumentDeltas.length) {
      const delta = state.argumentDeltas[state.emittedArgumentDeltaCount];
      state.emittedArgumentDeltaCount += 1;
      if (delta !== undefined && delta.length > 0) {
        emit({ kind: "tool_arguments_delta", invocationId: state.invocationId, delta });
      }
    }
  };

  for (const chunk of rawChunks) {
    const responseId = asString(chunk.id);
    if (responseId !== undefined) providerResponseId = responseId;

    const choices = asArray(chunk.choices);
    for (const rawChoice of choices ?? []) {
      const choice = asObject(rawChoice);
      if (choice === undefined) continue;
      const choiceIndex = asFiniteNumber(choice.index) ?? 0;
      const delta = asObject(choice.delta);
      if (delta !== undefined) {
        const content = asString(delta.content);
        if (content !== undefined && content.length > 0) {
          emit({ kind: "assistant_text_delta", delta: content });
        }

        // DeepSeek uses reasoning_content; accept reasoning as the compatible alias.
        const reasoning = asString(delta.reasoning_content) ?? asString(delta.reasoning);
        if (reasoning !== undefined && reasoning.length > 0) {
          emit({ kind: "reasoning_delta", delta: reasoning, visibility: "private" });
        }

        const rawToolCalls = asArray(delta.tool_calls);
        for (let position = 0; position < (rawToolCalls?.length ?? 0); position += 1) {
          const rawToolCall = asObject(rawToolCalls?.[position]);
          if (rawToolCall === undefined) continue;
          const toolCallIndex = asFiniteNumber(rawToolCall.index) ?? position;
          const stateKey = `${choiceIndex}:${toolCallIndex}`;
          let state = toolCalls.get(stateKey);
          if (state === undefined) {
            state = {
              choiceIndex,
              toolCallIndex,
              rawArguments: "",
              argumentDeltas: [],
              emittedArgumentDeltaCount: 0,
              completed: false,
            };
            toolCalls.set(stateKey, state);
          }

          const callId = asString(rawToolCall.id);
          if (callId !== undefined) state.providerToolCallId = callId;
          const functionDelta = asObject(rawToolCall.function);
          const name = functionDelta === undefined ? undefined : asString(functionDelta.name);
          if (name !== undefined) state.toolName = name;
          startToolCallIfReady(state);

          const argumentsDelta = functionDelta === undefined ? undefined : asString(functionDelta.arguments);
          if (argumentsDelta !== undefined && argumentsDelta.length > 0) {
            state.rawArguments += argumentsDelta;
            state.argumentDeltas.push(argumentsDelta);
          }
          // A malformed provider sequence may supply arguments before a name.
          // Retain and emit them only after the canonical call can be identified.
          emitPendingArgumentDeltas(state);
        }
      }

      const rawFinishReason = asString(choice.finish_reason);
      if (rawFinishReason !== undefined) {
        completeChoiceToolCalls(choiceIndex);
        terminalFinishReason ??= finishReason(rawFinishReason);
      }
    }

    const usage = asObject(chunk.usage);
    if (usage !== undefined) {
      const inputTokens = asFiniteNumber(usage.prompt_tokens);
      const outputTokens = asFiniteNumber(usage.completion_tokens);
      const directReasoningTokens = asFiniteNumber(usage.reasoning_tokens);
      const directCachedInputTokens = asFiniteNumber(usage.cached_tokens);
      const promptDetails = asObject(usage.prompt_tokens_details);
      const completionDetails = asObject(usage.completion_tokens_details);
      const reasoningTokens = directReasoningTokens ?? (completionDetails === undefined ? undefined : asFiniteNumber(completionDetails.reasoning_tokens));
      const cachedInputTokens = directCachedInputTokens ?? (promptDetails === undefined ? undefined : asFiniteNumber(promptDetails.cached_tokens));
      if (inputTokens !== undefined || outputTokens !== undefined || reasoningTokens !== undefined || cachedInputTokens !== undefined) {
        emit({
          kind: "usage_updated",
          ...(inputTokens === undefined ? {} : { inputTokens }),
          ...(outputTokens === undefined ? {} : { outputTokens }),
          ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
          ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
        });
      }
    }
  }

  if (terminalFinishReason !== undefined) {
    emit({
      kind: "model_step_completed",
      finishReason: terminalFinishReason,
      ...(providerResponseId === undefined ? {} : { providerResponseId }),
    });
  }

  return events;
}

export const createOpenAiCompatibleChatCompletionDecoder = (provider: ProviderId): ProviderStreamDecoder =>
  (rawChunks, context) => decodeOpenAiCompatibleChatCompletionChunks(provider, rawChunks, context);
