import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { E3S0SkillAdmissionServiceV1 } from "../lib/zhiqu-ai/landing-page-harness/v1/e3-s0-skill-admission-service";
import { authorizeE3S0CanvasInspectV1 } from "../lib/zhiqu-ai/landing-page-harness/v1/e3-s0-skill-tool-runtime";
import { SqliteE3S0SkillLedgerV1 } from "../lib/zhiqu-ai/landing-page-harness/v1/sqlite-e3-s0-skill-ledger";
import { canonicalJsonV1, hashCanonicalJsonV1, hashUtf8V1 } from "../lib/zhiqu-ai/landing-page-harness/v1/strict-json";

const expectCode = (code: string, action: () => unknown) => {
  assert.throws(action, (error: unknown) => {
    assert.equal((error as { code?: string; message?: string }).code ?? (error as Error).message, code);
    return true;
  });
};

const root = mkdtempSync(join(tmpdir(), "e3-s0-a2-"));
chmodSync(root, 0o700);
const state = join(root, "state");
mkdirSync(state, { mode: 0o700 });
const dbPath = join(state, "skill-ledger.sqlite");
let now = Date.parse("2026-09-06T03:00:00.000Z");
let nonce = 0;
const open = () => new SqliteE3S0SkillLedgerV1({
  databasePath: dbPath,
  clock: () => now,
  nonce: () => `nonce-${++nonce}`,
});
const base = {
  runId: "run-e3-s0-a2-user",
  turnId: "turn-e3-s0-a2-user",
  requestId: "request-e3-s0-a2-user",
  actorId: "actor-e3-s0-a2",
  sessionId: "session-e3-s0-a2",
  source: "user_explicit" as const,
  available: true,
  userGoal: "读取当前页面事实并规划固定 SaaS Demo 预约页面。",
  issuedAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 60_000).toISOString(),
};

try {
  let store = open();
  let service = new E3S0SkillAdmissionServiceV1(store);
  const active = service.admit(base);
  assert.equal(active.kind, "active");
  if (active.kind !== "active") throw new Error("expected active");
  const replay = service.admit(base);
  assert.equal(replay.kind, "active");
  if (replay.kind !== "active") throw new Error("expected replay");
  assert.equal(replay.activationReceipt.receiptHash, active.activationReceipt.receiptHash);
  expectCode("e3_skill_run_binding_conflict", () => service.admit({ ...base, userGoal: "different material" }));

  const invocation = authorizeE3S0CanvasInspectV1({
    store,
    plan: active.candidate.resolutionPlan,
    activationReceipt: active.activationReceipt,
    callId: "call-e3-s0-a2-read",
    requestId: "tool-request-e3-s0-a2-read",
    idempotencyKey: "tool-idempotency-e3-s0-a2-read",
    scope: "summary",
    now: new Date(now + 1_000).toISOString(),
  });
  const invocationReplay = authorizeE3S0CanvasInspectV1({
    store,
    plan: active.candidate.resolutionPlan,
    activationReceipt: active.activationReceipt,
    callId: "call-e3-s0-a2-read",
    requestId: "tool-request-e3-s0-a2-read",
    idempotencyKey: "tool-idempotency-e3-s0-a2-read",
    scope: "summary",
    now: new Date(now + 1_000).toISOString(),
  });
  assert.equal(hashCanonicalJsonV1(invocationReplay), hashCanonicalJsonV1(invocation));
  expectCode("skill_tool_invocation_budget_exhausted", () => authorizeE3S0CanvasInspectV1({
    store,
    plan: active.candidate.resolutionPlan,
    activationReceipt: active.activationReceipt,
    callId: "call-e3-s0-a2-second",
    requestId: "tool-request-e3-s0-a2-second",
    idempotencyKey: "tool-idempotency-e3-s0-a2-second",
    scope: "selection",
    now: new Date(now + 2_000).toISOString(),
  }));
  store.close();

  store = open();
  service = new E3S0SkillAdmissionServiceV1(store);
  const restartReplay = service.admit(base);
  assert.equal(restartReplay.kind, "active");
  expectCode("skill_tool_invocation_budget_exhausted", () => authorizeE3S0CanvasInspectV1({
    store,
    plan: active.candidate.resolutionPlan,
    activationReceipt: active.activationReceipt,
    callId: "call-e3-s0-a2-after-restart",
    requestId: "tool-request-e3-s0-a2-after-restart",
    idempotencyKey: "tool-idempotency-e3-s0-a2-after-restart",
    scope: "summary",
    now: new Date(now + 3_000).toISOString(),
  }));
  const cancelled = store.transition({
    activationReceipt: active.activationReceipt,
    nextState: "cancelled",
    transitionReasonCode: "fake-runtime-complete",
    evidenceSet: null,
    evidenceContext: null,
    idempotencyKey: "transition-e3-s0-a2",
    issuedAt: new Date(now + 4_000).toISOString(),
  });
  const cancelledReplay = store.transition({
    activationReceipt: active.activationReceipt,
    nextState: "cancelled",
    transitionReasonCode: "fake-runtime-complete",
    evidenceSet: null,
    evidenceContext: null,
    idempotencyKey: "transition-e3-s0-a2",
    issuedAt: new Date(now + 4_000).toISOString(),
  });
  assert.equal(cancelledReplay.receiptHash, cancelled.receiptHash);
  expectCode("activation_already_terminal", () => store.transition({
    activationReceipt: active.activationReceipt,
    nextState: "cancelled",
    transitionReasonCode: "alternate-terminal",
    evidenceSet: null,
    evidenceContext: null,
    idempotencyKey: "transition-e3-s0-a2-alternate",
    issuedAt: new Date(now + 5_000).toISOString(),
  }));

  const unavailable = service.admit({
    ...base,
    runId: "run-e3-s0-a2-unavailable",
    turnId: "turn-e3-s0-a2-unavailable",
    requestId: "request-e3-s0-a2-unavailable",
    available: false,
  });
  assert.equal(unavailable.kind, "unavailable");
  const unavailableReplay = service.admit({
    ...base,
    runId: "run-e3-s0-a2-unavailable",
    turnId: "turn-e3-s0-a2-unavailable",
    requestId: "request-e3-s0-a2-unavailable",
    available: false,
  });
  assert.equal(unavailableReplay.kind, "unavailable");

  const modelBinding = "c".repeat(64);
  const modelOwner = store.beginModelCall({ runId: "run-e3-model-a2", phase: "actor", bindingHash: modelBinding });
  assert.equal(modelOwner.kind, "owner");
  if (modelOwner.kind !== "owner") throw new Error("expected model owner");
  assert.equal(store.beginModelCall({ runId: "run-e3-model-a2", phase: "actor", bindingHash: modelBinding }).kind, "in_progress");
  const modelResponseJson = canonicalJsonV1({ status: "fake-runtime-complete" });
  const modelResponseHash = hashUtf8V1(modelResponseJson);
  store.settleModelCall({
    runId: "run-e3-model-a2",
    phase: "actor",
    bindingHash: modelBinding,
    ownerToken: modelOwner.ownerToken,
    state: "completed",
    modelIdentity: "fake:model-a2",
    providerBindingHash: "d".repeat(64),
    promptManifestHash: "e".repeat(64),
    systemPromptHash: "f".repeat(64),
    requestHash: "1".repeat(64),
    responseHash: modelResponseHash,
    responseJson: modelResponseJson,
    publicErrorCode: null,
  });
  assert.deepEqual(store.beginModelCall({ runId: "run-e3-model-a2", phase: "actor", bindingHash: modelBinding }), { kind: "completed", responseHash: modelResponseHash });
  store.close();

  const staleRoot = join(root, "stale");
  mkdirSync(staleRoot, { mode: 0o700 });
  const staleDb = join(staleRoot, "ledger.sqlite");
  const stale = new SqliteE3S0SkillLedgerV1({ databasePath: staleDb, clock: () => now, nonce: () => "stale" });
  assert.equal(stale.beginRun({ runId: "run-e3-stale", bindingHash: "e".repeat(64) }).kind, "owner");
  now += 300_001;
  assert.equal(stale.beginRun({ runId: "run-e3-stale", bindingHash: "e".repeat(64) }).kind, "failed");
  stale.close();

  console.log(JSON.stringify({
    gate: "e3-s0-a2-durable-skill-lifecycle",
    status: "PASS",
    activationReplay: true,
    toolBudgetSurvivesRestart: true,
    appendOnlyTerminal: true,
    unavailableReplay: true,
    modelCallSingleAttempt: true,
    staleFailsClosed: true,
    admittedTools: ["canvas_inspect"],
    providerCalls: 0,
    canvasWrite: false,
  }));
} finally {
  rmSync(root, { recursive: true, force: true });
}
