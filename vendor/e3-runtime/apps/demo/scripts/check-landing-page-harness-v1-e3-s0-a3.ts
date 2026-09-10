import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import type { E3S0AdmissionInputV1 } from "../lib/zhiqu-ai/landing-page-harness/v1/e3-s0-skill-admission-service";
import type { E3S0SkillFinalAnswerProviderV1 } from "../lib/zhiqu-ai/landing-page-harness/v1/e3-s0-skill-final-answer";
import { createE3S0SkillRunnerCompositionV1 } from "../lib/zhiqu-ai/landing-page-harness/v1/e3-s0-skill-runner-composition";
import { runDirectedE3S0SkillWorkerEntryV1 } from "../lib/zhiqu-ai/landing-page-harness/v1/e3-s0-skill-worker-entry";
import { E3_S0_SKILL_PACKAGE_V1 } from "../lib/zhiqu-ai/landing-page-harness/v1/e3-s0-skill-package";
import { resolveE3S0SkillSelectionV1 } from "../lib/zhiqu-ai/landing-page-harness/v1/e3-s0-skill-selection";
import { hashCanonicalJsonV1, hashUtf8V1 } from "../lib/zhiqu-ai/landing-page-harness/v1/strict-json";

const root = mkdtempSync(join(tmpdir(), "e3-s0-a3-"));
chmodSync(root, 0o700);
const instant = Date.parse("2026-09-06T06:00:00.000Z");
let nonce = 0;
let providerCalls = 0;
const observations: Array<{
  lifecycleKind: "active" | "unavailable";
  systemPrompt: string;
  toolIds: string[];
}> = [];

const provider: E3S0SkillFinalAnswerProviderV1 = Object.freeze({
  modelIdentity: "minimax:MiniMax-M3",
  providerBindingHash: hashCanonicalJsonV1({ provider: "in-process-fake", version: "e3-a3-v1" }),
  maximumProviderAttempts: 1,
  completeFinalAnswerV1: async ({ messages, tools, lifecycleKind }) => {
    providerCalls += 1;
    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.role, "system");
    observations.push({
      lifecycleKind,
      systemPrompt: messages[0]!.content,
      toolIds: tools.map((tool) => tool.toolId),
    });
    return lifecycleKind === "active"
      ? {
          content: "",
          finishReason: "tool_calls" as const,
          lifecycleDecision: "request_read" as const,
          toolCalls: [{
            callId: `fake-read-${providerCalls}`,
            toolId: "canvas_inspect",
            argumentsJson: '{"contractVersion":"h1-effective-facts-canvas-inspect-request-v1","scope":"summary"}',
          }],
        }
      : {
          content: "当前只读 Skill 所需能力不可用，未读取或修改页面。",
          finishReason: "stop" as const,
          lifecycleDecision: "report_unavailable" as const,
          toolCalls: [],
        };
  },
});

const request = (
  suffix: string,
  source: "user_explicit" | "actor_selected",
  available: boolean
): E3S0AdmissionInputV1 => ({
  runId: `run-e3-s0-a3-${suffix}`,
  turnId: `turn-e3-s0-a3-${suffix}`,
  requestId: `request-e3-s0-a3-${suffix}`,
  actorId: `actor-e3-s0-a3-${suffix}`,
  sessionId: `session-e3-s0-a3-${suffix}`,
  source,
  available,
  userGoal: "读取当前页面事实，并给出固定 SaaS Demo 预约页的只读规划。",
  issuedAt: new Date(instant - 1_000).toISOString(),
  expiresAt: new Date(instant + 60_000).toISOString(),
});
const revisionBinding = "c".repeat(64);

const main = async () => {
try {
  const selection = resolveE3S0SkillSelectionV1({
    source: "actor_selected",
    skillId: E3_S0_SKILL_PACKAGE_V1.skillId,
    skillVersion: E3_S0_SKILL_PACKAGE_V1.skillVersion,
  });
  assert.equal(selection.source, "actor_selected");
  assert.throws(() => resolveE3S0SkillSelectionV1({
    source: "actor_selected",
    skillId: "outside-skill",
    skillVersion: "1.0.0",
  }), /e3_skill_selection_outside_frozen_profile/);

  let composition = createE3S0SkillRunnerCompositionV1({
    privateRoot: root,
    provider,
    clock: () => instant,
    nonce: () => `nonce-${++nonce}`,
  });
  const explicitRequest = request("explicit", "user_explicit", true);
  const explicit = await runDirectedE3S0SkillWorkerEntryV1({
    driver: composition.driver,
    runId: explicitRequest.runId,
    request: explicitRequest,
    revisionBinding,
  });
  assert.equal(explicit.kind, "active");
  assert.equal(explicit.replayed, false);
  assert.equal(observations[0]!.systemPrompt, explicit.composition.systemPrompt);
  assert.equal(hashUtf8V1(observations[0]!.systemPrompt), explicit.composition.promptCompositionManifest.composedPromptHash);
  assert.deepEqual(observations[0]!.toolIds, ["canvas_inspect"]);
  assert.ok(explicit.composition.promptCompositionManifest.orderedFragments.some((fragment) => fragment.sourceKind === "skill"));
  assert.equal(explicit.terminal.modelIdentity, provider.modelIdentity);
  assert.equal(explicit.terminal.providerBindingHash, provider.providerBindingHash);
  assert.equal(explicit.terminal.promptManifestHash, explicit.composition.promptCompositionManifest.manifestHash);
  assert.equal(explicit.terminal.systemPromptHash, explicit.composition.systemPromptHash);
  assert.ok(explicit.terminal.responseJson);
  composition.close();

  composition = createE3S0SkillRunnerCompositionV1({
    privateRoot: root,
    provider,
    clock: () => instant,
    nonce: () => `nonce-${++nonce}`,
  });
  const replay = await composition.driver.run({ request: explicitRequest, revisionBinding });
  assert.equal(replay.replayed, true);
  assert.equal(providerCalls, 1, "completed restart replay must not call the fake provider again");

  const actorRequest = request("actor", "actor_selected", true);
  const actor = await composition.driver.run({ request: actorRequest, revisionBinding });
  assert.equal(actor.kind, "active");
  assert.equal(actor.admitted.kind, "active");
  if (actor.admitted.kind === "active") assert.equal(actor.admitted.activationReceipt.source, "actor_selected");

  const unavailableRequest = request("unavailable", "actor_selected", false);
  const unavailable = await composition.driver.run({ request: unavailableRequest, revisionBinding });
  assert.equal(unavailable.kind, "unavailable");
  assert.deepEqual(observations.at(-1)!.toolIds, []);
  assert.equal(unavailable.composition.promptCompositionManifest.activeSkillClosureHashes.length, 0);
  assert.equal(unavailable.composition.promptCompositionManifest.orderedFragments.some((fragment) => fragment.sourceKind === "skill"), false);
  assert.equal(unavailable.composition.promptCompositionManifest.orderedFragments.some((fragment) => fragment.sourceKind === "tool_sheet"), false);
  assert.equal(unavailable.composition.promptCompositionManifest.orderedFragments.filter((fragment) => fragment.sourceKind === "unavailable").length, 1);
  assert.equal(unavailable.output.lifecycleDecision, "report_unavailable");
  composition.close();

  const raw = new Database(join(root, "e3-state-v1", "skill-ledger.sqlite"));
  raw.prepare("UPDATE e3_model_calls SET response_json=? WHERE run_id=? AND phase='final-answer'")
    .run('{"tampered":true}', explicitRequest.runId);
  raw.close();
  composition = createE3S0SkillRunnerCompositionV1({
    privateRoot: root,
    provider,
    clock: () => instant,
    nonce: () => `nonce-${++nonce}`,
  });
  assert.throws(
    () => composition.store.readModelCall(explicitRequest.runId, "final-answer"),
    /e3_model_call_recovery_drift/
  );
  composition.close();

  let failureCalls = 0;
  const failingProvider: E3S0SkillFinalAnswerProviderV1 = Object.freeze({
    ...provider,
    providerBindingHash: hashCanonicalJsonV1({ provider: "in-process-fake-failure", version: "e3-a3-v1" }),
    completeFinalAnswerV1: async () => {
      failureCalls += 1;
      throw new Error("e3_skill_fake_provider_failure");
    },
  });
  composition = createE3S0SkillRunnerCompositionV1({
    privateRoot: join(root, "failure"),
    provider: failingProvider,
    clock: () => instant,
    nonce: () => `nonce-${++nonce}`,
  });
  const failureRequest = request("failure", "user_explicit", true);
  await assert.rejects(composition.driver.run({ request: failureRequest, revisionBinding }), /e3_skill_fake_provider_failure/);
  const failedTerminal = composition.store.readModelCall(failureRequest.runId, "final-answer");
  assert.equal(failedTerminal?.state, "failed");
  assert.equal(failedTerminal?.publicErrorCode, "e3_skill_fake_provider_failure");
  await assert.rejects(composition.driver.run({ request: failureRequest, revisionBinding }), /e3_skill_model_call_failed/);
  assert.equal(failureCalls, 1, "failed terminal must fail closed without an automatic retry");

  const expiredRequest = {
    ...request("expired", "user_explicit", true),
    expiresAt: new Date(instant).toISOString(),
  };
  await assert.rejects(composition.driver.run({ request: expiredRequest, revisionBinding }), /e3_skill_driver_authority_expired/);
  composition.close();

  console.log(JSON.stringify({
    gate: "e3-s0-a3-driver-prompt-fake-provider",
    status: "PASS",
    paths: ["user_explicit", "actor_selected", "skill_unavailable"],
    promptBytesFromManifest: true,
    completedReplayWithoutRetry: true,
    failedTerminalWithoutRetry: true,
    durableModelCallBinding: true,
    tamperedTerminalFailsClosed: true,
    providerCalls,
    realProviderCalls: 0,
    browser: false,
    canvasWrite: false,
  }));
} finally {
  rmSync(root, { recursive: true, force: true });
}
};

void main();
