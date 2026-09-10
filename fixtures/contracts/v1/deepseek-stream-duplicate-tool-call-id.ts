import {
  MODEL_EVENT_SCHEMA_VERSION,
  type ProviderFixture,
} from "../../../packages/model-protocol/contracts";

/** Provider IDs are mapping metadata: two calls may illegally reuse one ID. */
export const deepseekStreamDuplicateToolCallIdFixture = {
  fixtureVersion: "meliora.provider-fixture.v1",
  id: "deepseek.stream-duplicate-tool-call-id.v1",
  provider: "deepseek",
  scenario: "two tool-call positions reuse the same provider ID but keep separate runtime invocations",
  rawChunks: [
    {
      id: "ds-response-duplicate-id-001",
      object: "chat.completion.chunk",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "ds-call-reused-001",
                type: "function",
                function: { name: "read_file", arguments: "{\"path\":\"README.md\"}" },
              },
              {
                index: 1,
                id: "ds-call-reused-001",
                type: "function",
                function: { name: "git_status", arguments: "{}" },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 55, completion_tokens: 17 },
    },
  ],
  expectedEvents: [
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-deepseek-duplicate-id-001",
      streamIndex: 0,
      occurredAt: "2026-09-10T00:02:00.000Z",
      kind: "tool_call_started",
      invocationId: "invocation-deepseek-0-0",
      toolName: "read_file",
      providerToolCallId: "ds-call-reused-001",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-deepseek-duplicate-id-001",
      streamIndex: 1,
      occurredAt: "2026-09-10T00:02:00.010Z",
      kind: "tool_arguments_delta",
      invocationId: "invocation-deepseek-0-0",
      delta: "{\"path\":\"README.md\"}",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-deepseek-duplicate-id-001",
      streamIndex: 2,
      occurredAt: "2026-09-10T00:02:00.020Z",
      kind: "tool_call_started",
      invocationId: "invocation-deepseek-0-1",
      toolName: "git_status",
      providerToolCallId: "ds-call-reused-001",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-deepseek-duplicate-id-001",
      streamIndex: 3,
      occurredAt: "2026-09-10T00:02:00.030Z",
      kind: "tool_arguments_delta",
      invocationId: "invocation-deepseek-0-1",
      delta: "{}",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-deepseek-duplicate-id-001",
      streamIndex: 4,
      occurredAt: "2026-09-10T00:02:00.040Z",
      kind: "tool_call_completed",
      invocationId: "invocation-deepseek-0-0",
      rawArguments: "{\"path\":\"README.md\"}",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-deepseek-duplicate-id-001",
      streamIndex: 5,
      occurredAt: "2026-09-10T00:02:00.050Z",
      kind: "tool_call_completed",
      invocationId: "invocation-deepseek-0-1",
      rawArguments: "{}",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-deepseek-duplicate-id-001",
      streamIndex: 6,
      occurredAt: "2026-09-10T00:02:00.060Z",
      kind: "usage_updated",
      inputTokens: 55,
      outputTokens: 17,
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-deepseek-duplicate-id-001",
      streamIndex: 7,
      occurredAt: "2026-09-10T00:02:00.070Z",
      kind: "model_step_completed",
      finishReason: "tool_calls",
      providerResponseId: "ds-response-duplicate-id-001",
    },
  ],
} satisfies ProviderFixture;
