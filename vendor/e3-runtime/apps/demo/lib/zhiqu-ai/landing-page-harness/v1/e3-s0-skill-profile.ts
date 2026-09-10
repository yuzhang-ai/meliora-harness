import { H1_RUNTIME_COMPILED_TOOL_CATALOG_V1 } from "./h1-runtime-authority";
import {
  E3_S0_SKILL_PACKAGE_V1,
  type LoadedE3S0SkillPackageV1,
  assertTrustedE3S0SkillPackageV1,
} from "./e3-s0-skill-package";
import {
  StrictJsonErrorV1,
  hashCanonicalJsonV1,
  requiredIdV1,
  requiredModelIdentityV1,
  requiredStringV1,
} from "./strict-json";

const profileMaterial = Object.freeze({
  contractVersion: "formal-r3-e3-s0-read-only-skill-profile-v1",
  phase: "E3-A1",
  status: "contract_candidate_not_runtime_installed",
  environment: "local_isolated_editor",
  claimCeiling: "declarative_skill_runtime_contract_candidate",
  modelIdentity: "minimax:MiniMax-M3",
  principal: Object.freeze({
    tenantId: "tenant-e3-local-skill",
    subjectId: "subject-e3-local-skill",
    sessionBindingId: "session-binding-e3-local-skill",
  }),
  target: Object.freeze({
    workspaceId: "landing-page-workspace",
    documentId: "path--atomic-acceptance",
    routePath: "/atomic-acceptance",
    viewport: "desktop",
  }),
  skill: Object.freeze({
    packageId: E3_S0_SKILL_PACKAGE_V1.packageId,
    packageVersion: E3_S0_SKILL_PACKAGE_V1.packageVersion,
    packageHash: E3_S0_SKILL_PACKAGE_V1.frozenPackageHash,
    skillId: E3_S0_SKILL_PACKAGE_V1.skillId,
    skillVersion: E3_S0_SKILL_PACKAGE_V1.skillVersion,
    mode: "prompt_recipe",
    allowedSources: ["actor_selected", "user_explicit"] as const,
  }),
  toolCatalog: Object.freeze({
    catalogProfileId: "h1-restricted-read-v1",
    catalogHash: H1_RUNTIME_COMPILED_TOOL_CATALOG_V1.catalogHash,
    requiredToolId: "canvas_inspect",
    requiredToolVersion: "h1-effective-facts-inspect-v1",
    allowedEffect: "private_read",
  }),
  requiredCapability: "canvas.read.effective-facts.h1",
  budgets: Object.freeze({
    maxSkillRequestsPerRun: 1,
    maxResolvedClosures: 1,
    maxToolCalls: 1,
    maxNestedSkillDepth: 0,
    maxContextBytes: 32_768,
    maxWallTimeMs: 20_000,
  }),
  runtimeInstalled: false,
  explicitHolds: Object.freeze([
    "all_or_nothing_batch",
    "canvas_write",
    "dynamic_external_skill_installation",
    "e2_opacity_in_skill_closure",
    "e4_page_build",
    "filesystem_network_shell_eval_secret",
    "mcp",
    "production_publish_deploy",
    "typed_workflow",
  ]),
});

export const E3_S0_SKILL_PROFILE_V1 = Object.freeze({
  ...profileMaterial,
  frozenProfileHash:
    "8ff509312c356f63441776e7634c83aacc84f37b5a49d3458dfdb55399941f0a",
});

export type E3S0SkillSelectionSourceV1 =
  (typeof E3_S0_SKILL_PROFILE_V1.skill.allowedSources)[number];

export const assertE3S0SkillProfileCandidateV1 = (
  loadedPackage: LoadedE3S0SkillPackageV1,
  input: Readonly<{
    modelIdentity: string;
    tenantId: string;
    subjectId: string;
    sessionBindingId: string;
    workspaceId: string;
    documentId: string;
    routePath: string;
    viewport: string;
    source: E3S0SkillSelectionSourceV1;
  }>
) => {
  assertTrustedE3S0SkillPackageV1(loadedPackage);
  if (
    hashCanonicalJsonV1(profileMaterial) !==
      E3_S0_SKILL_PROFILE_V1.frozenProfileHash ||
    loadedPackage.packageHash !== E3_S0_SKILL_PROFILE_V1.skill.packageHash ||
    H1_RUNTIME_COMPILED_TOOL_CATALOG_V1.catalogHash !==
      E3_S0_SKILL_PROFILE_V1.toolCatalog.catalogHash
  ) {
    throw new StrictJsonErrorV1(
      "e3_s0_skill_profile_drift",
      "e3S0SkillProfile",
      "E3 S0 Skill profile differs from its exact frozen package or Tool Catalog."
    );
  }
  const actual = {
    modelIdentity: requiredModelIdentityV1(
      input.modelIdentity,
      "e3S0SkillProfile.modelIdentity"
    ),
    tenantId: requiredIdV1(input.tenantId, "e3S0SkillProfile.tenantId"),
    subjectId: requiredIdV1(input.subjectId, "e3S0SkillProfile.subjectId"),
    sessionBindingId: requiredIdV1(
      input.sessionBindingId,
      "e3S0SkillProfile.sessionBindingId"
    ),
    workspaceId: requiredIdV1(
      input.workspaceId,
      "e3S0SkillProfile.workspaceId"
    ),
    documentId: requiredIdV1(
      input.documentId,
      "e3S0SkillProfile.documentId"
    ),
    routePath: requiredStringV1(
      input.routePath,
      "e3S0SkillProfile.routePath",
      160
    ),
    viewport: requiredStringV1(
      input.viewport,
      "e3S0SkillProfile.viewport",
      32
    ),
    source: input.source,
  };
  const expected = {
    modelIdentity: E3_S0_SKILL_PROFILE_V1.modelIdentity,
    ...E3_S0_SKILL_PROFILE_V1.principal,
    ...E3_S0_SKILL_PROFILE_V1.target,
    source: input.source,
  };
  if (
    !E3_S0_SKILL_PROFILE_V1.skill.allowedSources.includes(input.source) ||
    hashCanonicalJsonV1(actual) !== hashCanonicalJsonV1(expected)
  ) {
    throw new StrictJsonErrorV1(
      "e3_s0_skill_profile_authority_mismatch",
      "e3S0SkillProfile",
      "E3 S0 Skill request is outside the exact local read-only profile."
    );
  }
  return E3_S0_SKILL_PROFILE_V1;
};
