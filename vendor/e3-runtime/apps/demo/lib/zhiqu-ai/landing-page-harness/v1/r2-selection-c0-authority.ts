import type {
  AuthorityToolDefinitionV1,
  DeterministicJsonSchemaV1,
  PolicyIdentityV1,
  TrustedExecutorFactoryEntryV1,
} from "./authority-fabric-contracts";
import {
  OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_ID_V1,
  OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_IMPLEMENTATION_HASH_V1,
  R2_SELECTION_C0_MODEL_PROJECTION_ID_V1,
  R2_SELECTION_C0_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1,
  R2_SELECTION_C0_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1,
  STRICT_JSON_ARGUMENT_PROJECTION_ID_V1,
  STRICT_JSON_ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1,
} from "./authority-fabric-private-projection";
import {
  compileAuthorityToolCatalogV1,
  createPolicyRegistrySnapshotV1,
  createTrustedExecutorBindingV1,
  decodeAuthorityToolDefinitionV1,
} from "./authority-tool-compiler";
import {
  GENERAL_RUNTIME_POLICY_REGISTRY_V1,
  GENERAL_RUNTIME_TOOL_DEFINITIONS_V1,
  GENERAL_RUNTIME_TRUSTED_FACTORY_ENTRIES_V1,
} from "./general-runtime-authority";
import {
  R2_SELECTION_C0_TARGET_CONTRACT_HASH_V1,
  R2_SELECTION_C0_V1,
} from "./r2-selection-c0-contract";
import { hashCanonicalJsonV1 } from "./strict-json";
import type { ToolDescriptorV1 } from "./tools";

/**
 * R2-A is compile-only. This identity is intentionally not exported by the
 * production Catalog Registry and cannot admit or dispatch a Run.
 */
export const R2_SELECTION_C0_AUTHORITY_V1 = Object.freeze({
  catalogProfileId: R2_SELECTION_C0_V1.profileId,
  catalogEpoch: R2_SELECTION_C0_V1.catalogEpoch,
  capabilityId: "canvas.read.selection.c0.atomic-acceptance",
  installationStatus: "candidate_not_production_admitted",
  activatedSkillIds: Object.freeze([] as string[]),
  skillResolution: "inactive_seam" as const,
} as const);

const policyHash = (policyId: string, semantics: string) =>
  hashCanonicalJsonV1({
    version: "formal-r3-r2-selection-c0-policy-v1",
    policyId,
    semantics,
  });

const r2Policies: readonly PolicyIdentityV1[] = [
  {
    policyKind: "receipt",
    policyId: "r2-selection-c0-receipt",
    policyVersion: "1.0.0",
    implementationHash:
      R2_SELECTION_C0_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1,
  },
  {
    policyKind: "acl",
    policyId: "r2-selection-c0-acl",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "r2-selection-c0-acl",
      `host_principal_exact_workspace_session_document_mount_pointer_device_turn_run_reauthorize_each_read:${R2_SELECTION_C0_TARGET_CONTRACT_HASH_V1}`
    ),
  },
  {
    policyKind: "claim",
    policyId: "r2-selection-c0-read-observed",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "r2-selection-c0-read-observed",
      "actual_same_run_selection_receipt_required"
    ),
  },
  {
    policyKind: "idempotency",
    policyId: "r2-selection-c0-same-call-same-result",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "r2-selection-c0-same-call-same-result",
      "run_call_query_binding_arguments_hash_receipt_replay"
    ),
  },
  {
    policyKind: "projection",
    policyId: R2_SELECTION_C0_MODEL_PROJECTION_ID_V1,
    policyVersion: "1.0.0",
    implementationHash: R2_SELECTION_C0_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1,
  },
  {
    policyKind: "prompt",
    policyId: "r2-selection-c0-unavailable-rule",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "r2-selection-c0-unavailable-rule",
      "truthful_typed_unavailable_no_h1_c6a_dom_or_mutation_fallback"
    ),
  },
  {
    policyKind: "prompt",
    policyId: "r2-selection-c0-usage-rule",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "r2-selection-c0-usage-rule",
      "one_turn_bound_atomic_acceptance_singular_selection_read"
    ),
  },
  {
    policyKind: "readback",
    policyId: "r2-selection-c0-receipt-only-readback",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "r2-selection-c0-receipt-only-readback",
      "validated_full_c0_closure_to_allowlisted_selection_result_then_receipt"
    ),
  },
  {
    policyKind: "reconciliation",
    policyId: "r2-selection-c0-no-reconciliation",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "r2-selection-c0-no-reconciliation",
      "read_only_no_canvas_store_history_or_command_reconciliation"
    ),
  },
  {
    policyKind: "retry",
    policyId: "r2-selection-c0-no-retry",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "r2-selection-c0-no-retry",
      "typed_unavailable_or_new_turn_with_fresh_capture"
    ),
  },
  {
    policyKind: "target",
    policyId: "r2-selection-c0-exact-target",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "r2-selection-c0-exact-target",
      `atomic_acceptance_document_three_device_identity_one_device_per_run:${R2_SELECTION_C0_TARGET_CONTRACT_HASH_V1}`
    ),
  },
] as const;

export const R2_SELECTION_C0_POLICY_REGISTRY_V1 =
  createPolicyRegistrySnapshotV1([
    ...GENERAL_RUNTIME_POLICY_REGISTRY_V1.policies,
    ...r2Policies,
  ]);

const projectorBundleHash = hashCanonicalJsonV1({
  argumentProjectionId: STRICT_JSON_ARGUMENT_PROJECTION_ID_V1,
  modelProjectionId: R2_SELECTION_C0_MODEL_PROJECTION_ID_V1,
  publicProjectionId: OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_ID_V1,
  argumentProjectorImplementationHash:
    STRICT_JSON_ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1,
  modelProjectorImplementationHash:
    R2_SELECTION_C0_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1,
  publicProjectorImplementationHash:
    OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_IMPLEMENTATION_HASH_V1,
});

const genericPrivateResultSchema: DeterministicJsonSchemaV1 = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["contentRef", "selectionJson", "resultHash"],
  properties: {
    contentRef: { type: "string", minLength: 1, maxLength: 240 },
    selectionJson: { type: "string", minLength: 2, maxLength: 16384 },
    resultHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
  },
} as const);

const genericModelObservationSchema: DeterministicJsonSchemaV1 = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["selectionJson", "observationHash", "observationRef"],
  properties: {
    selectionJson: { type: "string", minLength: 2, maxLength: 8192 },
    observationHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    observationRef: { type: "string", minLength: 1, maxLength: 240 },
  },
} as const);

const opaquePublicEventSchema: DeterministicJsonSchemaV1 = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["detailRef", "receiptId", "status"],
  properties: {
    detailRef: { type: "string", minLength: 1, maxLength: 240 },
    receiptId: { type: "string", minLength: 1, maxLength: 160 },
    status: {
      type: "string",
      enum: ["completed", "denied", "failed", "started", "unavailable"],
    },
  },
} as const);

export const R2_SELECTION_C0_TOOL_DEFINITION_V1: AuthorityToolDefinitionV1 =
  decodeAuthorityToolDefinitionV1({
    contractVersion: "authority-tool-definition-v1",
    toolId: R2_SELECTION_C0_V1.toolId,
    toolVersion: R2_SELECTION_C0_V1.toolVersion,
    family: "canvas-selection-read",
    description:
      "Read at most one currently selected seven-atom node from the exact /atomic-acceptance C0 Canvas Readback captured for this Turn. The complete C0 closure is validated before the selected node is projected. This Tool has one completed call per Run, no cursor, no arbitrary-node traversal, and no Canvas write authority.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["contractVersion", "scope"],
      properties: {
        contractVersion: {
          type: "string",
          const: R2_SELECTION_C0_V1.requestVersion,
        },
        scope: { type: "string", const: "selection" },
      },
    },
    privateResultSchema: genericPrivateResultSchema,
    modelObservationSchema: genericModelObservationSchema,
    publicEventSchema: opaquePublicEventSchema,
    effect: "private_read",
    dataClasses: [
      "authorization_material",
      "canvas_geometry",
      "canvas_structure",
      "opaque_identity",
      "private_provenance",
    ],
    requiredCapabilities: [R2_SELECTION_C0_AUTHORITY_V1.capabilityId],
    authority: {
      grantKind: "capture_grant",
      revisionPolicy: "fresh",
      targetPolicyId: "r2-selection-c0-exact-target",
      aclPolicyId: "r2-selection-c0-acl",
    },
    budgets: {
      maxCallsPerRun: 1,
      maxInputBytes: 256,
      maxPrivateResultBytes: 16384,
      maxModelContextBytes: 8192,
      maxPublicEventBytes: 2048,
      maxWallTimeMs: 3000,
      maxVisitedNodes: R2_SELECTION_C0_V1.maxNodes,
    },
    executionPolicy: {
      requiredExecutorBrand: "r2-selection-c0-read-executor",
      idempotencyClass: "r2-selection-c0-same-call-same-result",
      retryClass: "r2-selection-c0-no-retry",
      reconciliationClass: "r2-selection-c0-no-reconciliation",
    },
    evidencePolicy: {
      receiptType: "r2-selection-c0-receipt",
      readbackPolicy: "r2-selection-c0-receipt-only-readback",
      supportedClaimEffects: ["r2-selection-c0-read-observed"],
    },
    projectionPolicy: {
      argumentProjectionId: STRICT_JSON_ARGUMENT_PROJECTION_ID_V1,
      modelProjectionId: R2_SELECTION_C0_MODEL_PROJECTION_ID_V1,
      publicProjectionId: OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_ID_V1,
      argumentProjectorImplementationHash:
        STRICT_JSON_ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1,
      modelProjectorImplementationHash:
        R2_SELECTION_C0_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1,
      publicProjectorImplementationHash:
        OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_IMPLEMENTATION_HASH_V1,
      projectorBundleHash,
      publicContractVersion: "1.0.0",
    },
    promptPolicy: {
      usageRuleId: "r2-selection-c0-usage-rule",
      unavailableRuleId: "r2-selection-c0-unavailable-rule",
    },
  });

export const R2_SELECTION_C0_TRUSTED_FACTORY_ENTRY_V1: TrustedExecutorFactoryEntryV1 =
  Object.freeze({
    toolId: R2_SELECTION_C0_TOOL_DEFINITION_V1.toolId,
    toolVersion: R2_SELECTION_C0_TOOL_DEFINITION_V1.toolVersion,
    executorBrand:
      R2_SELECTION_C0_TOOL_DEFINITION_V1.executionPolicy.requiredExecutorBrand,
    executorBuildRef: "repo:r2-selection-c0-closed-executor-v1",
    executorArtifactHash: hashCanonicalJsonV1({
      implementation: "R2SelectionC0ClosedExecutorV1",
      targetContractHash: R2_SELECTION_C0_TARGET_CONTRACT_HASH_V1,
      sourceContractVersion: R2_SELECTION_C0_V1.sourceContractVersion,
      sourceCommit: R2_SELECTION_C0_V1.sourceCommit,
      selection: "zero_or_one_no_truncation",
      cursor: "not_installed_next_cursor_null",
      status: "real_fail_closed_tool_executor_port_not_production_registered",
    }),
    adapterId: "r2-selection-c0-receipt-adapter",
    adapterVersion: "1.0.0",
    adapterArtifactHash:
      R2_SELECTION_C0_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1,
    bridgeContractHash: hashCanonicalJsonV1({
      implementation: "formal-r3-r2-selection-c0-authority-bridge",
      version: "1.0.0",
      boundary:
        "exact_run_query_grant_acl_pointer_device_frame_readback_hash_required_before_dispatch",
      targetContractHash: R2_SELECTION_C0_TARGET_CONTRACT_HASH_V1,
      productionInstallation: "absent_in_r2_a",
    }),
  });

export const R2_SELECTION_C0_TRUSTED_FACTORY_ENTRIES_V1 = Object.freeze([
  ...GENERAL_RUNTIME_TRUSTED_FACTORY_ENTRIES_V1,
  R2_SELECTION_C0_TRUSTED_FACTORY_ENTRY_V1,
]);

export const R2_SELECTION_C0_TRUSTED_FACTORY_SNAPSHOT_HASH_V1 =
  hashCanonicalJsonV1({
    contractVersion: "formal-r3-r2-selection-c0-trusted-factory-snapshot-v1",
    entries: R2_SELECTION_C0_TRUSTED_FACTORY_ENTRIES_V1,
  });

const definitions = [
  ...GENERAL_RUNTIME_TOOL_DEFINITIONS_V1,
  R2_SELECTION_C0_TOOL_DEFINITION_V1,
] as const;

export const R2_SELECTION_C0_EXECUTOR_BINDINGS_V1 = Object.freeze(
  definitions.map((definition, index) =>
    createTrustedExecutorBindingV1({
      definition,
      policyRegistry: R2_SELECTION_C0_POLICY_REGISTRY_V1,
      factoryEntry: R2_SELECTION_C0_TRUSTED_FACTORY_ENTRIES_V1[index]!,
      trustedFactorySnapshotHash:
        R2_SELECTION_C0_TRUSTED_FACTORY_SNAPSHOT_HASH_V1,
    })
  )
);

export const R2_SELECTION_C0_COMPILED_TOOL_CATALOG_V1 =
  compileAuthorityToolCatalogV1(
    R2_SELECTION_C0_POLICY_REGISTRY_V1,
    definitions.map((definition, index) => ({
      enabled: true,
      definition,
      executorBinding: R2_SELECTION_C0_EXECUTOR_BINDINGS_V1[index]!,
    }))
  );

const descriptorEffect = (
  definition: AuthorityToolDefinitionV1
): ToolDescriptorV1["effect"] =>
  definition.toolId === "inspect_ux_capability"
    ? "capability_read"
    : definition.effect === "presentation_state"
      ? "runtime_state"
      : "read_only";

export const R2_SELECTION_C0_TOOL_DESCRIPTORS_V1: readonly ToolDescriptorV1[] =
  Object.freeze(
    R2_SELECTION_C0_COMPILED_TOOL_CATALOG_V1.tools.map((tool) => ({
      toolId: tool.modelDescriptor.toolId,
      version: tool.modelDescriptor.toolVersion,
      description: tool.modelDescriptor.description,
      inputSchema: structuredClone(tool.modelDescriptor.inputSchema),
      effect: descriptorEffect(tool.definition),
    }))
  );
