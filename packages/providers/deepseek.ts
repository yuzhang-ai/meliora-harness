import type { ProviderCodecContext } from "./contracts";
import { decodeOpenAiCompatibleChatCompletionChunks } from "./openai-compatible";

export const decodeDeepSeekChatCompletionChunks = (
  rawChunks: readonly Readonly<Record<string, unknown>>[],
  context: ProviderCodecContext,
) => decodeOpenAiCompatibleChatCompletionChunks("deepseek", rawChunks, context);
