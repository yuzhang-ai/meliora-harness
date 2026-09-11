import type { ProviderCodecContext } from "./contracts";
import { decodeOpenAiCompatibleChatCompletionChunks } from "./openai-compatible";
import {
  createOpenAiCompatibleChatTransport,
  type OpenAiCompatibleTransport,
  type OpenAiCompatibleTransportOptions,
} from "./openai-compatible-transport";

export const decodeKimiChatCompletionChunks = (
  rawChunks: readonly Readonly<Record<string, unknown>>[],
  context: ProviderCodecContext,
) => decodeOpenAiCompatibleChatCompletionChunks("kimi", rawChunks, context);

export const createKimiChatTransport = (
  options: Omit<OpenAiCompatibleTransportOptions, "provider">,
): OpenAiCompatibleTransport => createOpenAiCompatibleChatTransport({ ...options, provider: "kimi" });
