import assert from "node:assert/strict";
import { deepseekStreamTextSingleToolFixture } from "../../fixtures/contracts/v1/deepseek-stream-text-single-tool";
import { kimiStreamTextSingleToolFixture } from "../../fixtures/contracts/v1/kimi-stream-text-single-tool";
import { decodeDeepSeekChatCompletionChunks, decodeKimiChatCompletionChunks } from "../../packages/providers";

const fixtureContexts = {
  deepseek: {
    modelStepId: "model-step-deepseek-001",
    occurredAt: (index: number) => `2026-09-10T00:00:00.${String(index * 10).padStart(3, "0")}Z`,
    createInvocationId: ({ providerToolCallId }: { providerToolCallId?: string }) =>
      providerToolCallId === "ds-call-read-file-001"
        ? "invocation-deepseek-read-file-001"
        : "unexpected-deepseek-invocation",
  },
  kimi: {
    modelStepId: "model-step-kimi-001",
    occurredAt: (index: number) => `2026-09-10T00:01:00.${String(index * 10).padStart(3, "0")}Z`,
    createInvocationId: ({ providerToolCallId }: { providerToolCallId?: string }) =>
      providerToolCallId === "kimi-call-git-status-001"
        ? "invocation-kimi-git-status-001"
        : "unexpected-kimi-invocation",
  },
} as const;

assert.deepEqual(
  decodeDeepSeekChatCompletionChunks(deepseekStreamTextSingleToolFixture.rawChunks, fixtureContexts.deepseek),
  deepseekStreamTextSingleToolFixture.expectedEvents,
);
assert.deepEqual(
  decodeKimiChatCompletionChunks(kimiStreamTextSingleToolFixture.rawChunks, fixtureContexts.kimi),
  kimiStreamTextSingleToolFixture.expectedEvents,
);

const multiToolEvents = decodeDeepSeekChatCompletionChunks(
  [
    {
      id: "multi-tool-response",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              { index: 0, id: "call-a", function: { name: "read_file", arguments: "{\"path\":\"a" } },
              { index: 1, id: "call-b", function: { name: "git_status", arguments: "{\"scope\":\"work" } },
            ],
          },
        },
      ],
    },
    {
      id: "multi-tool-response",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              { index: 1, function: { arguments: "space\"}" } },
              { index: 0, function: { arguments: "\"}" } },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    },
  ],
  {
    modelStepId: "model-step-multi-tool-001",
    occurredAt: (index) => `2026-09-10T00:02:00.${String(index).padStart(3, "0")}Z`,
    createInvocationId: ({ providerToolCallId }) => `invocation-${providerToolCallId}`,
  },
);
const completedCalls = multiToolEvents.filter((event) => event.kind === "tool_call_completed");
assert.deepEqual(
  completedCalls.map(({ invocationId, rawArguments }) => ({ invocationId, rawArguments })),
  [
    { invocationId: "invocation-call-a", rawArguments: "{\"path\":\"a\"}" },
    { invocationId: "invocation-call-b", rawArguments: "{\"scope\":\"workspace\"}" },
  ],
);

console.log(JSON.stringify({ gate: "meliora-m0-provider-codec-contract", status: "PASS", fixtures: 2 }));
