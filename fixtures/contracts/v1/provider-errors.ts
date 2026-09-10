import {
  MODEL_EVENT_SCHEMA_VERSION,
  type CanonicalModelEvent,
} from "../../../packages/model-protocol/contracts";
import type {
  OpenAiCompatibleProviderFailure,
  ProviderErrorClassification,
} from "../../../packages/providers/errors";
import type { ProviderId } from "../../../packages/providers/contracts";

type ModelStepFailedEvent = Extract<CanonicalModelEvent, { kind: "model_step_failed" }>;

export type ProviderErrorFixture = Readonly<{
  fixtureVersion: "meliora.provider-error-fixture.v1";
  id: string;
  provider: ProviderId;
  scenario: string;
  failure: OpenAiCompatibleProviderFailure;
  expectedClassification: ProviderErrorClassification;
  expectedEvent: ModelStepFailedEvent;
}>;

/**
 * Keyless fixtures for the transport-to-canonical-failure boundary. They hold
 * only stable failure facts, never an HTTP body, headers, URL, or API key.
 */
export const providerErrorFixtures = [
  {
    fixtureVersion: "meliora.provider-error-fixture.v1",
    id: "deepseek.error-401.v1",
    provider: "deepseek",
    scenario: "an OpenAI-compatible HTTP 401 is a non-retryable authentication failure",
    failure: { kind: "http", status: 401 },
    expectedClassification: {
      provider: "deepseek",
      code: "provider_authentication_failed",
      retryable: false,
      safeMessage: "模型服务认证失败，请检查本机 Provider 配置。",
    },
    expectedEvent: {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-deepseek-error-401-001",
      streamIndex: 0,
      occurredAt: "2026-09-10T00:10:00.000Z",
      kind: "model_step_failed",
      code: "provider_authentication_failed",
      retryable: false,
      safeMessage: "模型服务认证失败，请检查本机 Provider 配置。",
    },
  },
  {
    fixtureVersion: "meliora.provider-error-fixture.v1",
    id: "deepseek.error-429.v1",
    provider: "deepseek",
    scenario: "an OpenAI-compatible HTTP 429 is retryable rate limiting",
    failure: { kind: "http", status: 429 },
    expectedClassification: {
      provider: "deepseek",
      code: "provider_rate_limited",
      retryable: true,
      safeMessage: "模型服务请求过于频繁，请稍后重试。",
    },
    expectedEvent: {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-deepseek-error-429-001",
      streamIndex: 0,
      occurredAt: "2026-09-10T00:11:00.000Z",
      kind: "model_step_failed",
      code: "provider_rate_limited",
      retryable: true,
      safeMessage: "模型服务请求过于频繁，请稍后重试。",
    },
  },
  {
    fixtureVersion: "meliora.provider-error-fixture.v1",
    id: "kimi.error-timeout.v1",
    provider: "kimi",
    scenario: "a Kimi transport timeout is retryable without recording the thrown error",
    failure: { kind: "timeout" },
    expectedClassification: {
      provider: "kimi",
      code: "provider_timeout",
      retryable: true,
      safeMessage: "模型服务响应超时，可重试当前模型步骤。",
    },
    expectedEvent: {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-kimi-error-timeout-001",
      streamIndex: 0,
      occurredAt: "2026-09-10T00:12:00.000Z",
      kind: "model_step_failed",
      code: "provider_timeout",
      retryable: true,
      safeMessage: "模型服务响应超时，可重试当前模型步骤。",
    },
  },
  {
    fixtureVersion: "meliora.provider-error-fixture.v1",
    id: "kimi.error-malformed-stream.v1",
    provider: "kimi",
    scenario: "an invalid stream frame stops the step and is not automatically retried",
    failure: { kind: "malformed_stream" },
    expectedClassification: {
      provider: "kimi",
      code: "provider_malformed_stream",
      retryable: false,
      safeMessage: "模型服务返回了无法解析的流，已停止当前模型步骤。",
    },
    expectedEvent: {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-kimi-error-malformed-stream-001",
      streamIndex: 0,
      occurredAt: "2026-09-10T00:13:00.000Z",
      kind: "model_step_failed",
      code: "provider_malformed_stream",
      retryable: false,
      safeMessage: "模型服务返回了无法解析的流，已停止当前模型步骤。",
    },
  },
  {
    fixtureVersion: "meliora.provider-error-fixture.v1",
    id: "deepseek.error-transport.v1",
    provider: "deepseek",
    scenario: "a transport failure is retryable without recording provider-private error details",
    failure: { kind: "transport" },
    expectedClassification: {
      provider: "deepseek",
      code: "provider_unavailable",
      retryable: true,
      safeMessage: "模型服务暂时不可用，可稍后重试。",
    },
    expectedEvent: {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-deepseek-error-transport-001",
      streamIndex: 0,
      occurredAt: "2026-09-10T00:14:00.000Z",
      kind: "model_step_failed",
      code: "provider_unavailable",
      retryable: true,
      safeMessage: "模型服务暂时不可用，可稍后重试。",
    },
  },
] as const satisfies readonly ProviderErrorFixture[];
