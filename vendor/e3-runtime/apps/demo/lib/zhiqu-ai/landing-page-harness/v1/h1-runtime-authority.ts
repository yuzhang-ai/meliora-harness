import {
  UX_EFFECTIVE_FACTS_CAPABILITY_FINGERPRINT_V1,
} from "../../editor-canvas/v1/effective-facts-read-contract";
import type {
  AuthorityToolDefinitionV1,
  PolicyIdentityV1,
  ResolvedUxContractV1,
  SkillDefinitionV1,
  TrustedExecutorFactoryEntryV1,
} from "./authority-fabric-contracts";
import {
  ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1,
  GENERIC_JSON_MODEL_PROJECTION_ID_V1,
  GENERIC_JSON_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1,
  GENERIC_JSON_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1,
  H1_ARGUMENT_PROJECTION_ID_V1,
  H1_EFFECTIVE_FACTS_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1,
  H1_MODEL_PROJECTION_ID_V1,
  H1_PUBLIC_PROJECTION_ID_V1,
  MODEL_PROJECTION_IMPLEMENTATION_HASH_V1,
  OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_ID_V1,
  OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_IMPLEMENTATION_HASH_V1,
  STRICT_JSON_ARGUMENT_PROJECTION_ID_V1,
  STRICT_JSON_ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1,
} from "./authority-fabric-private-projection";
import {
  PUBLIC_PROJECTION_IMPLEMENTATION_HASH_V1,
} from "./authority-fabric-public-projection";
import {
  CandidateSkillActivationLedgerV1,
  createSkillActivationRequestV1,
} from "./authority-skill-lifecycle";
import {
  createExecutionAdmissionV1,
  createExecutionFingerprintMaterialV1,
  createPromptCompositionManifestV1,
  createRunContextManifestV1,
  renderPromptFragmentMaterialV1,
  type PromptFragmentMaterialV1,
} from "./authority-prompt-composition";
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
import { EFFECTIVE_FACTS_CANVAS_INSPECT_V1 } from "./effective-facts-canvas-inspect";
import {
  createH1RuntimeAuthorityMaterialV1,
  createH1RuntimeToolAdmissionV1,
} from "./h1-runtime-admission";
import {
  hashCanonicalJsonV1,
  hashUtf8V1,
  canonicalJsonV1,
  requiredHashV1,
  requiredIdV1,
  requiredModelIdentityV1,
  requiredStringV1,
  requiredTimestampV1,
} from "./strict-json";
import {
  SUBMIT_TURN_OUTCOME_INPUT_SCHEMA_V1,
  type ToolDescriptorV1,
} from "./tools";

export const H1_RUNTIME_AUTHORITY_V1 = Object.freeze({
  capabilityId: "canvas.read.effective-facts.h1",
  skillId: "h1-canvas-read-recipe",
  skillVersion: "1.0.0",
  packageId: "formal-h1-read-recipe",
  packageVersion: "1.0.0",
  uxContractId: "ux-effective-facts-read",
  uxContractVersion: "1.0.0",
  runtimeBuildRef: "formal-r3-h1-runtime-real-model-browser-b2",
  activationTtlMs: 60_000,
} as const);

const policyHash = (policyId: string, semantics: string) =>
  hashCanonicalJsonV1({
    version: "formal-r3-h1-runtime-policy-v1",
    policyId,
    semantics,
  });

const projectorBundleHash = hashCanonicalJsonV1({
  argumentProjectionId: H1_ARGUMENT_PROJECTION_ID_V1,
  modelProjectionId: H1_MODEL_PROJECTION_ID_V1,
  publicProjectionId: H1_PUBLIC_PROJECTION_ID_V1,
  argumentProjectorImplementationHash:
    ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1,
  modelProjectorImplementationHash:
    MODEL_PROJECTION_IMPLEMENTATION_HASH_V1,
  publicProjectorImplementationHash:
    PUBLIC_PROJECTION_IMPLEMENTATION_HASH_V1,
});

const genericProjectorBundleHash = hashCanonicalJsonV1({
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

const policyRegistryEntries: readonly PolicyIdentityV1[] = [
  {
    policyKind: "acl",
    policyId: "h1-acl",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "h1-acl",
      "host_principal_exact_document_profile_mount_reauthorize_each_read"
    ),
  },
  {
    policyKind: "claim",
    policyId: "canvas-read-observed",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "canvas-read-observed",
      "actual_h1_receipt_required"
    ),
  },
  {
    policyKind: "idempotency",
    policyId: "same-call-same-result",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "same-call-same-result",
      "run_call_arguments_hash_receipt_replay"
    ),
  },
  {
    policyKind: "projection",
    policyId: H1_ARGUMENT_PROJECTION_ID_V1,
    policyVersion: "1.0.0",
    implementationHash: ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1,
  },
  {
    policyKind: "projection",
    policyId: STRICT_JSON_ARGUMENT_PROJECTION_ID_V1,
    policyVersion: "1.0.0",
    implementationHash:
      STRICT_JSON_ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1,
  },
  {
    policyKind: "projection",
    policyId: GENERIC_JSON_MODEL_PROJECTION_ID_V1,
    policyVersion: "1.0.0",
    implementationHash:
      GENERIC_JSON_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1,
  },
  {
    policyKind: "projection",
    policyId: OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_ID_V1,
    policyVersion: "1.0.0",
    implementationHash:
      OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_IMPLEMENTATION_HASH_V1,
  },
  {
    policyKind: "projection",
    policyId: H1_MODEL_PROJECTION_ID_V1,
    policyVersion: "1.0.0",
    implementationHash: MODEL_PROJECTION_IMPLEMENTATION_HASH_V1,
  },
  {
    policyKind: "projection",
    policyId: H1_PUBLIC_PROJECTION_ID_V1,
    policyVersion: "1.0.0",
    implementationHash: PUBLIC_PROJECTION_IMPLEMENTATION_HASH_V1,
  },
  {
    policyKind: "prompt",
    policyId: "h1-unavailable-rule",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "h1-unavailable-rule",
      "truthful_typed_unavailable_no_legacy_fallback"
    ),
  },
  {
    policyKind: "prompt",
    policyId: "h1-usage-rule",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "h1-usage-rule",
      "bounded_submission_time_read_only_h1"
    ),
  },
  {
    policyKind: "readback",
    policyId: "h1-receipt-only-readback",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "h1-receipt-only-readback",
      "host_actual_receipt_private_model_public_projection"
    ),
  },
  {
    policyKind: "receipt",
    policyId: "h1-read-receipt",
    policyVersion: "1.0.0",
    implementationHash:
      H1_EFFECTIVE_FACTS_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1,
  },
  {
    policyKind: "receipt",
    policyId: "generic-json-receipt",
    policyVersion: "1.0.0",
    implementationHash:
      GENERIC_JSON_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1,
  },
  {
    policyKind: "reconciliation",
    policyId: "read-no-reconciliation",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "read-no-reconciliation",
      "read_only_no_write_reconciliation"
    ),
  },
  {
    policyKind: "retry",
    policyId: "h1-read-no-retry",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "h1-read-no-retry",
      "typed_unavailable_or_fresh_turn"
    ),
  },
  {
    policyKind: "target",
    policyId: "h1-exact-target",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "h1-exact-target",
      "two_exact_documents_profiles_desktop_mount_revision"
    ),
  },
  {
    policyKind: "acl",
    policyId: "h1-host-control-acl",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "h1-host-control-acl",
      "active_h1_run_exact_host_control_only"
    ),
  },
  {
    policyKind: "idempotency",
    policyId: "h1-host-control-idempotency",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "h1-host-control-idempotency",
      "same_run_call_arguments_same_receipt"
    ),
  },
  {
    policyKind: "prompt",
    policyId: "h1-host-control-unavailable-rule",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "h1-host-control-unavailable-rule",
      "truthful_typed_unavailable_no_fallback"
    ),
  },
  {
    policyKind: "prompt",
    policyId: "h1-host-control-usage-rule",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "h1-host-control-usage-rule",
      "host_admission_control_only"
    ),
  },
  {
    policyKind: "readback",
    policyId: "h1-host-control-receipt-readback",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "h1-host-control-receipt-readback",
      "exact_receipt_projection_only"
    ),
  },
  {
    policyKind: "reconciliation",
    policyId: "h1-host-control-no-reconciliation",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "h1-host-control-no-reconciliation",
      "terminal_and_capability_controls_never_reconcile"
    ),
  },
  {
    policyKind: "retry",
    policyId: "h1-host-control-no-retry",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "h1-host-control-no-retry",
      "typed_result_or_revised_input"
    ),
  },
  {
    policyKind: "target",
    policyId: "h1-host-control-target",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "h1-host-control-target",
      "active_run_private_host_admission"
    ),
  },
] as const;

export const H1_RUNTIME_POLICY_REGISTRY_V1 =
  createPolicyRegistrySnapshotV1(policyRegistryEntries);

export const H1_RUNTIME_TOOL_DEFINITION_V1: AuthorityToolDefinitionV1 =
  decodeAuthorityToolDefinitionV1({
    contractVersion: "authority-tool-definition-v1",
    toolId: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.toolId,
    toolVersion: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.toolVersion,
    family: "canvas-read",
    description:
      "Read one bounded, Grant-authorized H1 Effective Facts snapshot for the current Run and Turn. Call this Tool at most once per Run: one completed Receipt exhausts the H1 read budget, so use the returned facts and submit_turn_outcome without another canvas_inspect call. The result is not a live Canvas view and cannot mutate, save, publish, preview, or undo the page.",
    inputSchema: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["contractVersion", "scope"],
          properties: {
            contractVersion: {
              type: "string",
              const: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.requestVersion,
            },
            scope: { type: "string", const: "summary" },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["contractVersion", "scope"],
          properties: {
            contractVersion: {
              type: "string",
              const: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.requestVersion,
            },
            scope: { type: "string", const: "selection" },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["contractVersion", "nodeRefs", "scope"],
          properties: {
            contractVersion: {
              type: "string",
              const: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.requestVersion,
            },
            nodeRefs: {
              type: "array",
              minItems: 1,
              maxItems: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.maxNodeRefs,
              uniqueItems: true,
              items: {
                type: "string",
                minLength: 1,
                maxLength: 128,
                pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
              },
            },
            scope: { type: "string", const: "nodes" },
          },
        },
      ],
    },
    privateResultSchema: {
      type: "object",
      additionalProperties: false,
      required: ["contentRef", "modelFactsJson", "resultHash"],
      properties: {
        contentRef: { type: "string", minLength: 1, maxLength: 240 },
        modelFactsJson: { type: "string", minLength: 2, maxLength: 24576 },
        resultHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
      },
    },
    modelObservationSchema: {
      type: "object",
      additionalProperties: false,
      required: ["factsJson", "observationHash", "observationRef"],
      properties: {
        factsJson: { type: "string", minLength: 2, maxLength: 24576 },
        observationHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
        observationRef: { type: "string", minLength: 1, maxLength: 240 },
      },
    },
    publicEventSchema: {
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
    },
    effect: "private_read",
    dataClasses: [
      "authored_content",
      "authorization_material",
      "canvas_structure",
      "private_provenance",
    ],
    requiredCapabilities: [H1_RUNTIME_AUTHORITY_V1.capabilityId],
    authority: {
      grantKind: "capture_grant",
      revisionPolicy: "fresh",
      targetPolicyId: "h1-exact-target",
      aclPolicyId: "h1-acl",
    },
    budgets: {
      maxCallsPerRun: 8,
      maxInputBytes: 4096,
      maxPrivateResultBytes: 32768,
      maxModelContextBytes: 24576,
      maxPublicEventBytes: 2048,
      maxWallTimeMs: 5000,
      maxVisitedNodes: 4,
    },
    executionPolicy: {
      requiredExecutorBrand: "h1-effective-facts-executor",
      idempotencyClass: "same-call-same-result",
      retryClass: "h1-read-no-retry",
      reconciliationClass: "read-no-reconciliation",
    },
    evidencePolicy: {
      receiptType: "h1-read-receipt",
      readbackPolicy: "h1-receipt-only-readback",
      supportedClaimEffects: ["canvas-read-observed"],
    },
    projectionPolicy: {
      argumentProjectionId: H1_ARGUMENT_PROJECTION_ID_V1,
      modelProjectionId: H1_MODEL_PROJECTION_ID_V1,
      publicProjectionId: H1_PUBLIC_PROJECTION_ID_V1,
      argumentProjectorImplementationHash:
        ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1,
      modelProjectorImplementationHash:
        MODEL_PROJECTION_IMPLEMENTATION_HASH_V1,
      publicProjectorImplementationHash:
        PUBLIC_PROJECTION_IMPLEMENTATION_HASH_V1,
      projectorBundleHash,
      publicContractVersion: "1.0.0",
    },
    promptPolicy: {
      usageRuleId: "h1-usage-rule",
      unavailableRuleId: "h1-unavailable-rule",
    },
  });

const canvasTrustedFactory: TrustedExecutorFactoryEntryV1 = {
  toolId: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.toolId,
  toolVersion: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.toolVersion,
  executorBrand: "h1-effective-facts-executor",
  executorBuildRef: "repo:effective-facts-canvas-inspect-v1",
  executorArtifactHash: hashCanonicalJsonV1({
    implementation: "EffectiveFactsCanvasInspectExecutorV1",
    version: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.toolVersion,
    authority: "store_v3_active_h1_run_read_port",
  }),
  adapterId: "h1-effective-facts-read-adapter",
  adapterVersion: "1.0.0",
  adapterArtifactHash:
    H1_EFFECTIVE_FACTS_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1,
  bridgeContractHash: hashCanonicalJsonV1({
    implementation: "formal-r3-h1-runtime-admission-bridge",
    version: "1.0.0",
    boundary: "host_principal_acl_grant_nonce_store",
  }),
};

export const H1_RUNTIME_TERMINAL_CONTROL_DESCRIPTOR_V1: ToolDescriptorV1 =
  Object.freeze({
    toolId: "submit_turn_outcome",
    version: "1.0.0",
    description:
      "Submit the completed H1 read for Host admission. Use exactly one Goal requirement with requiredEffects [read], exactly one completed read claim bound to the actual canvas_inspect Receipt, outcome fulfilled, and no advisory/report requirement, capability gap, or unresolved requirement. This control never publishes Actor text or changes the page.",
    effect: "runtime_state",
    inputSchema: {
      ...SUBMIT_TURN_OUTCOME_INPUT_SCHEMA_V1,
      $defs: {
        ...SUBMIT_TURN_OUTCOME_INPUT_SCHEMA_V1.$defs,
        requirement: {
          ...SUBMIT_TURN_OUTCOME_INPUT_SCHEMA_V1.$defs.requirement,
          properties: {
            ...SUBMIT_TURN_OUTCOME_INPUT_SCHEMA_V1.$defs.requirement.properties,
            requiredEffects: {
              type: "array",
              minItems: 1,
              maxItems: 1,
              uniqueItems: true,
              items: { type: "string", const: "read" },
            },
          },
        },
        goal: {
          ...SUBMIT_TURN_OUTCOME_INPUT_SCHEMA_V1.$defs.goal,
          properties: {
            ...SUBMIT_TURN_OUTCOME_INPUT_SCHEMA_V1.$defs.goal.properties,
            requirements: {
              type: "array",
              minItems: 1,
              maxItems: 1,
              items: { $ref: "#/$defs/requirement" },
            },
          },
        },
        finalClaim: {
          ...SUBMIT_TURN_OUTCOME_INPUT_SCHEMA_V1.$defs.finalClaim,
          properties: {
            ...SUBMIT_TURN_OUTCOME_INPUT_SCHEMA_V1.$defs.finalClaim.properties,
            effect: { type: "string", const: "read" },
          },
        },
        proposal: {
          ...SUBMIT_TURN_OUTCOME_INPUT_SCHEMA_V1.$defs.proposal,
          properties: {
            ...SUBMIT_TURN_OUTCOME_INPUT_SCHEMA_V1.$defs.proposal.properties,
            outcome: { type: "string", const: "fulfilled" },
            completedRequirementIds: {
              type: "array",
              minItems: 1,
              maxItems: 1,
              uniqueItems: true,
              items: { type: "string", minLength: 1, maxLength: 128 },
            },
            unresolvedRequirementIds: {
              type: "array",
              maxItems: 0,
              uniqueItems: true,
              items: { type: "string", minLength: 1, maxLength: 128 },
            },
            capabilityGaps: {
              type: "array",
              maxItems: 0,
              items: { $ref: "#/$defs/capabilityGap" },
            },
            finalClaims: {
              type: "array",
              minItems: 1,
              maxItems: 1,
              items: { $ref: "#/$defs/finalClaim" },
            },
          },
        },
      },
    },
  });

const genericPrivateResultSchema = Object.freeze({
  type: "object" as const,
  additionalProperties: false,
  required: ["contentRef", "observationJson", "resultHash"],
  properties: {
    contentRef: { type: "string" as const, minLength: 1, maxLength: 240 },
    observationJson: {
      type: "string" as const,
      minLength: 2,
      maxLength: 32768,
    },
    resultHash: { type: "string" as const, pattern: "^[a-f0-9]{64}$" },
  },
});

const genericModelObservationSchema = Object.freeze({
  type: "object" as const,
  additionalProperties: false,
  required: ["observationJson", "observationHash", "observationRef"],
  properties: {
    observationJson: {
      type: "string" as const,
      minLength: 2,
      maxLength: 32768,
    },
    observationHash: {
      type: "string" as const,
      pattern: "^[a-f0-9]{64}$",
    },
    observationRef: {
      type: "string" as const,
      minLength: 1,
      maxLength: 240,
    },
  },
});

const opaquePublicEventSchema = Object.freeze({
  type: "object" as const,
  additionalProperties: false,
  required: ["detailRef", "receiptId", "status"],
  properties: {
    detailRef: { type: "string" as const, minLength: 1, maxLength: 240 },
    receiptId: { type: "string" as const, minLength: 1, maxLength: 160 },
    status: {
      type: "string" as const,
      enum: ["completed", "denied", "failed", "started", "unavailable"],
    },
  },
});

const createH1HostControlDefinition = (input: Readonly<{
  toolId: string;
  toolVersion: string;
  family: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
  effect: "private_read" | "presentation_state";
  requiredCapability: string;
  executorBrand: string;
}>) =>
  decodeAuthorityToolDefinitionV1({
    contractVersion: "authority-tool-definition-v1",
    toolId: input.toolId,
    toolVersion: input.toolVersion,
    family: input.family,
    description: input.description,
    inputSchema: input.inputSchema,
    privateResultSchema: genericPrivateResultSchema,
    modelObservationSchema: genericModelObservationSchema,
    publicEventSchema: opaquePublicEventSchema,
    effect: input.effect,
    dataClasses: ["opaque_identity", "private_provenance"],
    requiredCapabilities: [input.requiredCapability],
    authority: {
      grantKind: "none",
      revisionPolicy: "none",
      targetPolicyId: "h1-host-control-target",
      aclPolicyId: "h1-host-control-acl",
    },
    budgets: {
      maxCallsPerRun: 8,
      maxInputBytes: 65536,
      maxPrivateResultBytes: 65536,
      maxModelContextBytes: 32768,
      maxPublicEventBytes: 2048,
      maxWallTimeMs: 5000,
    },
    executionPolicy: {
      requiredExecutorBrand: input.executorBrand,
      idempotencyClass: "h1-host-control-idempotency",
      retryClass: "h1-host-control-no-retry",
      reconciliationClass: "h1-host-control-no-reconciliation",
    },
    evidencePolicy: {
      receiptType: "generic-json-receipt",
      readbackPolicy: "h1-host-control-receipt-readback",
      supportedClaimEffects: [],
    },
    projectionPolicy: {
      argumentProjectionId: STRICT_JSON_ARGUMENT_PROJECTION_ID_V1,
      modelProjectionId: GENERIC_JSON_MODEL_PROJECTION_ID_V1,
      publicProjectionId: OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_ID_V1,
      argumentProjectorImplementationHash:
        STRICT_JSON_ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1,
      modelProjectorImplementationHash:
        GENERIC_JSON_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1,
      publicProjectorImplementationHash:
        OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_IMPLEMENTATION_HASH_V1,
      projectorBundleHash: genericProjectorBundleHash,
      publicContractVersion: "1.0.0",
    },
    promptPolicy: {
      usageRuleId: "h1-host-control-usage-rule",
      unavailableRuleId: "h1-host-control-unavailable-rule",
    },
  });

export const H1_RUNTIME_CAPABILITY_CONTROL_DEFINITION_V1 =
  createH1HostControlDefinition({
    toolId: "inspect_ux_capability",
    toolVersion: "1.0.0",
    family: "ux-capability-read",
    description:
      "Inspect the current editor Canvas mutation capability without changing the page.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    effect: "private_read",
    requiredCapability: "ux.capability.inspect.h1",
    executorBrand: "h1-ux-capability-control-executor",
  });

export const H1_RUNTIME_TERMINAL_CONTROL_DEFINITION_V1 =
  createH1HostControlDefinition({
    toolId: H1_RUNTIME_TERMINAL_CONTROL_DESCRIPTOR_V1.toolId,
    toolVersion: "h1-terminal-control-v1",
    family: "turn-outcome-control",
    description: H1_RUNTIME_TERMINAL_CONTROL_DESCRIPTOR_V1.description,
    inputSchema: H1_RUNTIME_TERMINAL_CONTROL_DESCRIPTOR_V1.inputSchema,
    effect: "presentation_state",
    requiredCapability: "runtime.turn.outcome.submit.h1",
    executorBrand: "h1-terminal-control-executor",
  });

const capabilityTrustedFactory: TrustedExecutorFactoryEntryV1 = {
  toolId: H1_RUNTIME_CAPABILITY_CONTROL_DEFINITION_V1.toolId,
  toolVersion: H1_RUNTIME_CAPABILITY_CONTROL_DEFINITION_V1.toolVersion,
  executorBrand:
    H1_RUNTIME_CAPABILITY_CONTROL_DEFINITION_V1.executionPolicy
      .requiredExecutorBrand,
  executorBuildRef: "repo:h1-host-control-executor-v1",
  executorArtifactHash: hashCanonicalJsonV1({
    implementation: "H1HostControlExecutorV1",
    control: "inspect_ux_capability",
    version: "1.0.0",
  }),
  adapterId: "generic-json-receipt-adapter",
  adapterVersion: "1.0.0",
  adapterArtifactHash:
    GENERIC_JSON_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1,
  bridgeContractHash: hashCanonicalJsonV1({
    implementation: "formal-r3-h1-host-control-bridge",
    version: "1.0.0",
  }),
};

const terminalTrustedFactory: TrustedExecutorFactoryEntryV1 = {
  toolId: H1_RUNTIME_TERMINAL_CONTROL_DEFINITION_V1.toolId,
  toolVersion: H1_RUNTIME_TERMINAL_CONTROL_DEFINITION_V1.toolVersion,
  executorBrand:
    H1_RUNTIME_TERMINAL_CONTROL_DEFINITION_V1.executionPolicy
      .requiredExecutorBrand,
  executorBuildRef: "repo:h1-host-control-executor-v1",
  executorArtifactHash: hashCanonicalJsonV1({
    implementation: "H1HostControlExecutorV1",
    control: "submit_turn_outcome",
    version: "h1-terminal-control-v1",
  }),
  adapterId: "generic-json-receipt-adapter",
  adapterVersion: "1.0.0",
  adapterArtifactHash:
    GENERIC_JSON_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1,
  bridgeContractHash: capabilityTrustedFactory.bridgeContractHash,
};

const trustedFactories = [
  canvasTrustedFactory,
  capabilityTrustedFactory,
  terminalTrustedFactory,
] as const;

const trustedFactorySnapshotHash = hashCanonicalJsonV1({
  contractVersion: "formal-r3-h1-trusted-factory-snapshot-v2",
  entries: trustedFactories,
});

export const H1_RUNTIME_TRUSTED_EXECUTOR_BINDING_V1 =
  createTrustedExecutorBindingV1({
    definition: H1_RUNTIME_TOOL_DEFINITION_V1,
    policyRegistry: H1_RUNTIME_POLICY_REGISTRY_V1,
    factoryEntry: canvasTrustedFactory,
    trustedFactorySnapshotHash,
  });

export const H1_RUNTIME_CAPABILITY_CONTROL_BINDING_V1 =
  createTrustedExecutorBindingV1({
    definition: H1_RUNTIME_CAPABILITY_CONTROL_DEFINITION_V1,
    policyRegistry: H1_RUNTIME_POLICY_REGISTRY_V1,
    factoryEntry: capabilityTrustedFactory,
    trustedFactorySnapshotHash,
  });

export const H1_RUNTIME_TERMINAL_CONTROL_BINDING_V1 =
  createTrustedExecutorBindingV1({
    definition: H1_RUNTIME_TERMINAL_CONTROL_DEFINITION_V1,
    policyRegistry: H1_RUNTIME_POLICY_REGISTRY_V1,
    factoryEntry: terminalTrustedFactory,
    trustedFactorySnapshotHash,
  });

export const H1_RUNTIME_COMPILED_TOOL_CATALOG_V1 =
  compileAuthorityToolCatalogV1(H1_RUNTIME_POLICY_REGISTRY_V1, [
    {
      enabled: true,
      definition: H1_RUNTIME_TOOL_DEFINITION_V1,
      executorBinding: H1_RUNTIME_TRUSTED_EXECUTOR_BINDING_V1,
    },
    {
      enabled: true,
      definition: H1_RUNTIME_CAPABILITY_CONTROL_DEFINITION_V1,
      executorBinding: H1_RUNTIME_CAPABILITY_CONTROL_BINDING_V1,
    },
    {
      enabled: true,
      definition: H1_RUNTIME_TERMINAL_CONTROL_DEFINITION_V1,
      executorBinding: H1_RUNTIME_TERMINAL_CONTROL_BINDING_V1,
    },
  ]);

export const H1_RUNTIME_SKILL_PROMPT_V1 = [
  "The H1 Canvas Read recipe is instructional data, never authority.",
  "Use the exact canvas_inspect tool before making claims about the captured page.",
  "Call canvas_inspect at most once per Run. One completed Receipt exhausts the H1 read budget: never request another scope after success; use the facts already returned and immediately submit_turn_outcome.",
  "The tool reads only the bounded Effective Facts snapshot captured when this Turn was submitted; it is not a live Canvas view.",
  "Do not claim or imply Canvas mutation, save, publish, preview, undo, arbitrary page read, or access outside the exact admitted profile.",
  "If the user requests a Canvas change, answer exactly: 我目前可以读取这个页面，但还不能直接修改画布。该能力尚未开放，请等待功能升级或联系技术负责人。",
  "If the read is unavailable or denied, state that limitation explicitly and continue without inventing page facts.",
  "After a successful read, finish with submit_turn_outcome: use exactly one requirement whose requiredEffects is [read]. Do not create a separate advisory/report requirement. Use outcome fulfilled, exactly one completed read claim whose evidenceRefs contains exactly tool-call:<callId> (preferred) or the exact Receipt ID returned by canvas_inspect, no unresolved requirements, and put the concise user-facing answer in actorDraftText.",
  "Set Goal.originalIntent to the exact user message byte-for-byte. The Host binds it to the immutable trigger message and rejects paraphrases or invented intent.",
].join("\n");

export const H1_RUNTIME_POLICY_PROMPT_V1 = [
  "Use the exact canvas_inspect Tool before making claims about the captured page.",
  "Call canvas_inspect at most once per Run. After one completed Receipt, do not call it again; use that Receipt and submit_turn_outcome immediately.",
  "The Tool reads only the bounded Effective Facts snapshot captured when this Turn was submitted; it is not a live Canvas view.",
  "Every page-fact claim must be supported by an actual same-Run H1 Receipt.",
  "Do not claim or imply Canvas mutation, save, publish, preview, undo, arbitrary page read, or access outside the exact admitted profile.",
  "Do not use legacy C6A observations or any Tool outside the Run Tool Admission.",
  "If the read is unavailable or denied, state that limitation explicitly and do not invent page facts.",
  "A successful read may be delivered only through submit_turn_outcome with exactly one [read] requirement and one completed read claim. Do not add an advisory/report requirement. Its evidenceRefs must use exactly tool-call:<callId> (preferred) or the exact Receipt ID returned by canvas_inspect.",
  "Copy the exact user message byte-for-byte into Goal.originalIntent; the Host rejects any terminal Goal that is not bound to that immutable trigger message.",
].join("\n");

const skillDefinition: SkillDefinitionV1 = {
  contractVersion: "formal-r3-skill-definition-v1",
  skillId: H1_RUNTIME_AUTHORITY_V1.skillId,
  skillVersion: H1_RUNTIME_AUTHORITY_V1.skillVersion,
  title: "H1 Canvas Read Recipe",
  purpose:
    "Read one bounded H1 Effective Facts snapshot and answer without claiming mutation or unsupported Canvas access.",
  mode: "prompt_recipe",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["goal"],
    properties: {
      goal: { type: "string", minLength: 1, maxLength: 4000 },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["answer"],
    properties: {
      answer: { type: "string", minLength: 1, maxLength: 16000 },
    },
  },
  requiredTools: [
    {
      toolId: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.toolId,
      versionRange: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.toolVersion,
      requiredEffect: "private_read",
    },
  ],
  optionalTools: [],
  requiredUxContracts: [
    {
      contractId: H1_RUNTIME_AUTHORITY_V1.uxContractId,
      versionRange: H1_RUNTIME_AUTHORITY_V1.uxContractVersion,
    },
  ],
  requiredCapabilities: [H1_RUNTIME_AUTHORITY_V1.capabilityId],
  promptFragments: [
    {
      resourceId: "h1-read-recipe",
      contentHash: hashUtf8V1(H1_RUNTIME_SKILL_PROMPT_V1),
    },
  ],
  workflowDefinitionRef: null,
  dependencies: [],
  budgets: {
    maxToolCalls: 4,
    maxNestedSkillDepth: 1,
    maxContextBytes: 32768,
    maxWallTimeMs: 20000,
  },
  evidencePolicy: {
    requiredReceiptEffects: ["canvas-read-observed"],
    completionRubricRef: "h1-read-rubric",
    claimPolicyId: "canvas-read-observed",
  },
  unavailablePolicyId: "h1-unavailable-rule",
};

export const H1_RUNTIME_SKILL_PACKAGE_V1 = createSkillPackageDefinitionV1({
  packageId: H1_RUNTIME_AUTHORITY_V1.packageId,
  packageVersion: H1_RUNTIME_AUTHORITY_V1.packageVersion,
  definition: skillDefinition,
  promptResourceHashes: [hashUtf8V1(H1_RUNTIME_SKILL_PROMPT_V1)],
  rubricHash: hashCanonicalJsonV1({
    rubric: "h1-read-rubric",
    version: "1.0.0",
    requirements: [
      "actual_receipt_for_canvas_claim",
      "no_mutation_claim",
      "typed_unavailable_when_missing",
    ],
  }),
});

export const H1_RUNTIME_SKILL_CATALOG_V1 = createSkillCatalogV1([
  H1_RUNTIME_SKILL_PACKAGE_V1,
]);

export const H1_RUNTIME_CONFLICT_REGISTRY_V1 =
  createSkillConflictRegistrySnapshotV1([]);

export const H1_RUNTIME_UX_CONTRACTS_V1: readonly ResolvedUxContractV1[] = [
  {
    contractId: H1_RUNTIME_AUTHORITY_V1.uxContractId,
    contractVersion: H1_RUNTIME_AUTHORITY_V1.uxContractVersion,
    contractHash: UX_EFFECTIVE_FACTS_CAPABILITY_FINGERPRINT_V1,
  },
];

const availableCapabilities = [H1_RUNTIME_AUTHORITY_V1.capabilityId] as const;

export const H1_RUNTIME_TOOL_DESCRIPTORS_V1: readonly ToolDescriptorV1[] =
  H1_RUNTIME_COMPILED_TOOL_CATALOG_V1.tools.map((tool) => ({
    toolId: tool.modelDescriptor.toolId,
    version: tool.modelDescriptor.toolVersion,
    description: tool.modelDescriptor.description,
    effect:
      tool.modelDescriptor.toolId === "inspect_ux_capability"
        ? ("capability_read" as const)
        : tool.modelDescriptor.effect === "presentation_state"
          ? ("runtime_state" as const)
          : ("read_only" as const),
    inputSchema: structuredClone(tool.modelDescriptor.inputSchema),
  }));

export const compileH1RuntimeAuthorityForRunV1 = (input: Readonly<{
  runId: string;
  turnId: string;
  requestId: string;
  userMessage: string;
  principalHash: string;
  aclSnapshotHash: string;
  revisionBinding: string;
  modelIdentity: string;
  activateSkill?: boolean;
  issuedAt: string;
  expiresAt: string;
}>) => {
  const runId = requiredIdV1(input.runId, "h1RuntimeAuthority.runId");
  const turnId = requiredIdV1(input.turnId, "h1RuntimeAuthority.turnId");
  const requestId = requiredIdV1(input.requestId, "h1RuntimeAuthority.requestId");
  const userMessage = requiredStringV1(
    input.userMessage,
    "h1RuntimeAuthority.userMessage",
    32_768
  );
  const principalHash = requiredHashV1(
    input.principalHash,
    "h1RuntimeAuthority.principalHash"
  );
  const aclSnapshotHash = requiredHashV1(
    input.aclSnapshotHash,
    "h1RuntimeAuthority.aclSnapshotHash"
  );
  const revisionBinding = requiredHashV1(
    input.revisionBinding,
    "h1RuntimeAuthority.revisionBinding"
  );
  const modelIdentity = requiredModelIdentityV1(
    input.modelIdentity,
    "h1RuntimeAuthority.modelIdentity"
  );
  const issuedAt = requiredTimestampV1(
    input.issuedAt,
    "h1RuntimeAuthority.issuedAt"
  );
  const expiresAt = requiredTimestampV1(
    input.expiresAt,
    "h1RuntimeAuthority.expiresAt"
  );
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw new Error("h1_runtime_authority_expiry_invalid");
  }
  const activateSkill = input.activateSkill === true;
  const kernelPrincipalBindingRef = `principal-${principalHash.slice(0, 24)}`;
  const request = createSkillResolutionRequestV1({
    runId,
    requestId,
    kernelPrincipalBindingRef,
    requestedSkills: activateSkill
      ? [
          {
            source: "user_explicit" as const,
            skillId: H1_RUNTIME_SKILL_PACKAGE_V1.definition.skillId,
            exactVersion: H1_RUNTIME_SKILL_PACKAGE_V1.definition.skillVersion,
            packageHash: H1_RUNTIME_SKILL_PACKAGE_V1.packageHash,
          },
        ]
      : [],
    toolCatalogHash: H1_RUNTIME_COMPILED_TOOL_CATALOG_V1.catalogHash,
    skillCatalogHash: H1_RUNTIME_SKILL_CATALOG_V1.catalogHash,
    uxContractFingerprint: hashResolvedUxContractSetV1(
      H1_RUNTIME_UX_CONTRACTS_V1
    ),
    capabilitySnapshotHash:
      hashAvailableCapabilitySetV1(availableCapabilities),
    aclSnapshotHash,
    conflictRegistrySnapshotHash:
      H1_RUNTIME_CONFLICT_REGISTRY_V1.snapshotHash,
    requestedAt: issuedAt,
  });
  const resolutionPlan = resolveSkillResolutionPlanV1({
    request,
    skillCatalog: H1_RUNTIME_SKILL_CATALOG_V1,
    toolCatalog: H1_RUNTIME_COMPILED_TOOL_CATALOG_V1,
    uxContracts: H1_RUNTIME_UX_CONTRACTS_V1,
    availableCapabilities,
    conflictRegistry: H1_RUNTIME_CONFLICT_REGISTRY_V1,
    turnId,
    attemptId: `attempt-${hashUtf8V1(`${runId}\u0000${requestId}`).slice(0, 24)}`,
    createdAt: issuedAt,
  });
  const expectedSkillClosures = activateSkill ? 1 : 0;
  if (
    resolutionPlan.unavailable.length !== 0 ||
    resolutionPlan.orderedClosures.length !== expectedSkillClosures ||
    resolutionPlan.closureBudgetReservations.length !== expectedSkillClosures
  ) {
    throw new Error("h1_runtime_skill_resolution_invalid");
  }
  const skillActivationReceipt = activateSkill
    ? (() => {
        const resolvedClosure = resolutionPlan.orderedClosures[0]!;
        const budgetReservation =
          resolutionPlan.closureBudgetReservations[0]!;
        const activationRequest = createSkillActivationRequestV1({
          runId,
          requestId,
          idempotencyKey: `activate-${hashUtf8V1(`${runId}\u0000${requestId}`).slice(0, 24)}`,
          kernelPrincipalBindingRef,
          resolutionPlanHash: resolutionPlan.planHash,
          conflictRegistrySnapshotHash:
            resolutionPlan.conflictRegistrySnapshotHash,
          resolvedClosureHash: resolvedClosure.closureHash,
          source: "user_explicit",
          skillInputJson: canonicalJsonV1({ goal: userMessage }),
          budgetReservationHash: budgetReservation.reservationHash,
          parentSkillActivationId: null,
          parentActivationReceiptHash: null,
          requestedAt: issuedAt,
        });
        return new CandidateSkillActivationLedgerV1().activate({
          request: activationRequest,
          plan: resolutionPlan,
          principalHash,
          toolCatalogHash: H1_RUNTIME_COMPILED_TOOL_CATALOG_V1.catalogHash,
          skillCatalogHash: H1_RUNTIME_SKILL_CATALOG_V1.catalogHash,
          uxCapabilitySnapshotHash: resolutionPlan.uxCapabilitySnapshotHash,
          aclSnapshotHash,
          conflictRegistrySnapshotHash:
            H1_RUNTIME_CONFLICT_REGISTRY_V1.snapshotHash,
          issuedAt,
          expiresAt,
        });
      })()
    : null;
  const activationReceipts = skillActivationReceipt
    ? [skillActivationReceipt]
    : [];
  const actorCallId = `actor-call-${hashUtf8V1(`${runId}\u0000${turnId}`).slice(0, 24)}`;
  const userGoalContextRef = canonicalJsonV1({
    contractVersion: "formal-r3-user-goal-context-reference-v1",
    contentHash: hashUtf8V1(userMessage),
    delivery: "user_role_only",
  });
  const contextManifest = createRunContextManifestV1({
    runId,
    turnId,
    uxCapabilityFingerprint: UX_EFFECTIVE_FACTS_CAPABILITY_FINGERPRINT_V1,
    revisionBinding,
    entries: [
      {
        contextId: "user-goal",
        sourceKind: "user_goal",
        sourceRef: "turn-user-goal",
        contentHash: hashUtf8V1(userGoalContextRef),
        evidenceLevel: "user-authored",
        freshness: "turn-bound",
        maxBytes: 32_768,
      },
    ],
  });
  const executionAdmission = createExecutionAdmissionV1({
    actorCallId,
    principalHash,
    resolutionPlan,
    toolCatalog: H1_RUNTIME_COMPILED_TOOL_CATALOG_V1,
    skillCatalog: H1_RUNTIME_SKILL_CATALOG_V1,
    activationReceipts,
    terminalTransitionReceipts: [],
    admittedEffects: activateSkill ? ["private_read"] : [],
    issuedAt,
    expiresAt,
  });
  const runToolAdmission = createH1RuntimeToolAdmissionV1({
    runId,
    principalHash,
    toolCatalog: H1_RUNTIME_COMPILED_TOOL_CATALOG_V1,
    issuedAt,
    expiresAt,
  });
  const fragment = (
    fragmentId: string,
    sourceKind: PromptFragmentMaterialV1["sourceKind"],
    sourceText: string,
    placement: number
  ): PromptFragmentMaterialV1 => ({
    fragmentId,
    sourceKind,
    sourceText,
    placement,
    maxBytes: 65_536,
    maxTokens: 24_000,
  });
  const fragments: readonly PromptFragmentMaterialV1[] = activateSkill
    ? [
        fragment(
          "base",
          "base",
          "你是致趣 Landing Page Harness 的页面增长与制作 Actor。所有能力声明必须以当前 Run 的 Host Authority、Compiled Tool Catalog 与实际 Receipt 为准。",
          0
        ),
        fragment("policy", "policy", H1_RUNTIME_POLICY_PROMPT_V1, 1),
        fragment(
          "tool-sheet-canvas-inspect",
          "tool_sheet",
          canonicalJsonV1(
            H1_RUNTIME_COMPILED_TOOL_CATALOG_V1.tools[0]!.promptCapability
          ),
          2
        ),
        fragment("skill", "skill", H1_RUNTIME_SKILL_PROMPT_V1, 3),
        fragment("user-goal-reference", "context", userGoalContextRef, 4),
      ]
    : [
        fragment(
          "base",
          "base",
          "你是致趣 Landing Page Harness 的页面增长与制作 Actor。所有能力声明必须以当前 Run 的 Host Authority、Compiled Tool Catalog 与实际 Receipt 为准。",
          0
        ),
        fragment("policy", "policy", H1_RUNTIME_POLICY_PROMPT_V1, 1),
        fragment("context", "context", userGoalContextRef, 2),
      ];
  const promptCompositionManifest = createPromptCompositionManifestV1({
    composedAt: issuedAt,
    contextManifest,
    principalHash,
    resolutionPlan,
    executionAdmission,
    toolCatalog: H1_RUNTIME_COMPILED_TOOL_CATALOG_V1,
    skillCatalog: H1_RUNTIME_SKILL_CATALOG_V1,
    activationReceipts,
    terminalTransitionReceipts: [],
    evidenceContexts: [],
    evidenceAuthority: null,
    fragments,
  });
  const executionFingerprint = createExecutionFingerprintMaterialV1({
    contextManifest,
    principalHash,
    resolutionPlan,
    toolCatalog: H1_RUNTIME_COMPILED_TOOL_CATALOG_V1,
    skillCatalog: H1_RUNTIME_SKILL_CATALOG_V1,
    activationReceipts,
    terminalTransitionReceipts: [],
    executionAdmission,
    evidenceContexts: [],
    evidenceAuthority: null,
    promptCompositionManifest,
    fragmentSources: fragments,
    modelIdentityHash: hashUtf8V1(modelIdentity),
  });
  const systemPrompt = fragments
    .map((item) => renderPromptFragmentMaterialV1(item).renderedText)
    .join("\n\n");
  return createH1RuntimeAuthorityMaterialV1({
    policyRegistry: H1_RUNTIME_POLICY_REGISTRY_V1,
    compiledToolCatalog: H1_RUNTIME_COMPILED_TOOL_CATALOG_V1,
    skillCatalog: H1_RUNTIME_SKILL_CATALOG_V1,
    skillResolutionPlan: resolutionPlan,
    skillActivationReceipt,
    runToolAdmission,
    contextManifest,
    executionAdmission,
    promptCompositionManifest,
    executionFingerprint,
    systemPrompt,
    systemPromptHash: hashUtf8V1(systemPrompt),
  });
};
