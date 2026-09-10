import {
  MODEL_EVENT_SCHEMA_VERSION,
  type ProviderFixture,
} from "../../../packages/model-protocol/contracts";

/** A missing provider ID must not prevent a unique Runtime invocation. */
export const kimiStreamMissingToolCallIdFixture = {
  fixtureVersion: "meliora.provider-fixture.v1",
  id: "kimi.stream-missing-tool-call-id.v1",
  provider: "kimi",
  scenario: "a tool call without a provider ID is keyed by its stream position",
  rawChunks: [
    {
      id: "kimi-response-missing-id-001",
      object: "chat.completion.chunk",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 2,
                type: "function",
                function: { name: "read_file", arguments: "{\"path\":\"packages/" },
              },
            ],
          },
        },
      ],
    },
    {
      id: "kimi-response-missing-id-001",
      object: "chat.completion.chunk",
      choices: [
        {
          index: 0,
          delta: { tool_calls: [{ index: 2, function: { arguments: "providers\"}" } }] },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 34, completion_tokens: 8 },
    },
  ],
  expectedEvents: [
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-kimi-missing-id-001",
      streamIndex: 0,
      occurredAt: "2026-09-10T00:03:00.000Z",
      kind: "tool_call_started",
      invocationId: "invocation-kimi-0-2",
      toolName: "read_file",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-kimi-missing-id-001",
      streamIndex: 1,
      occurredAt: "2026-09-10T00:03:00.010Z",
      kind: "tool_arguments_delta",
      invocationId: "invocation-kimi-0-2",
      delta: "{\"path\":\"packages/",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-kimi-missing-id-001",
      streamIndex: 2,
      occurredAt: "2026-09-10T00:03:00.020Z",
      kind: "tool_arguments_delta",
      invocationId: "invocation-kimi-0-2",
      delta: "providers\"}",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-kimi-missing-id-001",
      streamIndex: 3,
      occurredAt: "2026-09-10T00:03:00.030Z",
      kind: "tool_call_completed",
      invocationId: "invocation-kimi-0-2",
      rawArguments: "{\"path\":\"packages/providers\"}",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-kimi-missing-id-001",
      streamIndex: 4,
      occurredAt: "2026-09-10T00:03:00.040Z",
      kind: "usage_updated",
      inputTokens: 34,
      outputTokens: 8,
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-kimi-missing-id-001",
      streamIndex: 5,
      occurredAt: "2026-09-10T00:03:00.050Z",
      kind: "model_step_completed",
      finishReason: "tool_calls",
      providerResponseId: "kimi-response-missing-id-001",
    },
  ],
} satisfies ProviderFixture;
