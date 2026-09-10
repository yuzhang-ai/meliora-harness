import { createSkillActivationRequestV1 } from "./authority-skill-lifecycle";
import {
  E3_S1_COMPILED_TOOL_CATALOG_V1,
  E3_S1_CONFLICT_REGISTRY_V1,
  E3_S1_SKILL_CATALOG_V1,
  compileE3S1SkillResolutionV1,
} from "./e3-s1-skill-runtime-authority";
import { e3PrincipalHashV1, e3S1AclSnapshotHashV1 } from "./e3-effect-authority-profile";
import type { SqliteE3S0SkillLedgerV1 } from "./sqlite-e3-s0-skill-ledger";
import { canonicalJsonV1, hashCanonicalJsonV1, hashUtf8V1, requiredStringV1 } from "./strict-json";

export class E3S1SkillAdmissionServiceV1 {
  constructor(private readonly store: SqliteE3S0SkillLedgerV1) {}

  admit(input: Readonly<{
    runId: string;
    turnId: string;
    requestId: string;
    actorId: string;
    sessionId: string;
    userGoal: string;
    issuedAt: string;
    expiresAt: string;
  }>) {
    const userGoal = requiredStringV1(input.userGoal, "e3S1Admission.userGoal", 8192);
    const principalHash = e3PrincipalHashV1(input.actorId, input.sessionId);
    const aclSnapshotHash = e3S1AclSnapshotHashV1(input.actorId, input.sessionId);
    const candidate = compileE3S1SkillResolutionV1({
      runId: input.runId,
      turnId: input.turnId,
      requestId: input.requestId,
      principalHash,
      aclSnapshotHash,
      issuedAt: input.issuedAt,
    });
    const bindingHash = hashCanonicalJsonV1({
      contractVersion: "formal-r3-e3-s1-skill-admission-v1",
      request: candidate.request,
      planHash: candidate.resolutionPlan.planHash,
      userGoalHash: hashUtf8V1(userGoal),
      expiresAt: input.expiresAt,
    });
    const begun = this.store.beginRun({ runId: input.runId, bindingHash });
    if (begun.kind === "activation") {
      return Object.freeze({ kind: "active" as const, candidate, activationReceipt: begun.activationReceipt });
    }
    if (begun.kind === "plan") {
      if (begun.plan.planHash !== candidate.resolutionPlan.planHash) throw new Error("e3_s1_admission_plan_replay_drift");
    } else if (begun.kind === "owner") {
      this.store.savePlan({
        runId: input.runId,
        bindingHash,
        ownerToken: begun.ownerToken,
        plan: candidate.resolutionPlan,
      });
    } else {
      return Object.freeze({ kind: begun.kind, candidate });
    }
    const reservation = candidate.resolutionPlan.closureBudgetReservations[0]!;
    const activationRequest = createSkillActivationRequestV1({
      runId: input.runId,
      requestId: input.requestId,
      idempotencyKey: `activate-${hashUtf8V1(`${input.runId}\u0000${input.requestId}`).slice(0, 24)}`,
      kernelPrincipalBindingRef: candidate.resolutionPlan.kernelPrincipalBindingRef,
      resolutionPlanHash: candidate.resolutionPlan.planHash,
      conflictRegistrySnapshotHash: candidate.resolutionPlan.conflictRegistrySnapshotHash,
      resolvedClosureHash: candidate.closure.closureHash,
      source: "user_explicit",
      skillInputJson: canonicalJsonV1({ goal: userGoal }),
      budgetReservationHash: reservation.reservationHash,
      parentSkillActivationId: null,
      parentActivationReceiptHash: null,
      requestedAt: input.issuedAt,
    });
    const activationReceipt = this.store.activate({
      request: activationRequest,
      plan: candidate.resolutionPlan,
      context: {
        principalHash,
        toolCatalogHash: E3_S1_COMPILED_TOOL_CATALOG_V1.catalogHash,
        skillCatalogHash: E3_S1_SKILL_CATALOG_V1.catalogHash,
        uxCapabilitySnapshotHash: candidate.resolutionPlan.uxCapabilitySnapshotHash,
        aclSnapshotHash,
        conflictRegistrySnapshotHash: E3_S1_CONFLICT_REGISTRY_V1.snapshotHash,
        issuedAt: input.issuedAt,
        expiresAt: input.expiresAt,
      },
    });
    return Object.freeze({ kind: "active" as const, candidate, activationReceipt });
  }
}
