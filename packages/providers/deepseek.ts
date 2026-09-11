import type { ProviderCodecContext } from "./contracts";
import { decodeOpenAiCompatibleChatCompletionChunks } from "./openai-compatible";
import {
  createOpenAiCompatibleChatTransport,
  type OpenAiCompatibleTransport,
  type OpenAiCompatibleTransportOptions,
} from "./openai-compatible-transport";

export const decodeDeepSeekChatCompletionChunks = (
  rawChunks: readonly Readonly<Record<string, unknown>>[],
  context: ProviderCodecContext,
) => decodeOpenAiCompatibleChatCompletionChunks("deepseek", rawChunks, context);

export const createDeepSeekChatTransport = (
  options: Omit<OpenAiCompatibleTransportOptions, "provider">,
): OpenAiCompatibleTransport => createOpenAiCompatibleChatTransport({ ...options, provider: "deepseek" });
