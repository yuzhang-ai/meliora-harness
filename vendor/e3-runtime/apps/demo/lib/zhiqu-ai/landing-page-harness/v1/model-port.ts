import type { ToolDescriptorV1 } from "./tools";

export type ActorToolCallV1 = Readonly<{
  callId: string;
  toolId: string;
  argumentsJson: string;
}>;

export type ActorMessageV1 = Readonly<{
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: readonly ActorToolCallV1[];
}>;

export type ActorTurnInputV1 = Readonly<{
  messages: readonly ActorMessageV1[];
  tools: readonly ToolDescriptorV1[];
  executionEvidence?: Readonly<{
    authorityKind: "h1-runtime-admission-v1";
    workerId: string;
    runId: string;
    actorCallId: string;
    actorBindingHash: string;
    actorRequestHash: string;
    catalogBindingHash: string;
  }>;
  abortSignal?: AbortSignal;
  onContentDelta?: (delta: string) => void | Promise<void>;
}>;

export type ActorTurnOutputV1 = Readonly<{
  content: string;
  toolCalls: readonly ActorToolCallV1[];
  finishReason: "stop" | "tool_calls" | "length" | "content_filter" | "cancelled" | "unknown";
}>;

export class ActorProviderErrorV1 extends Error {
  constructor(readonly publicCode: "model_provider_failed" | "model_provider_timeout" | "model_rate_limited" | "model_cancelled", options?: { cause?: unknown }) {
    super(publicCode, options);
    this.name = "ActorProviderErrorV1";
  }
}

export interface ActorModelPortV1 {
  readonly modelIdentity: string;
  completeTurn(input: ActorTurnInputV1): Promise<ActorTurnOutputV1>;
}
