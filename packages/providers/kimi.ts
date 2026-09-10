import type { ProviderCodecContext } from "./contracts";
import { decodeOpenAiCompatibleChatCompletionChunks } from "./openai-compatible";

export const decodeKimiChatCompletionChunks = (
  rawChunks: readonly Readonly<Record<string, unknown>>[],
  context: ProviderCodecContext,
) => decodeOpenAiCompatibleChatCompletionChunks("kimi", rawChunks, context);
