import {
  StrictJsonErrorV1,
  requiredIdV1,
  requiredStringV1,
  strictRecordV1,
} from "./strict-json";

export const LANDING_PAGE_GOVERNANCE_V1 = Object.freeze({
  goal: "landing-page-governance-goal-v1",
  amendment: "landing-page-governance-goal-amendment-v1",
  capabilityFact: "landing-page-governance-host-capability-fact-v1",
  capabilityGap: "landing-page-governance-actor-capability-gap-handoff-v1",
  finalClaim: "landing-page-governance-final-claim-v1",
  turnOutcome: "landing-page-governance-turn-outcome-v1",
  claimGateFacts: "landing-page-governance-host-claim-gate-facts-v1",
  claimGateAssessment: "landing-page-governance-claim-gate-assessment-v1",
});

export const TURN_DELIVERY_OUTCOMES_V1 = Object.freeze([
  "fulfilled",
  "fulfilled_with_limitations",
  "advisory_only",
  "awaiting_user",
  "blocked_capability",
  "blocked_policy",
  "recoverable_failure",
] as const);
export type TurnDeliveryOutcomeV1 = (typeof TURN_DELIVERY_OUTCOMES_V1)[number];

export const FINAL_CLAIM_EFFECTS_V1 = Object.freeze([
  "advisory",
  "read",
  "write",
  "save",
  "preview",
  "publish",
] as const);
export type FinalClaimEffectV1 = (typeof FINAL_CLAIM_EFFECTS_V1)[number];

export type GoalAmendmentV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_GOVERNANCE_V1.amendment;
  amendmentId: string;
  revision: number;
  instruction: string;
}>;

export type GoalRequirementV1 = Readonly<{
  requirementId: string;
  description: string;
  requiredEffects: readonly FinalClaimEffectV1[];
}>;

export type GoalContractV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_GOVERNANCE_V1.goal;
  goalId: string;
  originalIntent: string;
  intentRevision: number;
  requirements: readonly GoalRequirementV1[];
  amendments: readonly GoalAmendmentV1[];
}>;

/** Kernel/Host-owned capability fact. Actor text cannot create this evidence. */
export type HostCapabilityFactV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_GOVERNANCE_V1.capabilityFact;
  capabilityFactId: string;
  requiredCapability: string;
  availability: "absent" | "unavailable" | "denied";
  reasonCode: string;
  evidenceRefs: readonly string[];
}>;

export type CapabilityAlternativePathV1 = Readonly<{
  pathId: string;
  description: string;
  disposition: "selected" | "declined" | "unavailable";
}>;

/** Actor-owned semantic handoff, bound to a Host capability fact. */
export type ActorCapabilityGapHandoffV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_GOVERNANCE_V1.capabilityGap;
  gapId: string;
  goalId: string;
  requirementIds: readonly string[];
  capabilityFactId: string;
  unfulfilledEffects: readonly FinalClaimEffectV1[];
  alternativePaths: readonly CapabilityAlternativePathV1[];
  resolutionOwner: "actor" | "user" | "technical_owner" | "policy_owner";
  retryCondition: string | null;
}>;

export type FinalClaimV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_GOVERNANCE_V1.finalClaim;
  claimId: string;
  requirementIds: readonly string[];
  effect: FinalClaimEffectV1;
  state: "completed" | "not_completed";
  evidenceRefs: readonly string[];
}>;

export type TurnOutcomeProposalV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_GOVERNANCE_V1.turnOutcome;
  proposalId: string;
  goalId: string;
  outcome: TurnDeliveryOutcomeV1;
  summary: string;
  completedRequirementIds: readonly string[];
  unresolvedRequirementIds: readonly string[];
  capabilityGaps: readonly ActorCapabilityGapHandoffV1[];
  finalClaims: readonly FinalClaimV1[];
  actorDraftText: string;
}>;

export type ClaimGateEvidenceV1 = Readonly<{
  requirementId: string;
  effect: FinalClaimEffectV1;
  evidenceRef: string;
}>;

/** Kernel/Host/Verifier-owned facts. Runtime wiring must construct these, never the Actor. */
export type ClaimGateFactsV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_GOVERNANCE_V1.claimGateFacts;
  effectEvidence: readonly ClaimGateEvidenceV1[];
  capabilityFacts: readonly HostCapabilityFactV1[];
  missingUserAuthorizationEvidenceRefs: readonly string[];
  transientProviderFailureEvidenceRefs: readonly string[];
  policyBlockEvidenceRefs: readonly string[];
  goalPathClosureEvidenceRefs: readonly string[];
}>;

export const CLAIM_GATE_REJECTION_CODES_V1 = Object.freeze([
  "goal_identity_mismatch",
  "unknown_requirement",
  "requirement_partition_conflict",
  "requirement_partition_incomplete",
  "completed_requirement_missing_claim",
  "unknown_capability_fact",
  "capability_gap_identity_mismatch",
  "capability_gap_requirement_completed",
  "capability_gap_effect_mismatch",
  "capability_gap_effect_claim_conflict",
  "unsupported_completed_claim",
  "fulfilled_with_unresolved_work",
  "limited_without_mixed_result",
  "advisory_with_external_effect_claim",
  "blocked_capability_without_gap",
  "blocked_capability_uncovered_requirement",
  "blocked_capability_has_selected_path",
  "blocked_capability_requires_path_closure_evidence",
  "terminal_state_without_unresolved_work",
  "awaiting_user_without_authorization_evidence",
  "recoverable_failure_without_provider_evidence",
  "blocked_policy_without_policy_evidence",
] as const);
export type ClaimGateRejectionCodeV1 = (typeof CLAIM_GATE_REJECTION_CODES_V1)[number];

export type ClaimGateAssessmentV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_GOVERNANCE_V1.claimGateAssessment;
  accepted: boolean;
  rejectionCodes: readonly ClaimGateRejectionCodeV1[];
  actorDraftAuthorizedForPublicDelivery: false;
}>;

const keys = {
  amendment: ["contractVersion", "amendmentId", "revision", "instruction"],
  requirement: ["requirementId", "description", "requiredEffects"],
  goal: ["contractVersion", "goalId", "originalIntent", "intentRevision", "requirements", "amendments"],
  capabilityFact: ["contractVersion", "capabilityFactId", "requiredCapability", "availability", "reasonCode", "evidenceRefs"],
  alternativePath: ["pathId", "description", "disposition"],
  capabilityGap: ["contractVersion", "gapId", "goalId", "requirementIds", "capabilityFactId", "unfulfilledEffects", "alternativePaths", "resolutionOwner", "retryCondition"],
  finalClaim: ["contractVersion", "claimId", "requirementIds", "effect", "state", "evidenceRefs"],
  turnOutcome: ["contractVersion", "proposalId", "goalId", "outcome", "summary", "completedRequirementIds", "unresolvedRequirementIds", "capabilityGaps", "finalClaims", "actorDraftText"],
  effectEvidence: ["requirementId", "effect", "evidenceRef"],
  facts: ["contractVersion", "effectEvidence", "capabilityFacts", "missingUserAuthorizationEvidenceRefs", "transientProviderFailureEvidenceRefs", "policyBlockEvidenceRefs", "goalPathClosureEvidenceRefs"],
} as const;

const assertVersion = (value: unknown, expected: string, path: string) => {
  if (value !== expected) throw new StrictJsonErrorV1("contract_version_mismatch", path, `Expected ${expected}.`);
};
const integer = (value: unknown, path: string) => {
  if (!Number.isInteger(value) || (value as number) < 1) throw new StrictJsonErrorV1("invalid_integer", path, "Expected integer >= 1.");
  return value as number;
};
const enumValue = <T extends string>(value: unknown, allowed: readonly T[], path: string): T => {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new StrictJsonErrorV1("invalid_enum", path, "Unexpected enum value.");
  return value as T;
};
const ids = (value: unknown, path: string, maximum = 64): readonly string[] => {
  if (!Array.isArray(value) || value.length > maximum) throw new StrictJsonErrorV1("invalid_array", path, "Expected a bounded array.");
  const decoded = value.map((item, index) => requiredIdV1(item, `${path}[${index}]`));
  if (new Set(decoded).size !== decoded.length) throw new StrictJsonErrorV1("duplicate_identity", path, "IDs must be unique.");
  return decoded;
};
const effects = (value: unknown, path: string): readonly FinalClaimEffectV1[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > FINAL_CLAIM_EFFECTS_V1.length) throw new StrictJsonErrorV1("invalid_array", path, "Expected 1-6 effects.");
  const decoded = value.map((item, index) => enumValue(item, FINAL_CLAIM_EFFECTS_V1, `${path}[${index}]`));
  if (new Set(decoded).size !== decoded.length) throw new StrictJsonErrorV1("duplicate_effect", path, "Effects must be unique.");
  return decoded;
};

export const decodeGoalAmendmentV1 = (value: unknown): GoalAmendmentV1 => {
  const record = strictRecordV1(value, keys.amendment, "goalAmendment");
  assertVersion(record.contractVersion, LANDING_PAGE_GOVERNANCE_V1.amendment, "goalAmendment.contractVersion");
  requiredIdV1(record.amendmentId, "goalAmendment.amendmentId");
  integer(record.revision, "goalAmendment.revision");
  requiredStringV1(record.instruction, "goalAmendment.instruction", 20_000);
  return structuredClone(record) as GoalAmendmentV1;
};

export const decodeGoalContractV1 = (value: unknown): GoalContractV1 => {
  const record = strictRecordV1(value, keys.goal, "goal");
  assertVersion(record.contractVersion, LANDING_PAGE_GOVERNANCE_V1.goal, "goal.contractVersion");
  requiredIdV1(record.goalId, "goal.goalId");
  requiredStringV1(record.originalIntent, "goal.originalIntent", 20_000);
  const revision = integer(record.intentRevision, "goal.intentRevision");
  if (!Array.isArray(record.requirements) || record.requirements.length < 1 || record.requirements.length > 64) throw new StrictJsonErrorV1("invalid_array", "goal.requirements", "Expected 1-64 requirements.");
  const requirementIds = record.requirements.map((item, index) => {
    const requirement = strictRecordV1(item, keys.requirement, `goal.requirements[${index}]`);
    const requirementId = requiredIdV1(requirement.requirementId, `goal.requirements[${index}].requirementId`);
    requiredStringV1(requirement.description, `goal.requirements[${index}].description`, 1_000);
    effects(requirement.requiredEffects, `goal.requirements[${index}].requiredEffects`);
    return requirementId;
  });
  if (new Set(requirementIds).size !== requirementIds.length) throw new StrictJsonErrorV1("duplicate_identity", "goal.requirements", "Requirement IDs must be unique.");
  if (!Array.isArray(record.amendments) || record.amendments.length > 32) throw new StrictJsonErrorV1("invalid_array", "goal.amendments", "Expected a bounded array.");
  const amendments = record.amendments.map(decodeGoalAmendmentV1);
  if (revision !== amendments.length + 1 || amendments.some((item, index) => item.revision !== index + 2)) throw new StrictJsonErrorV1("invalid_revision_chain", "goal.amendments", "Amendments must form the exact revision chain.");
  return structuredClone(record) as GoalContractV1;
};

export const decodeHostCapabilityFactV1 = (value: unknown): HostCapabilityFactV1 => {
  const record = strictRecordV1(value, keys.capabilityFact, "capabilityFact");
  assertVersion(record.contractVersion, LANDING_PAGE_GOVERNANCE_V1.capabilityFact, "capabilityFact.contractVersion");
  requiredIdV1(record.capabilityFactId, "capabilityFact.capabilityFactId");
  requiredIdV1(record.requiredCapability, "capabilityFact.requiredCapability");
  enumValue(record.availability, ["absent", "unavailable", "denied"], "capabilityFact.availability");
  requiredIdV1(record.reasonCode, "capabilityFact.reasonCode");
  if (ids(record.evidenceRefs, "capabilityFact.evidenceRefs").length < 1) throw new StrictJsonErrorV1("missing_evidence", "capabilityFact.evidenceRefs", "Host facts require evidence.");
  return structuredClone(record) as HostCapabilityFactV1;
};

export const decodeCapabilityGapV1 = (value: unknown): ActorCapabilityGapHandoffV1 => {
  const record = strictRecordV1(value, keys.capabilityGap, "capabilityGap");
  assertVersion(record.contractVersion, LANDING_PAGE_GOVERNANCE_V1.capabilityGap, "capabilityGap.contractVersion");
  for (const field of ["gapId", "goalId", "capabilityFactId"] as const) requiredIdV1(record[field], `capabilityGap.${field}`);
  if (ids(record.requirementIds, "capabilityGap.requirementIds").length < 1) throw new StrictJsonErrorV1("invalid_array", "capabilityGap.requirementIds", "A gap must affect a requirement.");
  effects(record.unfulfilledEffects, "capabilityGap.unfulfilledEffects");
  if (!Array.isArray(record.alternativePaths) || record.alternativePaths.length > 16) throw new StrictJsonErrorV1("invalid_array", "capabilityGap.alternativePaths", "Expected a bounded array.");
  const pathIds = record.alternativePaths.map((item, index) => {
    const path = strictRecordV1(item, keys.alternativePath, `capabilityGap.alternativePaths[${index}]`);
    const pathId = requiredIdV1(path.pathId, `capabilityGap.alternativePaths[${index}].pathId`);
    requiredStringV1(path.description, `capabilityGap.alternativePaths[${index}].description`, 500);
    enumValue(path.disposition, ["selected", "declined", "unavailable"], `capabilityGap.alternativePaths[${index}].disposition`);
    return pathId;
  });
  if (new Set(pathIds).size !== pathIds.length) throw new StrictJsonErrorV1("duplicate_identity", "capabilityGap.alternativePaths", "Path IDs must be unique.");
  enumValue(record.resolutionOwner, ["actor", "user", "technical_owner", "policy_owner"], "capabilityGap.resolutionOwner");
  if (record.retryCondition !== null) requiredStringV1(record.retryCondition, "capabilityGap.retryCondition", 500);
  return structuredClone(record) as ActorCapabilityGapHandoffV1;
};

export const decodeFinalClaimV1 = (value: unknown): FinalClaimV1 => {
  const record = strictRecordV1(value, keys.finalClaim, "finalClaim");
  assertVersion(record.contractVersion, LANDING_PAGE_GOVERNANCE_V1.finalClaim, "finalClaim.contractVersion");
  requiredIdV1(record.claimId, "finalClaim.claimId");
  if (ids(record.requirementIds, "finalClaim.requirementIds").length < 1) throw new StrictJsonErrorV1("invalid_array", "finalClaim.requirementIds", "A claim must bind a requirement.");
  enumValue(record.effect, FINAL_CLAIM_EFFECTS_V1, "finalClaim.effect");
  enumValue(record.state, ["completed", "not_completed"], "finalClaim.state");
  ids(record.evidenceRefs, "finalClaim.evidenceRefs");
  return structuredClone(record) as FinalClaimV1;
};

export const decodeTurnOutcomeProposalV1 = (value: unknown): TurnOutcomeProposalV1 => {
  const record = strictRecordV1(value, keys.turnOutcome, "turnOutcome");
  assertVersion(record.contractVersion, LANDING_PAGE_GOVERNANCE_V1.turnOutcome, "turnOutcome.contractVersion");
  requiredIdV1(record.proposalId, "turnOutcome.proposalId");
  requiredIdV1(record.goalId, "turnOutcome.goalId");
  enumValue(record.outcome, TURN_DELIVERY_OUTCOMES_V1, "turnOutcome.outcome");
  requiredStringV1(record.summary, "turnOutcome.summary", 4_000);
  ids(record.completedRequirementIds, "turnOutcome.completedRequirementIds");
  ids(record.unresolvedRequirementIds, "turnOutcome.unresolvedRequirementIds");
  if (!Array.isArray(record.capabilityGaps) || record.capabilityGaps.length > 32) throw new StrictJsonErrorV1("invalid_array", "turnOutcome.capabilityGaps", "Expected a bounded array.");
  const gapIds = record.capabilityGaps.map((gap) => decodeCapabilityGapV1(gap).gapId);
  if (new Set(gapIds).size !== gapIds.length) throw new StrictJsonErrorV1("duplicate_identity", "turnOutcome.capabilityGaps", "Gap IDs must be unique.");
  if (!Array.isArray(record.finalClaims) || record.finalClaims.length > 64) throw new StrictJsonErrorV1("invalid_array", "turnOutcome.finalClaims", "Expected a bounded array.");
  const claimIds = record.finalClaims.map((claim) => decodeFinalClaimV1(claim).claimId);
  if (new Set(claimIds).size !== claimIds.length) throw new StrictJsonErrorV1("duplicate_identity", "turnOutcome.finalClaims", "Claim IDs must be unique.");
  requiredStringV1(record.actorDraftText, "turnOutcome.actorDraftText", 100_000);
  return structuredClone(record) as TurnOutcomeProposalV1;
};

export const decodeClaimGateFactsV1 = (value: unknown): ClaimGateFactsV1 => {
  const record = strictRecordV1(value, keys.facts, "claimGateFacts");
  assertVersion(record.contractVersion, LANDING_PAGE_GOVERNANCE_V1.claimGateFacts, "claimGateFacts.contractVersion");
  if (!Array.isArray(record.effectEvidence) || record.effectEvidence.length > 128) throw new StrictJsonErrorV1("invalid_array", "claimGateFacts.effectEvidence", "Expected a bounded array.");
  record.effectEvidence.forEach((item, index) => {
    const evidence = strictRecordV1(item, keys.effectEvidence, `claimGateFacts.effectEvidence[${index}]`);
    requiredIdV1(evidence.requirementId, `claimGateFacts.effectEvidence[${index}].requirementId`);
    enumValue(evidence.effect, FINAL_CLAIM_EFFECTS_V1, `claimGateFacts.effectEvidence[${index}].effect`);
    requiredIdV1(evidence.evidenceRef, `claimGateFacts.effectEvidence[${index}].evidenceRef`);
  });
  if (!Array.isArray(record.capabilityFacts) || record.capabilityFacts.length > 64) throw new StrictJsonErrorV1("invalid_array", "claimGateFacts.capabilityFacts", "Expected a bounded array.");
  const factIds = record.capabilityFacts.map((fact) => decodeHostCapabilityFactV1(fact).capabilityFactId);
  if (new Set(factIds).size !== factIds.length) throw new StrictJsonErrorV1("duplicate_identity", "claimGateFacts.capabilityFacts", "Capability facts must be unique.");
  for (const field of ["missingUserAuthorizationEvidenceRefs", "transientProviderFailureEvidenceRefs", "policyBlockEvidenceRefs", "goalPathClosureEvidenceRefs"] as const) ids(record[field], `claimGateFacts.${field}`);
  return structuredClone(record) as ClaimGateFactsV1;
};

export const assessTurnOutcomeProposalV1 = (input: Readonly<{ goal: GoalContractV1; proposal: TurnOutcomeProposalV1; facts: ClaimGateFactsV1 }>): ClaimGateAssessmentV1 => {
  const goal = decodeGoalContractV1(input.goal);
  const proposal = decodeTurnOutcomeProposalV1(input.proposal);
  const facts = decodeClaimGateFactsV1(input.facts);
  const rejected = new Set<ClaimGateRejectionCodeV1>();
  if (proposal.goalId !== goal.goalId) rejected.add("goal_identity_mismatch");

  const requirementById = new Map(goal.requirements.map((item) => [item.requirementId, item]));
  const completed = new Set(proposal.completedRequirementIds);
  const unresolved = new Set(proposal.unresolvedRequirementIds);
  for (const requirementId of [...completed, ...unresolved]) if (!requirementById.has(requirementId)) rejected.add("unknown_requirement");
  if ([...completed].some((requirementId) => unresolved.has(requirementId))) rejected.add("requirement_partition_conflict");
  if (goal.requirements.some((item) => !completed.has(item.requirementId) && !unresolved.has(item.requirementId))) rejected.add("requirement_partition_incomplete");

  const capabilityFacts = new Map(facts.capabilityFacts.map((fact) => [fact.capabilityFactId, fact]));
  for (const gap of proposal.capabilityGaps) {
    if (gap.goalId !== goal.goalId) rejected.add("capability_gap_identity_mismatch");
    if (!capabilityFacts.has(gap.capabilityFactId)) rejected.add("unknown_capability_fact");
    for (const requirementId of gap.requirementIds) {
      const requirement = requirementById.get(requirementId);
      if (!requirement) rejected.add("unknown_requirement");
      if (completed.has(requirementId)) rejected.add("capability_gap_requirement_completed");
      if (requirement && !requirement.requiredEffects.some((effect) => gap.unfulfilledEffects.includes(effect))) rejected.add("capability_gap_effect_mismatch");
    }
    if (gap.unfulfilledEffects.some((effect) => !gap.requirementIds.some((requirementId) => requirementById.get(requirementId)?.requiredEffects.includes(effect)))) rejected.add("capability_gap_effect_mismatch");
  }

  const hostEvidence = new Set(facts.effectEvidence.map((item) => `${item.requirementId}:${item.effect}:${item.evidenceRef}`));
  for (const claim of proposal.finalClaims) {
    for (const requirementId of claim.requirementIds) {
      if (!requirementById.has(requirementId)) rejected.add("unknown_requirement");
      if (claim.state === "completed" && (claim.evidenceRefs.length < 1 || claim.evidenceRefs.some((evidenceRef) => !hostEvidence.has(`${requirementId}:${claim.effect}:${evidenceRef}`)))) rejected.add("unsupported_completed_claim");
      if (claim.state === "completed" && proposal.capabilityGaps.some((gap) => gap.requirementIds.includes(requirementId) && gap.unfulfilledEffects.includes(claim.effect))) rejected.add("capability_gap_effect_claim_conflict");
    }
  }
  for (const requirementId of completed) {
    const requirement = requirementById.get(requirementId);
    if (!requirement) continue;
    for (const effect of requirement.requiredEffects) {
      if (!proposal.finalClaims.some((claim) => claim.state === "completed" && claim.effect === effect && claim.requirementIds.includes(requirementId))) rejected.add("completed_requirement_missing_claim");
    }
  }

  const hasUnresolved = unresolved.size > 0;
  if (proposal.outcome === "fulfilled" && (hasUnresolved || proposal.capabilityGaps.length > 0)) rejected.add("fulfilled_with_unresolved_work");
  if (proposal.outcome === "fulfilled_with_limitations" && (completed.size < 1 || !hasUnresolved)) rejected.add("limited_without_mixed_result");
  if (proposal.outcome === "advisory_only" && proposal.finalClaims.some((claim) => claim.state === "completed" && ["write", "save", "preview", "publish"].includes(claim.effect))) rejected.add("advisory_with_external_effect_claim");
  if (["awaiting_user", "blocked_capability", "blocked_policy", "recoverable_failure"].includes(proposal.outcome) && !hasUnresolved) rejected.add("terminal_state_without_unresolved_work");
  if (proposal.outcome === "blocked_capability") {
    if (proposal.capabilityGaps.length < 1) rejected.add("blocked_capability_without_gap");
    if ([...unresolved].some((requirementId) => {
      const requirement = requirementById.get(requirementId);
      const coveredEffects = new Set(proposal.capabilityGaps
        .filter((gap) => gap.requirementIds.includes(requirementId))
        .flatMap((gap) => gap.unfulfilledEffects));
      return !requirement || requirement.requiredEffects.some((effect) => !coveredEffects.has(effect));
    })) rejected.add("blocked_capability_uncovered_requirement");
    if (proposal.capabilityGaps.some((gap) => gap.alternativePaths.some((path) => path.disposition === "selected"))) rejected.add("blocked_capability_has_selected_path");
    if (facts.goalPathClosureEvidenceRefs.length < 1) rejected.add("blocked_capability_requires_path_closure_evidence");
  }
  if (proposal.outcome === "awaiting_user" && facts.missingUserAuthorizationEvidenceRefs.length < 1) rejected.add("awaiting_user_without_authorization_evidence");
  if (proposal.outcome === "recoverable_failure" && facts.transientProviderFailureEvidenceRefs.length < 1) rejected.add("recoverable_failure_without_provider_evidence");
  if (proposal.outcome === "blocked_policy" && facts.policyBlockEvidenceRefs.length < 1) rejected.add("blocked_policy_without_policy_evidence");

  const rejectionCodes = CLAIM_GATE_REJECTION_CODES_V1.filter((code) => rejected.has(code));
  return Object.freeze({
    contractVersion: LANDING_PAGE_GOVERNANCE_V1.claimGateAssessment,
    accepted: rejectionCodes.length === 0,
    rejectionCodes,
    actorDraftAuthorizedForPublicDelivery: false,
  });
};
