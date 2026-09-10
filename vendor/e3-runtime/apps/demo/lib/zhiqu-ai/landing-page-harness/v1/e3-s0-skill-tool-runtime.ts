import type { SkillActivationReceiptV1, SkillResolutionPlanV1 } from "./authority-fabric-contracts";
import { H1_RUNTIME_COMPILED_TOOL_CATALOG_V1 } from "./h1-runtime-authority";
import { canonicalJsonV1 } from "./strict-json";
import { SqliteE3S0SkillLedgerV1 } from "./sqlite-e3-s0-skill-ledger";

export const E3_S0_SKILL_TOOL_RUNTIME_V1 = Object.freeze({
  contractVersion: "formal-r3-e3-s0-skill-tool-runtime-v1",
  phase: "E3-A2",
  admittedTool: "canvas_inspect@h1-effective-facts-inspect-v1",
  effect: "private_read",
  executesCanvasWrite: false,
} as const);

export const authorizeE3S0CanvasInspectV1 = (input: Readonly<{
  store: SqliteE3S0SkillLedgerV1;
  plan: SkillResolutionPlanV1;
  activationReceipt: SkillActivationReceiptV1;
  callId: string;
  requestId: string;
  idempotencyKey: string;
  scope: "summary" | "selection";
  now: string;
}>) => {
  const closure = input.plan.orderedClosures[0];
  const tool = closure?.tools[0];
  if (!closure || !tool) throw new Error("e3_skill_tool_closure_missing");
  return input.store.authorizeToolInvocation({
    request: {
      runId: input.activationReceipt.runId,
      skillActivationId: input.activationReceipt.skillActivationId,
      activationReceiptHash: input.activationReceipt.receiptHash,
      resolvedClosureHash: closure.closureHash,
      toolId: tool.toolId,
      toolVersion: tool.toolVersion,
      toolDefinitionHash: tool.definitionHash,
      executorBindingHash: tool.executorBindingHash,
      callId: input.callId,
      requestId: input.requestId,
      idempotencyKey: input.idempotencyKey,
      argumentsJson: canonicalJsonV1({
        contractVersion: "h1-effective-facts-canvas-inspect-request-v1",
        scope: input.scope,
      }),
      budgetReservationHash: input.activationReceipt.budgetReservationHash,
    },
    closure,
    plan: input.plan,
    toolCatalog: H1_RUNTIME_COMPILED_TOOL_CATALOG_V1,
    activationReceipt: input.activationReceipt,
    now: input.now,
  });
};
