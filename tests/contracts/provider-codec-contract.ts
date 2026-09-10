import assert from "node:assert/strict";
import { deepseekStreamDuplicateToolCallIdFixture } from "../../fixtures/contracts/v1/deepseek-stream-duplicate-tool-call-id";
import { deepseekStreamTextSingleToolFixture } from "../../fixtures/contracts/v1/deepseek-stream-text-single-tool";
import { kimiStreamMissingToolCallIdFixture } from "../../fixtures/contracts/v1/kimi-stream-missing-tool-call-id";
import { kimiStreamTextSingleToolFixture } from "../../fixtures/contracts/v1/kimi-stream-text-single-tool";
import type { ProviderCodecContext, ProviderId } from "../../packages/providers";
import { decodeDeepSeekChatCompletionChunks, decodeKimiChatCompletionChunks } from "../../packages/providers";

function fixtureContext(provider: ProviderId, modelStepId: string, timestampPrefix: string): ProviderCodecContext {
  return {
    modelStepId,
    occurredAt: (index) => `${timestampPrefix}.${String(index * 10).padStart(3, "0")}Z`,
    createInvocationId: ({ choiceIndex, toolCallIndex }) => `invocation-${provider}-${choiceIndex}-${toolCallIndex}`,
  };
}

const decodedFixtures = [
  {
    fixture: deepseekStreamTextSingleToolFixture,
    actual: decodeDeepSeekChatCompletionChunks(
      deepseekStreamTextSingleToolFixture.rawChunks,
      fixtureContext("deepseek", "model-step-deepseek-001", "2026-09-10T00:00:00"),
    ),
  },
  {
    fixture: kimiStreamTextSingleToolFixture,
    actual: decodeKimiChatCompletionChunks(
      kimiStreamTextSingleToolFixture.rawChunks,
      fixtureContext("kimi", "model-step-kimi-001", "2026-09-10T00:01:00"),
    ),
  },
  {
    fixture: deepseekStreamDuplicateToolCallIdFixture,
    actual: decodeDeepSeekChatCompletionChunks(
      deepseekStreamDuplicateToolCallIdFixture.rawChunks,
      fixtureContext("deepseek", "model-step-deepseek-duplicate-id-001", "2026-09-10T00:02:00"),
    ),
  },
  {
    fixture: kimiStreamMissingToolCallIdFixture,
    actual: decodeKimiChatCompletionChunks(
      kimiStreamMissingToolCallIdFixture.rawChunks,
      fixtureContext("kimi", "model-step-kimi-missing-id-001", "2026-09-10T00:03:00"),
    ),
  },
] as const;

for (const { fixture, actual } of decodedFixtures) {
  assert.deepEqual(actual, fixture.expectedEvents, fixture.id);
}

const duplicateIdStarts = decodedFixtures[2].actual.filter((event) => event.kind === "tool_call_started");
assert.equal(duplicateIdStarts.length, 2);
assert.equal(new Set(duplicateIdStarts.map((event) => event.invocationId)).size, 2);
assert.equal(duplicateIdStarts[0]?.providerToolCallId, duplicateIdStarts[1]?.providerToolCallId);

const missingIdStart = decodedFixtures[3].actual.find((event) => event.kind === "tool_call_started");
assert.equal(missingIdStart?.providerToolCallId, undefined);
assert.equal(missingIdStart?.invocationId, "invocation-kimi-0-2");

console.log(JSON.stringify({ gate: "meliora-m0-provider-codec-contract", status: "PASS", fixtures: 4 }));
