import {
  H1_RUNTIME_COMPILED_TOOL_CATALOG_V1,
  H1_RUNTIME_UX_CONTRACTS_V1,
} from "./h1-runtime-authority";
import {
  decodeCanonicalStringSetV1,
} from "./authority-fabric-codecs";
import {
  createSkillCatalogV1,
  createSkillConflictRegistrySnapshotV1,
  createSkillResolutionRequestV1,
  hashAvailableCapabilitySetV1,
  hashResolvedUxContractSetV1,
  resolveSkillResolutionPlanV1,
} from "./authority-skill-compiler";
import {
  E3_S0_SKILL_PACKAGE_V1,
  assertTrustedE3S0SkillPackageV1,
  loadE3S0SkillPackageV1,
} from "./e3-s0-skill-package";
import {
  E3_S0_SKILL_PROFILE_V1,
  type E3S0SkillSelectionSourceV1,
  assertE3S0SkillProfileCandidateV1,
} from "./e3-s0-skill-profile";
import {
  StrictJsonErrorV1,
  canonicalJsonV1,
  hashCanonicalJsonV1,
  hashUtf8V1,
  requiredHashV1,
  requiredIdV1,
  requiredTimestampV1,
} from "./strict-json";

export const E3_S0_SKILL_AUTHORITY_COMPILER_V1 = Object.freeze({
  contractVersion: "formal-r3-e3-s0-skill-authority-compiler-v1",
  phase: "E3-A1",
  status: "resolution_candidate_not_activated",
  claimCeiling: E3_S0_SKILL_PROFILE_V1.claimCeiling,
  frozenSkillCatalogHash:
    "34f3a6939b12de0942abeec2909ae735da43e94b4f0d33073365a83c0b8dc789",
  frozenConflictRegistrySnapshotHash:
    "00bf68921d9f625fc71f31c0b0df7a0f6961debfdca2bb4003d3037068b9bc04",
  implementationHash: hashCanonicalJsonV1({
    version: "formal-r3-e3-s0-skill-authority-compiler-v1",
    behavior:
      "trusted_repo_package_exact_profile_h1_read_catalog_resolution_only_no_activation",
    activeClosureCount: 1,
    unavailableClosureCount: 0,
    canvasWrite: false,
  }),
} as const);

export const E3_S0_LOADED_SKILL_PACKAGE_V1 = loadE3S0SkillPackageV1();
assertTrustedE3S0SkillPackageV1(E3_S0_LOADED_SKILL_PACKAGE_V1);

export const E3_S0_SKILL_CATALOG_V1 = createSkillCatalogV1([
  E3_S0_LOADED_SKILL_PACKAGE_V1.packageDefinition,
]);

export const E3_S0_SKILL_CONFLICT_REGISTRY_V1 =
  createSkillConflictRegistrySnapshotV1([]);

if (
  E3_S0_SKILL_CATALOG_V1.catalogHash !==
    E3_S0_SKILL_AUTHORITY_COMPILER_V1.frozenSkillCatalogHash ||
  E3_S0_SKILL_CONFLICT_REGISTRY_V1.snapshotHash !==
    E3_S0_SKILL_AUTHORITY_COMPILER_V1.frozenConflictRegistrySnapshotHash
) {
  throw new StrictJsonErrorV1(
    "e3_s0_skill_authority_catalog_drift",
    "e3S0SkillAuthority",
    "E3 S0 Skill Catalog or Conflict Registry differs from the frozen A1 candidate."
  );
}

const exactAvailableCapabilities = (value: readonly string[]) => {
  const canonical = decodeCanonicalStringSetV1(
    value,
    "e3S0SkillAuthority.availableCapabilities",
    { allowEmpty: true }
  );
  if (
    new Set(canonical).size !== canonical.length ||
    (canonicalJsonV1(canonical) !==
      canonicalJsonV1([E3_S0_SKILL_PROFILE_V1.requiredCapability]) &&
      canonicalJsonV1(canonical) !== canonicalJsonV1([]))
  ) {
    throw new StrictJsonErrorV1(
      "e3_s0_skill_capability_set_outside_profile",
      "e3S0SkillAuthority.availableCapabilities",
      "A1 accepts only the exact read capability or the explicit unavailable case."
    );
  }
  return canonical;
};

export const compileE3S0SkillResolutionCandidateV1 = (input: Readonly<{
  runId: string;
  turnId: string;
  requestId: string;
  principalHash: string;
  aclSnapshotHash: string;
  source: E3S0SkillSelectionSourceV1;
  availableCapabilities: readonly string[];
  issuedAt: string;
  profile: Readonly<{
    modelIdentity: string;
    tenantId: string;
    subjectId: string;
    sessionBindingId: string;
    workspaceId: string;
    documentId: string;
    routePath: string;
    viewport: string;
  }>;
}>) => {
  const profile = assertE3S0SkillProfileCandidateV1(
    E3_S0_LOADED_SKILL_PACKAGE_V1,
    { ...input.profile, source: input.source }
  );
  const runId = requiredIdV1(input.runId, "e3S0SkillAuthority.runId");
  const turnId = requiredIdV1(input.turnId, "e3S0SkillAuthority.turnId");
  const requestId = requiredIdV1(
    input.requestId,
    "e3S0SkillAuthority.requestId"
  );
  const principalHash = requiredHashV1(
    input.principalHash,
    "e3S0SkillAuthority.principalHash"
  );
  const aclSnapshotHash = requiredHashV1(
    input.aclSnapshotHash,
    "e3S0SkillAuthority.aclSnapshotHash"
  );
  const issuedAt = requiredTimestampV1(
    input.issuedAt,
    "e3S0SkillAuthority.issuedAt"
  );
  const availableCapabilities = exactAvailableCapabilities(
    input.availableCapabilities
  );
  const kernelPrincipalBindingRef = `principal-${principalHash.slice(0, 24)}`;
  const request = createSkillResolutionRequestV1({
    runId,
    requestId,
    kernelPrincipalBindingRef,
    requestedSkills: [
      {
        source: input.source,
        skillId: E3_S0_SKILL_PACKAGE_V1.skillId,
        exactVersion: E3_S0_SKILL_PACKAGE_V1.skillVersion,
        packageHash: E3_S0_LOADED_SKILL_PACKAGE_V1.packageHash,
      },
    ],
    toolCatalogHash: H1_RUNTIME_COMPILED_TOOL_CATALOG_V1.catalogHash,
    skillCatalogHash: E3_S0_SKILL_CATALOG_V1.catalogHash,
    uxContractFingerprint: hashResolvedUxContractSetV1(
      H1_RUNTIME_UX_CONTRACTS_V1
    ),
    capabilitySnapshotHash: hashAvailableCapabilitySetV1(
      availableCapabilities
    ),
    aclSnapshotHash,
    conflictRegistrySnapshotHash:
      E3_S0_SKILL_CONFLICT_REGISTRY_V1.snapshotHash,
    requestedAt: issuedAt,
  });
  const resolutionPlan = resolveSkillResolutionPlanV1({
    request,
    skillCatalog: E3_S0_SKILL_CATALOG_V1,
    toolCatalog: H1_RUNTIME_COMPILED_TOOL_CATALOG_V1,
    uxContracts: H1_RUNTIME_UX_CONTRACTS_V1,
    availableCapabilities,
    conflictRegistry: E3_S0_SKILL_CONFLICT_REGISTRY_V1,
    turnId,
    attemptId: `attempt-${hashUtf8V1(`${runId}\u0000${requestId}`).slice(0, 24)}`,
    createdAt: issuedAt,
  });
  const available = availableCapabilities.length === 1;
  if (available) {
    const closure = resolutionPlan.orderedClosures[0];
    const reservation = resolutionPlan.closureBudgetReservations[0];
    if (
      resolutionPlan.orderedClosures.length !== 1 ||
      resolutionPlan.unavailable.length !== 0 ||
      resolutionPlan.closureBudgetReservations.length !== 1 ||
      closure?.packageHash !== E3_S0_LOADED_SKILL_PACKAGE_V1.packageHash ||
      closure.skillId !== E3_S0_SKILL_PACKAGE_V1.skillId ||
      closure.tools.length !== 1 ||
      closure.tools[0]?.toolId !== profile.toolCatalog.requiredToolId ||
      closure.tools[0]?.toolVersion !== profile.toolCatalog.requiredToolVersion ||
      closure.tools[0]?.requiredEffect !== profile.toolCatalog.allowedEffect ||
      closure.tools[0]?.admission !== "required" ||
      reservation?.maxToolCalls !== profile.budgets.maxToolCalls ||
      reservation?.maxContextBytes !== profile.budgets.maxContextBytes ||
      reservation?.maxWallTimeMs !== profile.budgets.maxWallTimeMs
    ) {
      throw new StrictJsonErrorV1(
        "e3_s0_skill_active_resolution_invalid",
        "e3S0SkillAuthority.resolutionPlan",
        "Active A1 resolution differs from the exact single read Tool closure."
      );
    }
  } else {
    const unavailable = resolutionPlan.unavailable[0];
    if (
      resolutionPlan.orderedClosures.length !== 0 ||
      resolutionPlan.closureBudgetReservations.length !== 0 ||
      resolutionPlan.unavailable.length !== 1 ||
      unavailable?.kind !== "skill_unavailable" ||
      unavailable.requestedId !== E3_S0_SKILL_PACKAGE_V1.skillId ||
      unavailable.reasonCode !== "skill_capability_unavailable" ||
      canonicalJsonV1(unavailable.missingCapabilities) !==
        canonicalJsonV1([profile.requiredCapability])
    ) {
      throw new StrictJsonErrorV1(
        "e3_s0_skill_unavailable_resolution_invalid",
        "e3S0SkillAuthority.resolutionPlan",
        "Unavailable A1 resolution does not preserve the exact typed missing capability fact."
      );
    }
  }
  return Object.freeze({
    contractVersion: E3_S0_SKILL_AUTHORITY_COMPILER_V1.contractVersion,
    status: available ? "resolved_not_activated" : "skill_unavailable",
    claimCeiling: E3_S0_SKILL_AUTHORITY_COMPILER_V1.claimCeiling,
    compilerImplementationHash:
      E3_S0_SKILL_AUTHORITY_COMPILER_V1.implementationHash,
    profileHash: E3_S0_SKILL_PROFILE_V1.frozenProfileHash,
    packageSourceHash: E3_S0_LOADED_SKILL_PACKAGE_V1.sourceHash,
    request,
    resolutionPlan,
  });
};
