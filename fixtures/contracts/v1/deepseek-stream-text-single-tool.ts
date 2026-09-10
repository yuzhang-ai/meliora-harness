import {
  MODEL_EVENT_SCHEMA_VERSION,
  type ProviderFixture,
} from "../../../packages/model-protocol/contracts";

/**
 * OpenAI-compatible DeepSeek streaming transcript. It is intentionally keyless:
 * `rawChunks` are recorded protocol-shaped inputs, while `expectedEvents` are the
 * provider-independent contract that a DeepSeek codec must emit.
 */
export const deepseekStreamTextSingleToolFixture = {
  fixtureVersion: "meliora.provider-fixture.v1",
  id: "deepseek.stream-text-single-tool.v1",
  provider: "deepseek",
  scenario: "assistant text followed by one read_file call with fragmented arguments",
  rawChunks: [
    {
      id: "ds-response-001",
      object: "chat.completion.chunk",
      created: 1788998400,
      model: "deepseek-chat",
      choices: [{ index: 0, delta: { role: "assistant", content: "我先读取入口文件。" } }],
    },
    {
      id: "ds-response-001",
      object: "chat.completion.chunk",
      created: 1788998400,
      model: "deepseek-chat",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "ds-call-read-file-001",
                type: "function",
                function: { name: "read_file", arguments: "{\"path\":\"packages/agent" },
              },
            ],
          },
        },
      ],
    },
    {
      id: "ds-response-001",
      object: "chat.completion.chunk",
      created: 1788998400,
      model: "deepseek-chat",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                function: { arguments: "-runtime/run-state.ts\"}" },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 221, completion_tokens: 24 },
    },
  ],
  expectedEvents: [
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-deepseek-001",
      streamIndex: 0,
      occurredAt: "2026-09-10T00:00:00.000Z",
      kind: "assistant_text_delta",
      delta: "我先读取入口文件。",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-deepseek-001",
      streamIndex: 1,
      occurredAt: "2026-09-10T00:00:00.010Z",
      kind: "tool_call_started",
      invocationId: "invocation-deepseek-read-file-001",
      toolName: "read_file",
      providerToolCallId: "ds-call-read-file-001",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-deepseek-001",
      streamIndex: 2,
      occurredAt: "2026-09-10T00:00:00.020Z",
      kind: "tool_arguments_delta",
      invocationId: "invocation-deepseek-read-file-001",
      delta: "{\"path\":\"packages/agent",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-deepseek-001",
      streamIndex: 3,
      occurredAt: "2026-09-10T00:00:00.030Z",
      kind: "tool_arguments_delta",
      invocationId: "invocation-deepseek-read-file-001",
      delta: "-runtime/run-state.ts\"}",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-deepseek-001",
      streamIndex: 4,
      occurredAt: "2026-09-10T00:00:00.040Z",
      kind: "tool_call_completed",
      invocationId: "invocation-deepseek-read-file-001",
      rawArguments: "{\"path\":\"packages/agent-runtime/run-state.ts\"}",
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-deepseek-001",
      streamIndex: 5,
      occurredAt: "2026-09-10T00:00:00.050Z",
      kind: "usage_updated",
      inputTokens: 221,
      outputTokens: 24,
    },
    {
      schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
      modelStepId: "model-step-deepseek-001",
      streamIndex: 6,
      occurredAt: "2026-09-10T00:00:00.060Z",
      kind: "model_step_completed",
      finishReason: "tool_calls",
      providerResponseId: "ds-response-001",
    },
  ],
} satisfies ProviderFixture;
