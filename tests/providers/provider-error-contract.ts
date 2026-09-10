import assert from "node:assert/strict";
import { providerErrorFixtures } from "../../fixtures/contracts/v1/provider-errors";
import {
  classifyDeepSeekProviderFailure,
  createDeepSeekProviderFailureEvent,
  classifyKimiProviderFailure,
  createKimiProviderFailureEvent,
  type ProviderCodecContext,
} from "../../packages/providers";

function fixtureContext(modelStepId: string, occurredAt: string): ProviderCodecContext {
  return {
    modelStepId,
    occurredAt: () => occurredAt,
    createInvocationId: () => "not-used-for-provider-failure",
  };
}

for (const fixture of providerErrorFixtures) {
  const context = fixtureContext(fixture.expectedEvent.modelStepId, fixture.expectedEvent.occurredAt);
  const actualClassification =
    fixture.provider === "deepseek"
      ? classifyDeepSeekProviderFailure(fixture.failure)
      : classifyKimiProviderFailure(fixture.failure);
  const actualEvent =
    fixture.provider === "deepseek"
      ? createDeepSeekProviderFailureEvent(fixture.failure, context, fixture.expectedEvent.streamIndex)
      : createKimiProviderFailureEvent(fixture.failure, context, fixture.expectedEvent.streamIndex);

  assert.deepEqual(actualClassification, fixture.expectedClassification, `${fixture.id}: classification`);
  assert.deepEqual(actualEvent, fixture.expectedEvent, `${fixture.id}: canonical failure event`);
}

const safeFixtureText = JSON.stringify(providerErrorFixtures);
assert.equal(/authorization|bearer\s+|api.?key|sk-[a-z0-9_-]{8,}/i.test(safeFixtureText), false);

const transportFixture = providerErrorFixtures.find((fixture) => fixture.failure.kind === "transport");
assert.equal(transportFixture?.expectedClassification.code, "provider_unavailable");
assert.equal(transportFixture?.expectedClassification.retryable, true);

console.log(JSON.stringify({
  gate: "meliora-m0-provider-error-contract",
  status: "PASS",
  fixtures: providerErrorFixtures.length,
}));
