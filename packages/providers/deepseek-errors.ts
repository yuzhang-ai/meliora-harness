import type { CanonicalModelEvent } from "../model-protocol/contracts";
import type { ProviderCodecContext } from "./contracts";
import {
  classifyOpenAiCompatibleProviderFailure,
  createOpenAiCompatibleProviderFailureEvent,
  type OpenAiCompatibleProviderFailure,
  type ProviderErrorClassification,
} from "./errors";

/** DeepSeek's OpenAI-compatible transport boundary; no SDK or key is required. */
export const classifyDeepSeekProviderFailure = (
  failure: OpenAiCompatibleProviderFailure,
): ProviderErrorClassification => classifyOpenAiCompatibleProviderFailure("deepseek", failure);

export const createDeepSeekProviderFailureEvent = (
  failure: OpenAiCompatibleProviderFailure,
  context: ProviderCodecContext,
  streamIndex: number,
): Extract<CanonicalModelEvent, { kind: "model_step_failed" }> =>
  createOpenAiCompatibleProviderFailureEvent("deepseek", failure, context, streamIndex);
