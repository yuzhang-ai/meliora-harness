import type { CanonicalModelEvent } from "../model-protocol/contracts";
import type { ProviderCodecContext } from "./contracts";
import {
  classifyOpenAiCompatibleProviderFailure,
  createOpenAiCompatibleProviderFailureEvent,
  type OpenAiCompatibleProviderFailure,
  type ProviderErrorClassification,
} from "./errors";

/** Kimi's OpenAI-compatible transport boundary; no SDK or key is required. */
export const classifyKimiProviderFailure = (
  failure: OpenAiCompatibleProviderFailure,
): ProviderErrorClassification => classifyOpenAiCompatibleProviderFailure("kimi", failure);

export const createKimiProviderFailureEvent = (
  failure: OpenAiCompatibleProviderFailure,
  context: ProviderCodecContext,
  streamIndex: number,
): Extract<CanonicalModelEvent, { kind: "model_step_failed" }> =>
  createOpenAiCompatibleProviderFailureEvent("kimi", failure, context, streamIndex);
