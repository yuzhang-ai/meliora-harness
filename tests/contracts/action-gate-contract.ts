import assert from "node:assert/strict";

import {
  ACTION_GATE_FIXTURE_NOW,
  actionGateDecisionFixtures,
} from "../../fixtures/contracts/v1/action-gate-decisions";
import { evaluateActionGate } from "../../packages/tool-runtime/evaluate-action-gate";

const now = new Date(ACTION_GATE_FIXTURE_NOW);

for (const fixture of Object.values(actionGateDecisionFixtures)) {
  assert.deepEqual(
    evaluateActionGate(fixture.request, now),
    fixture.expectedDecision,
    `${fixture.id}: ${fixture.scenario}`,
  );
}

console.log(`Action Gate contract fixtures passed: ${Object.keys(actionGateDecisionFixtures).length}`);
