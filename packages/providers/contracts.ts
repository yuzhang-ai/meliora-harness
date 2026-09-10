import type { CanonicalModelEvent } from "../model-protocol/contracts";

export type ProviderId = "deepseek" | "kimi";

export type InvocationIdInput = Readonly<{
  provider: ProviderId;
  toolCallIndex: number;
  toolName: string;
  providerToolCallId?: string;
}>;

/**
 * Runtime-owned values are injected so a Codec never owns durable IDs or time.
 */
export type ProviderCodecContext = Readonly<{
  modelStepId: string;
  occurredAt: (streamIndex: number) => string;
  createInvocationId: (input: InvocationIdInput) => string;
}>;

export type ProviderStreamDecoder = (
  rawChunks: readonly Readonly<Record<string, unknown>>[],
  context: ProviderCodecContext,
) => readonly CanonicalModelEvent[];
