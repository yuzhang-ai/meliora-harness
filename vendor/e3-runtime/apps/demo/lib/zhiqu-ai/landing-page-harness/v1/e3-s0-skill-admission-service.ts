import {
  H1_RUNTIME_COMPILED_TOOL_CATALOG_V1,
} from "./h1-runtime-authority";
import {
  createSkillActivationRequestV1,
} from "./authority-skill-lifecycle";
import {
  canonicalJsonV1,
  hashCanonicalJsonV1,
  hashUtf8V1,
  requiredStringV1,
} from "./strict-json";
import {
  E3_S0_SKILL_CATALOG_V1,
  E3_S0_SKILL_CONFLICT_REGISTRY_V1,
  compileE3S0SkillResolutionCandidateV1,
} from "./e3-s0-skill-runtime-authority";
import { E3_S0_SKILL_PROFILE_V1, type E3S0SkillSelectionSourceV1 } from "./e3-s0-skill-profile";
import { SqliteE3S0SkillLedgerV1 } from "./sqlite-e3-s0-skill-ledger";
import {
  e3PrincipalHashV1,
  e3S0AclSnapshotHashV1,
} from "./e3-effect-authority-profile";

export const E3_S0_SKILL_ADMISSION_SERVICE_V1 = Object.freeze({
  contractVersion: "formal-r3-e3-s0-skill-admission-service-v1",
  phase: "E3-A2",
  status: "durable_fake_runtime_candidate",
  claimCeiling: "declarative_skill_durable_lifecycle_candidate",
  providerCalls: 0,
  canvasWrite: false,
} as const);

export type E3S0AdmissionInputV1 = Readonly<{
  runId: string;
  turnId: string;
  requestId: string;
  actorId: string;
  sessionId: string;
  source: E3S0SkillSelectionSourceV1;
  available: boolean;
  userGoal: string;
  issuedAt: string;
  expiresAt: string;
}>;

const exactProfile = {
  modelIdentity: E3_S0_SKILL_PROFILE_V1.modelIdentity,
  ...E3_S0_SKILL_PROFILE_V1.principal,
  ...E3_S0_SKILL_PROFILE_V1.target,
};

export class E3S0SkillAdmissionServiceV1 {
  constructor(private readonly store: SqliteE3S0SkillLedgerV1) {}

  admit(input: E3S0AdmissionInputV1) {
    const userGoal = requiredStringV1(input.userGoal, "e3SkillAdmission.userGoal", 8_192);
    const authority = {
      principalHash: e3PrincipalHashV1(input.actorId, input.sessionId),
      aclSnapshotHash: e3S0AclSnapshotHashV1(input.actorId, input.sessionId),
    };
    const candidate = compileE3S0SkillResolutionCandidateV1({
      runId: input.runId,
      turnId: input.turnId,
      requestId: input.requestId,
      principalHash: authority.principalHash,
      aclSnapshotHash: authority.aclSnapshotHash,
      source: input.source,
      availableCapabilities: input.available
        ? [E3_S0_SKILL_PROFILE_V1.requiredCapability]
        : [],
      issuedAt: input.issuedAt,
      profile: exactProfile,
    });
    const bindingHash = hashCanonicalJsonV1({
      contractVersion: E3_S0_SKILL_ADMISSION_SERVICE_V1.contractVersion,
      request: candidate.request,
      planHash: candidate.resolutionPlan.planHash,
      userGoalHash: hashUtf8V1(userGoal),
      expiresAt: input.expiresAt,
    });
    const begun = this.store.beginRun({ runId: input.runId, bindingHash });
    if (begun.kind === "activation") {
      return { kind: "active" as const, candidate, bindingHash, activationReceipt: begun.activationReceipt };
    }
    if (begun.kind === "unavailable") {
      if (begun.plan.planHash !== candidate.resolutionPlan.planHash || candidate.status !== "skill_unavailable") throw new Error("e3_skill_admission_unavailable_replay_drift");
      return { kind: "unavailable" as const, candidate, bindingHash, fact: candidate.resolutionPlan.unavailable[0]! };
    }
    if (begun.kind === "plan") {
      if (begun.plan.planHash !== candidate.resolutionPlan.planHash) throw new Error("e3_skill_admission_plan_replay_drift");
    } else if (begun.kind === "owner") {
      this.store.savePlan({
        runId: input.runId,
        bindingHash,
        ownerToken: begun.ownerToken,
        plan: candidate.resolutionPlan,
      });
    } else {
      return { kind: begun.kind, candidate, bindingHash };
    }
    if (candidate.status === "skill_unavailable") {
      this.store.markUnavailable({ runId: input.runId, planHash: candidate.resolutionPlan.planHash });
      return {
        kind: "unavailable" as const,
        candidate,
        bindingHash,
        fact: candidate.resolutionPlan.unavailable[0]!,
      };
    }
    const closure = candidate.resolutionPlan.orderedClosures[0]!;
    const reservation = candidate.resolutionPlan.closureBudgetReservations[0]!;
    const activationRequest = createSkillActivationRequestV1({
      runId: input.runId,
      requestId: input.requestId,
      idempotencyKey: `activate-${hashUtf8V1(`${input.runId}\u0000${input.requestId}`).slice(0, 24)}`,
      kernelPrincipalBindingRef: candidate.resolutionPlan.kernelPrincipalBindingRef,
      resolutionPlanHash: candidate.resolutionPlan.planHash,
      conflictRegistrySnapshotHash: candidate.resolutionPlan.conflictRegistrySnapshotHash,
      resolvedClosureHash: closure.closureHash,
      source: input.source,
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
        principalHash: authority.principalHash,
        toolCatalogHash: H1_RUNTIME_COMPILED_TOOL_CATALOG_V1.catalogHash,
        skillCatalogHash: E3_S0_SKILL_CATALOG_V1.catalogHash,
        uxCapabilitySnapshotHash: candidate.resolutionPlan.uxCapabilitySnapshotHash,
        aclSnapshotHash: authority.aclSnapshotHash,
        conflictRegistrySnapshotHash: E3_S0_SKILL_CONFLICT_REGISTRY_V1.snapshotHash,
        issuedAt: input.issuedAt,
        expiresAt: input.expiresAt,
      },
    });
    return { kind: "active" as const, candidate, bindingHash, activationReceipt };
  }
}
