export const MODEL_EVENT_SCHEMA_VERSION = "meliora.model-event.v1" as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export type CanonicalToolCall = Readonly<{
  invocationId: string;
  toolName: string;
  rawArguments: string;
  providerToolCallId?: string;
}>;

export type CanonicalInputMessage =
  | Readonly<{ role: "system" | "user"; content: string }>
  | Readonly<{
      role: "assistant";
      content: string;
      toolCalls?: readonly CanonicalToolCall[];
      reasoningArtifactRef?: string;
    }>
  | Readonly<{
      role: "tool";
      invocationId: string;
      content: string;
      artifactRef?: string;
    }>;

type ModelEventBase = Readonly<{
  schemaVersion: typeof MODEL_EVENT_SCHEMA_VERSION;
  modelStepId: string;
  streamIndex: number;
  occurredAt: string;
}>;

export type CanonicalModelEvent =
  | (ModelEventBase & Readonly<{ kind: "assistant_text_delta"; delta: string }>)
  | (ModelEventBase &
      Readonly<{
        kind: "reasoning_delta";
        delta: string;
        visibility: "private";
      }>)
  | (ModelEventBase &
      Readonly<{
        kind: "tool_call_started";
        invocationId: string;
        toolName: string;
        providerToolCallId?: string;
      }>)
  | (ModelEventBase &
      Readonly<{
        kind: "tool_arguments_delta";
        invocationId: string;
        delta: string;
      }>)
  | (ModelEventBase &
      Readonly<{
        kind: "tool_call_completed";
        invocationId: string;
        rawArguments: string;
      }>)
  | (ModelEventBase &
      Readonly<{
        kind: "usage_updated";
        inputTokens?: number;
        outputTokens?: number;
        reasoningTokens?: number;
        cachedInputTokens?: number;
      }>)
  | (ModelEventBase &
      Readonly<{
        kind: "model_step_completed";
        finishReason:
          | "stop"
          | "tool_calls"
          | "length"
          | "content_filter"
          | "cancelled"
          | "unknown";
        providerResponseId?: string;
      }>)
  | (ModelEventBase &
      Readonly<{
        kind: "model_step_failed";
        code: string;
        retryable: boolean;
        safeMessage?: string;
      }>);

export type ProviderFixture = Readonly<{
  fixtureVersion: "meliora.provider-fixture.v1";
  id: string;
  provider: "deepseek" | "kimi";
  scenario: string;
  rawChunks: readonly JsonObject[];
  expectedEvents: readonly CanonicalModelEvent[];
}>;
