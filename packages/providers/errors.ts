import {
  MODEL_EVENT_SCHEMA_VERSION,
  type CanonicalModelEvent,
} from "../model-protocol/contracts";
import type { ProviderCodecContext, ProviderId } from "./contracts";

/**
 * Minimal, credential-free input captured by a transport or stream reader.
 *
 * This deliberately excludes response bodies, headers, URLs, and Error
 * messages: those values can contain credentials or provider-private details
 * and must not be copied into model events or public projections.
 */
export type OpenAiCompatibleProviderFailure =
  | Readonly<{ kind: "http"; status: number }>
  | Readonly<{ kind: "timeout" }>
  | Readonly<{ kind: "malformed_stream" }>
  | Readonly<{ kind: "transport" }>;

export type ProviderErrorCode =
  | "provider_authentication_failed"
  | "provider_rate_limited"
  | "provider_timeout"
  | "provider_malformed_stream"
  | "provider_unavailable"
  | "provider_request_failed";

export type ProviderErrorClassification = Readonly<{
  provider: ProviderId;
  code: ProviderErrorCode;
  retryable: boolean;
  safeMessage: string;
}>;

type ModelStepFailedEvent = Extract<CanonicalModelEvent, { kind: "model_step_failed" }>;

/**
 * Maps only stable transport facts to the canonical failure vocabulary shared
 * by DeepSeek and Kimi's current OpenAI-compatible boundary. Provider-specific
 * response payloads stay at the transport adapter and are never exposed here.
 */
export function classifyOpenAiCompatibleProviderFailure(
  provider: ProviderId,
  failure: OpenAiCompatibleProviderFailure,
): ProviderErrorClassification {
  if (failure.kind === "timeout") {
    return {
      provider,
      code: "provider_timeout",
      retryable: true,
      safeMessage: "模型服务响应超时，可重试当前模型步骤。",
    };
  }

  if (failure.kind === "malformed_stream") {
    return {
      provider,
      code: "provider_malformed_stream",
      retryable: false,
      safeMessage: "模型服务返回了无法解析的流，已停止当前模型步骤。",
    };
  }

  if (failure.kind === "transport") {
    return {
      provider,
      code: "provider_unavailable",
      retryable: true,
      safeMessage: "模型服务暂时不可用，可稍后重试。",
    };
  }

  if (failure.kind === "http") {
    if (failure.status === 401) {
      return {
        provider,
        code: "provider_authentication_failed",
        retryable: false,
        safeMessage: "模型服务认证失败，请检查本机 Provider 配置。",
      };
    }

    if (failure.status === 429) {
      return {
        provider,
        code: "provider_rate_limited",
        retryable: true,
        safeMessage: "模型服务请求过于频繁，请稍后重试。",
      };
    }

    if (failure.status >= 500 && failure.status <= 599) {
      return {
        provider,
        code: "provider_unavailable",
        retryable: true,
        safeMessage: "模型服务暂时不可用，可稍后重试。",
      };
    }
  }

  return {
    provider,
    code: "provider_request_failed",
    retryable: false,
    safeMessage: "模型服务请求失败。",
  };
}

/**
 * Produces the already-frozen canonical failure event. `streamIndex` remains
 * Runtime-owned so a transport failure can be appended after any durable deltas
 * without the codec inventing sequence or time.
 */
export function createOpenAiCompatibleProviderFailureEvent(
  provider: ProviderId,
  failure: OpenAiCompatibleProviderFailure,
  context: ProviderCodecContext,
  streamIndex: number,
): ModelStepFailedEvent {
  const classification = classifyOpenAiCompatibleProviderFailure(provider, failure);
  return {
    schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
    modelStepId: context.modelStepId,
    streamIndex,
    occurredAt: context.occurredAt(streamIndex),
    kind: "model_step_failed",
    code: classification.code,
    retryable: classification.retryable,
    safeMessage: classification.safeMessage,
  };
}
