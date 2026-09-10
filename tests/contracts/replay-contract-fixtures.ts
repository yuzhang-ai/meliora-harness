import assert from "node:assert/strict";
import { deepseekStreamDuplicateToolCallIdFixture } from "../../fixtures/contracts/v1/deepseek-stream-duplicate-tool-call-id";
import { deepseekStreamTextSingleToolFixture } from "../../fixtures/contracts/v1/deepseek-stream-text-single-tool";
import { kimiStreamMissingToolCallIdFixture } from "../../fixtures/contracts/v1/kimi-stream-missing-tool-call-id";
import { kimiStreamTextSingleToolFixture } from "../../fixtures/contracts/v1/kimi-stream-text-single-tool";
import { publicRunEventReplays } from "../../fixtures/contracts/v1/public-run-event-replays";
import { actionGateDecisionFixtures } from "../../fixtures/contracts/v1/action-gate-decisions";
import { checkOutcomeContract, type TurnOutcome } from "../../packages/agent-runtime/outcome";
import { canTransitionRun } from "../../packages/agent-runtime/run-state";
import type { CanonicalModelEvent } from "../../packages/model-protocol/contracts";

const sensitiveKey = /api.?key|authorization|password|secret|private.?reasoning|chain.?of.?thought|raw.?tool.?output/i;
const sensitiveValue = /authorization\s*:|bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]{8,}/i;

function assertPublicSafe(value: unknown, path = "root"): void {
  if (typeof value === "string") {
    assert.equal(sensitiveValue.test(value), false, `sensitive public value at ${path}`);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPublicSafe(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    assert.equal(sensitiveKey.test(key), false, `sensitive public key at ${path}.${key}`);
    assertPublicSafe(child, `${path}.${key}`);
  }
}

type ReplayableProviderFixture = Readonly<{
  id: string;
  rawChunks: readonly unknown[];
  expectedEvents: readonly CanonicalModelEvent[];
}>;

function replayProviderFixture(fixture: ReplayableProviderFixture): void {
  assert.ok(fixture.rawChunks.length > 0, `${fixture.id}: raw chunks missing`);
  assert.ok(fixture.expectedEvents.length > 0, `${fixture.id}: expected events missing`);
  fixture.expectedEvents.forEach((event, index) => {
    assert.equal(event.streamIndex, index, `${fixture.id}: stream index gap`);
    assert.equal(event.modelStepId, fixture.expectedEvents[0]?.modelStepId);
  });

  const deltas = new Map<string, string>();
  for (const event of fixture.expectedEvents) {
    if (event.kind === "tool_arguments_delta") {
      deltas.set(event.invocationId, `${deltas.get(event.invocationId) ?? ""}${event.delta}`);
    }
    if (event.kind === "tool_call_completed") {
      assert.equal(deltas.get(event.invocationId), event.rawArguments);
      assert.doesNotThrow(() => JSON.parse(event.rawArguments));
    }
  }
}

for (const fixture of [
  deepseekStreamTextSingleToolFixture,
  kimiStreamTextSingleToolFixture,
  deepseekStreamDuplicateToolCallIdFixture,
  kimiStreamMissingToolCallIdFixture,
]) {
  replayProviderFixture(fixture);
}

for (const replay of Object.values(publicRunEventReplays)) {
  assert.ok(replay.events.length > 0, `${replay.id}: events missing`);
  const firstSequence = ("resumeAfterSequence" in replay ? replay.resumeAfterSequence : undefined) ?? 0;
  const expectedFirstSequence = firstSequence + 1;
  assert.equal(replay.events[0]?.sequence, expectedFirstSequence);
  const eventIds = new Set<string>();
  replay.events.forEach((event, index) => {
    assert.equal(event.visibility, "public");
    assert.equal(event.sequence, expectedFirstSequence + index, `${replay.id}: sequence gap`);
    assert.equal(event.sessionId, replay.events[0]?.sessionId);
    assert.equal(event.runId, replay.events[0]?.runId);
    assert.equal(eventIds.has(event.eventId), false, `${replay.id}: duplicate event id`);
    eventIds.add(event.eventId);
    assertPublicSafe(event.payload, `${replay.id}.${event.kind}.payload`);
  });
}

assert.equal(publicRunEventReplays.reconnecting.createsRun, false);
assert.equal(actionGateDecisionFixtures.allow.expectedDecision.decision, "allow");
assert.equal(actionGateDecisionFixtures.ask.expectedDecision.decision, "ask");
assert.equal(actionGateDecisionFixtures.block.expectedDecision.decision, "block");
assert.notEqual(
  actionGateDecisionFixtures["tampered-arguments"].request.argumentsHash,
  actionGateDecisionFixtures["tampered-arguments"].request.grants[0]?.argumentsHash,
);
assert.equal(canTransitionRun("created", "preparing"), true);
assert.equal(canTransitionRun("completed", "model_streaming"), false);
assert.equal(canTransitionRun("cancelled", "preparing"), false);

const completedOutcome = {
  schemaVersion: "meliora.turn-outcome.v1",
  outcomeId: "outcome-contract-001",
  sessionId: "session-contract-001",
  turnId: "turn-contract-001",
  runId: "run-contract-001",
  attemptId: "attempt-contract-001",
  status: "completed",
  summary: "只读检查已完成。",
  deliverableRefs: [],
  receiptRefs: ["receipt-contract-001"],
  verificationRefs: ["verification-contract-001"],
  unresolved: [],
  userActions: [],
  evidenceRefs: ["artifact-contract-001"],
  proposedAt: "2026-09-10T00:20:00.000Z",
} satisfies TurnOutcome;

const completionEvidence = {
  pendingInvocationIds: [],
  pendingApprovalIds: [],
  requiredReceiptIds: ["receipt-contract-001"],
  receiptIds: ["receipt-contract-001"],
  verificationIds: ["verification-contract-001"],
  terminalEventPersisted: true,
} as const;

assert.equal(checkOutcomeContract(completedOutcome, completionEvidence).decision, "accepted");
assert.equal(
  checkOutcomeContract({
    ...completedOutcome,
    unresolved: [{ code: "verification_failed", message: "验证失败。", blocking: true }],
  }, completionEvidence).decision,
  "rejected",
);
assert.equal(
  checkOutcomeContract(completedOutcome, {
    ...completionEvidence,
    pendingInvocationIds: ["invocation-still-running"],
  }).decision,
  "rejected",
);
assert.equal(
  checkOutcomeContract({ ...completedOutcome, receiptRefs: [] }, completionEvidence).decision,
  "rejected",
);
assert.equal(
  checkOutcomeContract(completedOutcome, {
    ...completionEvidence,
    terminalEventPersisted: false,
  }).decision,
  "rejected",
);

console.log(JSON.stringify({
  gate: "meliora-m0-contract-fixture-validation",
  status: "PASS",
  providerFixtures: 4,
  publicReplays: Object.keys(publicRunEventReplays).length,
  actionGateFixtures: Object.keys(actionGateDecisionFixtures).length,
}));
