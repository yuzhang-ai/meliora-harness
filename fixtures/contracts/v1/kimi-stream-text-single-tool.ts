import {
  MODEL_EVENT_SCHEMA_VERSION,
  type ProviderFixture,
} from "../../../packages/model-protocol/contracts";

/**
 * Kimi's OpenAI-compatible stream shape, normalized without using a provider SDK
 * or a credential. The output must be indistinguishable from a DeepSeek fixture
 * at the CanonicalModelEvent boundary.
 */
export const kimiStreamTextSingleToolFixture = {
  fixtureVersion: "meliora.provider-fixture.v1",
  id: "kimi.stream-text-single-tool.v1",
  provider: "kimi",
  scenario: "assistant text followed by one git_status call with fragmented arguments",
  rawChunks: [
    {
      id: "kimi-response-001",
      object: "chat.completion.chunk",
      created: 1788998460,
      model: "moonshot-v1-8k",
      choices: [{ index: 0, delta: { role: "assistant", content: "我先检查当前改动。" } }],
    },
    {
      id: "kimi-response-001",
      object: "chat.completion.chunk",
      created: 1788998460,
      model: "moonshot-v1-8k",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "kimi-call-git-status-001",
                type: "function",
                function: { name: "git_status", arguments: "{\"scope\":\"work" },
              },
            ],
          },
        },
      ],
    },
    {
      id: "kimi-response-001",
      object: "chat.completion.chunk",
      created: 1788998460,
      model: "moonshot-v1-8k",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                function: { arguments: "space\"}" },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 183, completion_tokens: 22 },
    },
  ],
  expectedEvents: [
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-kimi-001",
      streamIndex: 0,
      occurredAt: "2026-09-10T00:01:00.000Z",
      kind: "assistant_text_delta",
      delta: "我先检查当前改动。",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-kimi-001",
      streamIndex: 1,
      occurredAt: "2026-09-10T00:01:00.010Z",
      kind: "tool_call_started",
      invocationId: "invocation-kimi-git-status-001",
      toolName: "git_status",
      providerToolCallId: "kimi-call-git-status-001",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-kimi-001",
      streamIndex: 2,
      occurredAt: "2026-09-10T00:01:00.020Z",
      kind: "tool_arguments_delta",
      invocationId: "invocation-kimi-git-status-001",
      delta: "{\"scope\":\"work",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-kimi-001",
      streamIndex: 3,
      occurredAt: "2026-09-10T00:01:00.030Z",
      kind: "tool_arguments_delta",
      invocationId: "invocation-kimi-git-status-001",
      delta: "space\"}",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-kimi-001",
      streamIndex: 4,
      occurredAt: "2026-09-10T00:01:00.040Z",
      kind: "tool_call_completed",
      invocationId: "invocation-kimi-git-status-001",
      rawArguments: "{\"scope\":\"workspace\"}",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-kimi-001",
      streamIndex: 5,
      occurredAt: "2026-09-10T00:01:00.050Z",
      kind: "usage_updated",
      inputTokens: 183,
      outputTokens: 22,
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-kimi-001",
      streamIndex: 6,
      occurredAt: "2026-09-10T00:01:00.060Z",
      kind: "model_step_completed",
      finishReason: "tool_calls",
      providerResponseId: "kimi-response-001",
    },
  ],
} satisfies ProviderFixture;
