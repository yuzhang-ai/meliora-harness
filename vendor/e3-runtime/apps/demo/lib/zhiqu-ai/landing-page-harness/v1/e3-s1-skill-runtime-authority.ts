import type {
  AuthorityToolDefinitionV1,
  PolicyIdentityV1,
  ResolvedUxContractV1,
  SkillDefinitionV1,
  TrustedExecutorFactoryEntryV1,
} from "./authority-fabric-contracts";
import {
  GENERIC_JSON_MODEL_PROJECTION_ID_V1,
  GENERIC_JSON_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1,
  GENERIC_JSON_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1,
  OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_ID_V1,
  OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_IMPLEMENTATION_HASH_V1,
  STRICT_JSON_ARGUMENT_PROJECTION_ID_V1,
  STRICT_JSON_ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1,
} from "./authority-fabric-private-projection";
import {
  createSkillCatalogV1,
  createSkillConflictRegistrySnapshotV1,
  createSkillPackageDefinitionV1,
  createSkillResolutionRequestV1,
  hashAvailableCapabilitySetV1,
  hashResolvedUxContractSetV1,
  resolveSkillResolutionPlanV1,
} from "./authority-skill-compiler";
import {
  compileAuthorityToolCatalogV1,
  createPolicyRegistrySnapshotV1,
  createTrustedExecutorBindingV1,
  decodeAuthorityToolDefinitionV1,
} from "./authority-tool-compiler";
import {
  ATOMIC_AI_SAAS_SECTION_PROFILE_HASH_V1,
} from "../../../../config/blocks/editor-kernel/atomic-ai-saas-section-profile";
import {
  canonicalJsonV1,
  hashCanonicalJsonV1,
  hashUtf8V1,
  requiredHashV1,
  requiredIdV1,
  requiredTimestampV1,
} from "./strict-json";

export const E3_S1_SKILL_RUNTIME_AUTHORITY_V1 = Object.freeze({
  contractVersion: "formal-r3-e3-s1-skill-runtime-authority-v1",
  capabilityId: "canvas.write.fixed-saas.e3-s1",
  skillId: "e3-s1-fixed-saas-page-write",
  skillVersion: "1.0.0",
  packageId: "formal-e3-s1-fixed-saas-page-write",
  packageVersion: "1.0.0",
  uxContractId: "e3-s1-fixed-saas-host",
  uxContractVersion: "1.0.0",
  workflowDefinitionRef: "e3-s1-fixed-saas-atomic-workflow",
  toolVersion: "e3-s1-v1",
  toolIds: [
    "canvas_build_saas_page_batch",
    "canvas_insert_saas_cta",
    "canvas_insert_saas_header",
    "canvas_insert_saas_hero",
  ] as const,
} as const);

const policyHash = (policyId: string, semantics: string) =>
  hashCanonicalJsonV1({
    version: "formal-r3-e3-s1-tool-policy-v1",
    policyId,
    semantics,
  });

const projectorBundleHash = hashCanonicalJsonV1({
  argumentProjectionId: STRICT_JSON_ARGUMENT_PROJECTION_ID_V1,
  modelProjectionId: GENERIC_JSON_MODEL_PROJECTION_ID_V1,
  publicProjectionId: OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_ID_V1,
  argumentProjectorImplementationHash:
    STRICT_JSON_ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1,
  modelProjectorImplementationHash:
    GENERIC_JSON_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1,
  publicProjectorImplementationHash:
    OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_IMPLEMENTATION_HASH_V1,
});

const policies: readonly PolicyIdentityV1[] = [
  ["target", "e3-s1-fixed-saas-target", "exact_blank_canvas_root_fixed_sections"],
  ["acl", "e3-s1-fixed-saas-acl", "host_actor_session_exact_write_acl"],
  ["idempotency", "e3-s1-exact-idempotency", "same_key_same_lease_request_and_receipt"],
  ["retry", "e3-s1-no-unknown-retry", "unknown_outcome_reconcile_only"],
  ["reconciliation", "e3-s1-saved-readback-reconciliation", "unknown_to_completed_only_after_exact_saved_readback"],
  ["receipt", "e3-s1-atomic-commit-receipt", "canonical_host_atomic_transaction_receipt"],
  ["readback", "e3-s1-saved-document-readback", "exact_pointer_and_full_document_fingerprint"],
  ["claim", "canvas-write-observed", "durable_write_claim_requires_verified_receipt"],
  ["projection", STRICT_JSON_ARGUMENT_PROJECTION_ID_V1, "registered_strict_json_argument_projection"],
  ["projection", GENERIC_JSON_MODEL_PROJECTION_ID_V1, "registered_generic_model_projection"],
  ["projection", OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_ID_V1, "registered_opaque_public_projection"],
  ["prompt", "e3-s1-fixed-saas-usage", "only_fixed_header_hero_cta_profile"],
  ["prompt", "e3-s1-fixed-saas-unavailable", "typed_unavailable_without_fallback"],
].map(([policyKind, policyId, semantics]) => ({
  policyKind: policyKind as PolicyIdentityV1["policyKind"],
  policyId,
  policyVersion: "1.0.0",
  implementationHash:
    policyKind === "projection" && policyId === STRICT_JSON_ARGUMENT_PROJECTION_ID_V1
      ? STRICT_JSON_ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1
      : policyKind === "projection" && policyId === GENERIC_JSON_MODEL_PROJECTION_ID_V1
        ? GENERIC_JSON_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1
        : policyKind === "projection" && policyId === OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_ID_V1
          ? OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_IMPLEMENTATION_HASH_V1
          : policyHash(policyId, semantics),
}));

export const E3_S1_POLICY_REGISTRY_V1 =
  createPolicyRegistrySnapshotV1(policies);

const resultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["contentRef", "observationJson", "resultHash"],
  properties: {
    contentRef: { type: "string", minLength: 1, maxLength: 240 },
    observationJson: { type: "string", minLength: 2, maxLength: 65536 },
    resultHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
  },
} as const;

const observationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["observationJson", "observationHash", "observationRef"],
  properties: {
    observationJson: { type: "string", minLength: 2, maxLength: 32768 },
    observationHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    observationRef: { type: "string", minLength: 1, maxLength: 240 },
  },
} as const;

const publicEventSchema = {
  type: "object",
  additionalProperties: false,
  required: ["detailRef", "receiptId", "status"],
  properties: {
    detailRef: { type: "string", minLength: 1, maxLength: 240 },
    receiptId: { type: "string", minLength: 1, maxLength: 160 },
    status: { type: "string", enum: ["completed", "denied", "failed", "started", "unavailable"] },
  },
} as const;

const createToolDefinition = (toolId: string): AuthorityToolDefinitionV1 =>
  decodeAuthorityToolDefinitionV1({
    contractVersion: "authority-tool-definition-v1",
    toolId,
    toolVersion: E3_S1_SKILL_RUNTIME_AUTHORITY_V1.toolVersion,
    family: "canvas-fixed-saas-write",
    description: `Perform only the Host-owned fixed SaaS atomic write ${toolId} under an exact write lease and CAS-bound document revision.`,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["idempotencyKey"],
      properties: {
        idempotencyKey: { type: "string", minLength: 1, maxLength: 160 },
      },
    },
    privateResultSchema: resultSchema,
    modelObservationSchema: observationSchema,
    publicEventSchema,
    effect: "durable_write",
    dataClasses: ["authored_content", "canvas_geometry", "canvas_structure", "private_provenance"],
    requiredCapabilities: [E3_S1_SKILL_RUNTIME_AUTHORITY_V1.capabilityId],
    authority: {
      grantKind: "write_lease",
      revisionPolicy: "cas",
      targetPolicyId: "e3-s1-fixed-saas-target",
      aclPolicyId: "e3-s1-fixed-saas-acl",
    },
    budgets: {
      maxCallsPerRun: 4,
      maxInputBytes: 65536,
      maxPrivateResultBytes: 65536,
      maxModelContextBytes: 32768,
      maxPublicEventBytes: 2048,
      maxWallTimeMs: 20000,
    },
    executionPolicy: {
      requiredExecutorBrand: "e3-s1-fixed-saas-atomic-executor",
      idempotencyClass: "e3-s1-exact-idempotency",
      retryClass: "e3-s1-no-unknown-retry",
      reconciliationClass: "e3-s1-saved-readback-reconciliation",
    },
    evidencePolicy: {
      receiptType: "e3-s1-atomic-commit-receipt",
      readbackPolicy: "e3-s1-saved-document-readback",
      supportedClaimEffects: ["canvas-write-observed"],
    },
    projectionPolicy: {
      argumentProjectionId: STRICT_JSON_ARGUMENT_PROJECTION_ID_V1,
      modelProjectionId: GENERIC_JSON_MODEL_PROJECTION_ID_V1,
      publicProjectionId: OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_ID_V1,
      argumentProjectorImplementationHash: STRICT_JSON_ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1,
      modelProjectorImplementationHash: GENERIC_JSON_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1,
      publicProjectorImplementationHash: OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_IMPLEMENTATION_HASH_V1,
      projectorBundleHash,
      publicContractVersion: "1.0.0",
    },
    promptPolicy: {
      usageRuleId: "e3-s1-fixed-saas-usage",
      unavailableRuleId: "e3-s1-fixed-saas-unavailable",
    },
  });

export const E3_S1_TOOL_DEFINITIONS_V1 =
  E3_S1_SKILL_RUNTIME_AUTHORITY_V1.toolIds.map(createToolDefinition);

const trustedFactories: readonly TrustedExecutorFactoryEntryV1[] =
  E3_S1_TOOL_DEFINITIONS_V1.map((definition) => ({
    toolId: definition.toolId,
    toolVersion: definition.toolVersion,
    executorBrand: definition.executionPolicy.requiredExecutorBrand,
    executorBuildRef: "repo:e3-s1-fixed-saas-atomic-executor-v1",
    executorArtifactHash: hashCanonicalJsonV1({
      implementation: "E3S1AtomicCommandExecutorV1",
      toolId: definition.toolId,
      profileHash: ATOMIC_AI_SAAS_SECTION_PROFILE_HASH_V1,
    }),
    adapterId: "generic-json-receipt-adapter",
    adapterVersion: "1.0.0",
    adapterArtifactHash: GENERIC_JSON_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1,
    bridgeContractHash: hashCanonicalJsonV1({
      implementation: "formal-r3-e3-s1-browser-host-bridge-v2",
      boundary: "server_activation_lease_unknown_saved_readback_reconciliation",
    }),
  }));

const trustedFactorySnapshotHash = hashCanonicalJsonV1({
  contractVersion: "formal-r3-e3-s1-trusted-factory-snapshot-v1",
  entries: trustedFactories,
});

export const E3_S1_TRUSTED_EXECUTOR_BINDINGS_V1 =
  E3_S1_TOOL_DEFINITIONS_V1.map((definition, index) =>
    createTrustedExecutorBindingV1({
      definition,
      policyRegistry: E3_S1_POLICY_REGISTRY_V1,
      factoryEntry: trustedFactories[index]!,
      trustedFactorySnapshotHash,
    })
  );

export const E3_S1_COMPILED_TOOL_CATALOG_V1 =
  compileAuthorityToolCatalogV1(
    E3_S1_POLICY_REGISTRY_V1,
    E3_S1_TOOL_DEFINITIONS_V1.map((definition, index) => ({
      enabled: true,
      definition,
      executorBinding: E3_S1_TRUSTED_EXECUTOR_BINDINGS_V1[index]!,
    }))
  );

export const E3_S1_UX_CONTRACTS_V1: readonly ResolvedUxContractV1[] = [{
  contractId: E3_S1_SKILL_RUNTIME_AUTHORITY_V1.uxContractId,
  contractVersion: E3_S1_SKILL_RUNTIME_AUTHORITY_V1.uxContractVersion,
  contractHash: hashCanonicalJsonV1({
    profileHash: ATOMIC_AI_SAAS_SECTION_PROFILE_HASH_V1,
  }),
}];

const prompt = [
  "This Skill grants only the fixed E3-S1 header, hero and CTA atomic write profile.",
  "Every write requires the exact durable activation, Host-issued lease and base revision CAS.",
  "An unknown commit outcome is never replayed and can complete only by exact saved-document readback reconciliation.",
].join("\n");

const skillDefinition: SkillDefinitionV1 = {
  contractVersion: "formal-r3-skill-definition-v1",
  skillId: E3_S1_SKILL_RUNTIME_AUTHORITY_V1.skillId,
  skillVersion: E3_S1_SKILL_RUNTIME_AUTHORITY_V1.skillVersion,
  title: "E3-S1 Fixed SaaS Atomic Write",
  purpose: "Write only the Host-owned fixed SaaS header, hero and CTA profile through one atomic CAS transaction.",
  mode: "prompt_recipe",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["goal"],
    properties: { goal: { type: "string", minLength: 1, maxLength: 8192 } },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["receiptHash"],
    properties: { receiptHash: { type: "string", pattern: "^[a-f0-9]{64}$" } },
  },
  requiredTools: E3_S1_SKILL_RUNTIME_AUTHORITY_V1.toolIds.map((toolId) => ({
    toolId,
    versionRange: E3_S1_SKILL_RUNTIME_AUTHORITY_V1.toolVersion,
    requiredEffect: "durable_write" as const,
  })),
  optionalTools: [],
  requiredUxContracts: [{
    contractId: E3_S1_SKILL_RUNTIME_AUTHORITY_V1.uxContractId,
    versionRange: E3_S1_SKILL_RUNTIME_AUTHORITY_V1.uxContractVersion,
  }],
  requiredCapabilities: [E3_S1_SKILL_RUNTIME_AUTHORITY_V1.capabilityId],
  promptFragments: [{ resourceId: "e3-s1-fixed-saas-write-contract", contentHash: hashUtf8V1(prompt) }],
  workflowDefinitionRef: null,
  dependencies: [],
  budgets: { maxToolCalls: 4, maxNestedSkillDepth: 0, maxContextBytes: 32768, maxWallTimeMs: 20000 },
  evidencePolicy: {
    requiredReceiptEffects: ["canvas-write-observed"],
    completionRubricRef: "e3-s1-fixed-saas-write-rubric",
    claimPolicyId: "canvas-write-observed",
  },
  unavailablePolicyId: "e3-s1-fixed-saas-unavailable",
};

export const E3_S1_SKILL_PACKAGE_V1 = createSkillPackageDefinitionV1({
  packageId: E3_S1_SKILL_RUNTIME_AUTHORITY_V1.packageId,
  packageVersion: E3_S1_SKILL_RUNTIME_AUTHORITY_V1.packageVersion,
  definition: skillDefinition,
  promptResourceHashes: [hashUtf8V1(prompt)],
  rubricHash: hashCanonicalJsonV1({
    rubric: "e3-s1-fixed-saas-write-rubric",
    profileHash: ATOMIC_AI_SAAS_SECTION_PROFILE_HASH_V1,
    requirements: ["durable_write_closure", "exact_write_lease", "atomic_cas", "saved_readback"],
  }),
});

export const E3_S1_SKILL_CATALOG_V1 = createSkillCatalogV1([
  E3_S1_SKILL_PACKAGE_V1,
]);
export const E3_S1_CONFLICT_REGISTRY_V1 = createSkillConflictRegistrySnapshotV1([]);

export const compileE3S1SkillResolutionV1 = (input: Readonly<{
  runId: string;
  turnId: string;
  requestId: string;
  principalHash: string;
  aclSnapshotHash: string;
  issuedAt: string;
}>) => {
  const runId = requiredIdV1(input.runId, "e3S1Authority.runId");
  const turnId = requiredIdV1(input.turnId, "e3S1Authority.turnId");
  const requestId = requiredIdV1(input.requestId, "e3S1Authority.requestId");
  const principalHash = requiredHashV1(input.principalHash, "e3S1Authority.principalHash");
  const aclSnapshotHash = requiredHashV1(input.aclSnapshotHash, "e3S1Authority.aclSnapshotHash");
  const issuedAt = requiredTimestampV1(input.issuedAt, "e3S1Authority.issuedAt");
  const capabilities = [E3_S1_SKILL_RUNTIME_AUTHORITY_V1.capabilityId];
  const request = createSkillResolutionRequestV1({
    runId,
    requestId,
    kernelPrincipalBindingRef: `principal-${principalHash.slice(0, 24)}`,
    requestedSkills: [{
      source: "user_explicit",
      skillId: E3_S1_SKILL_PACKAGE_V1.definition.skillId,
      exactVersion: E3_S1_SKILL_PACKAGE_V1.definition.skillVersion,
      packageHash: E3_S1_SKILL_PACKAGE_V1.packageHash,
    }],
    toolCatalogHash: E3_S1_COMPILED_TOOL_CATALOG_V1.catalogHash,
    skillCatalogHash: E3_S1_SKILL_CATALOG_V1.catalogHash,
    uxContractFingerprint: hashResolvedUxContractSetV1(E3_S1_UX_CONTRACTS_V1),
    capabilitySnapshotHash: hashAvailableCapabilitySetV1(capabilities),
    aclSnapshotHash,
    conflictRegistrySnapshotHash: E3_S1_CONFLICT_REGISTRY_V1.snapshotHash,
    requestedAt: issuedAt,
  });
  const resolutionPlan = resolveSkillResolutionPlanV1({
    request,
    skillCatalog: E3_S1_SKILL_CATALOG_V1,
    toolCatalog: E3_S1_COMPILED_TOOL_CATALOG_V1,
    uxContracts: E3_S1_UX_CONTRACTS_V1,
    availableCapabilities: capabilities,
    conflictRegistry: E3_S1_CONFLICT_REGISTRY_V1,
    turnId,
    attemptId: `attempt-${hashUtf8V1(`${runId}\u0000${requestId}`).slice(0, 24)}`,
    createdAt: issuedAt,
  });
  const closure = resolutionPlan.orderedClosures[0];
  if (
    resolutionPlan.orderedClosures.length !== 1 ||
    resolutionPlan.unavailable.length !== 0 ||
    !closure ||
    closure.packageHash !== E3_S1_SKILL_PACKAGE_V1.packageHash ||
    closure.tools.length !== E3_S1_SKILL_RUNTIME_AUTHORITY_V1.toolIds.length ||
    closure.tools.some((tool) => tool.requiredEffect !== "durable_write")
  ) throw new Error(`e3_s1_write_skill_resolution_invalid:${canonicalJsonV1({
    closureCount: resolutionPlan.orderedClosures.length,
    unavailable: resolutionPlan.unavailable,
    packageHash: closure?.packageHash ?? null,
    expectedPackageHash: E3_S1_SKILL_PACKAGE_V1.packageHash,
    tools: closure?.tools ?? [],
  })}`);
  return Object.freeze({ request, resolutionPlan, closure });
};

export const E3_S1_RESOLVED_CLOSURE_HASH_V1 = compileE3S1SkillResolutionV1({
  runId: "run-e3-s1-frozen-closure",
  turnId: "turn-e3-s1-frozen-closure",
  requestId: "request-e3-s1-frozen-closure",
  principalHash: hashCanonicalJsonV1({ principal: "frozen" }),
  aclSnapshotHash: hashCanonicalJsonV1({ acl: "frozen" }),
  issuedAt: "2026-09-06T00:00:00.000Z",
}).closure.closureHash;

export const describeE3S1AuthorityClosureV1 = () => canonicalJsonV1({
  capability: E3_S1_SKILL_RUNTIME_AUTHORITY_V1.capabilityId,
  toolCatalogHash: E3_S1_COMPILED_TOOL_CATALOG_V1.catalogHash,
  skillCatalogHash: E3_S1_SKILL_CATALOG_V1.catalogHash,
  closureHash: E3_S1_RESOLVED_CLOSURE_HASH_V1,
  profileHash: ATOMIC_AI_SAAS_SECTION_PROFILE_HASH_V1,
});
