import type {
  AuthorityToolDefinitionV1,
  AuthorityToolEffectV1,
  DeterministicJsonSchemaV1,
  PolicyIdentityV1,
  ToolDataClassV1,
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
  compileAuthorityToolCatalogV1,
  createPolicyRegistrySnapshotV1,
  createTrustedExecutorBindingV1,
  decodeAuthorityToolDefinitionV1,
} from "./authority-tool-compiler";
import {
  REFERENCE_DESIGN_SLICES_V1,
  REFERENCE_RESEARCH_LIMITS_V1,
  REFERENCE_RESEARCH_V1,
} from "./reference-research-contracts";
import { hashCanonicalJsonV1 } from "./strict-json";
import {
  SUBMIT_TURN_OUTCOME_INPUT_SCHEMA_V1,
  type ToolDescriptorV1,
} from "./tools";

/**
 * The General profile is deliberately a Tool catalog only. The empty Skill
 * activation set leaves a typed seam for a later resolver without granting a
 * Skill, MCP transport, or any additional Tool/effect in R1.
 */
export const GENERAL_RUNTIME_AUTHORITY_V1 = Object.freeze({
  catalogProfileId: "general-authority-catalog-v1",
  catalogEpoch: 1,
  activatedSkillIds: Object.freeze([] as string[]),
  skillResolution: "inactive_seam" as const,
});

const policyHash = (policyId: string, semantics: string) =>
  hashCanonicalJsonV1({
    version: "formal-r3-general-runtime-policy-v1",
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

const policyRegistryEntries: readonly PolicyIdentityV1[] = [
  {
    policyKind: "acl",
    policyId: "general-runtime-acl",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "general-runtime-acl",
      "active_general_run_exact_workspace_thread_tool_identity"
    ),
  },
  {
    policyKind: "idempotency",
    policyId: "general-same-call-same-receipt",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "general-same-call-same-receipt",
      "workspace_thread_turn_run_call_tool_version_arguments_hash"
    ),
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
    policyKind: "prompt",
    policyId: "general-tool-unavailable-rule",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "general-tool-unavailable-rule",
      "truthful_typed_unavailable_no_canvas_or_skill_fallback"
    ),
  },
  {
    policyKind: "prompt",
    policyId: "general-tool-usage-rule",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "general-tool-usage-rule",
      "model_may_call_only_exact_run_catalog_descriptor"
    ),
  },
  {
    policyKind: "readback",
    policyId: "general-private-receipt-readback",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "general-private-receipt-readback",
      "actual_receipt_private_json_model_projection_opaque_public_lifecycle"
    ),
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
    policyId: "general-no-reconciliation",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "general-no-reconciliation",
      "no_external_or_canvas_write_to_reconcile"
    ),
  },
  {
    policyKind: "reconciliation",
    policyId: "general-reference-reconciliation",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "general-reference-reconciliation",
      "reference_receipt_readback_by_exact_call_and_artifact_identity"
    ),
  },
  {
    policyKind: "retry",
    policyId: "general-revise-input-or-no-retry",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "general-revise-input-or-no-retry",
      "receipt_status_controls_revised_input_or_terminal_no_retry"
    ),
  },
  {
    policyKind: "target",
    policyId: "general-runtime-target",
    policyVersion: "1.0.0",
    implementationHash: policyHash(
      "general-runtime-target",
      "active_run_private_host_or_bounded_public_reference_target"
    ),
  },
] as const;

export const GENERAL_RUNTIME_POLICY_REGISTRY_V1 =
  createPolicyRegistrySnapshotV1(policyRegistryEntries);

const genericPrivateResultSchema: DeterministicJsonSchemaV1 = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["contentRef", "observationJson", "resultHash"],
  properties: {
    contentRef: { type: "string", minLength: 1, maxLength: 240 },
    observationJson: { type: "string", minLength: 2, maxLength: 65536 },
    resultHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
  },
} as const);

const genericModelObservationSchema: DeterministicJsonSchemaV1 = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["observationJson", "observationHash", "observationRef"],
  properties: {
    observationJson: { type: "string", minLength: 2, maxLength: 65536 },
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

type GeneralDefinitionInputV1 = Readonly<{
  toolId: string;
  toolVersion?: string;
  family: string;
  description: string;
  inputSchema: DeterministicJsonSchemaV1;
  effect: AuthorityToolEffectV1;
  dataClasses: readonly ToolDataClassV1[];
  requiredCapabilities: readonly string[];
  executorBrand: string;
  maxCallsPerRun: number;
  maxInputBytes?: number;
  maxPrivateResultBytes?: number;
  maxModelContextBytes?: number;
  maxWallTimeMs?: number;
  reconciliationClass?: "general-reference-reconciliation";
}>;

const createGeneralToolDefinitionV1 = (input: GeneralDefinitionInputV1) =>
  decodeAuthorityToolDefinitionV1({
    contractVersion: "authority-tool-definition-v1",
    toolId: input.toolId,
    toolVersion: input.toolVersion ?? "1.0.0",
    family: input.family,
    description: input.description,
    inputSchema: input.inputSchema,
    privateResultSchema: genericPrivateResultSchema,
    modelObservationSchema: genericModelObservationSchema,
    publicEventSchema: opaquePublicEventSchema,
    effect: input.effect,
    dataClasses: input.dataClasses,
    requiredCapabilities: input.requiredCapabilities,
    authority: {
      grantKind: "none",
      revisionPolicy: "none",
      targetPolicyId: "general-runtime-target",
      aclPolicyId: "general-runtime-acl",
    },
    budgets: {
      maxCallsPerRun: input.maxCallsPerRun,
      maxInputBytes: input.maxInputBytes ?? 65536,
      maxPrivateResultBytes: input.maxPrivateResultBytes ?? 131072,
      maxModelContextBytes: input.maxModelContextBytes ?? 65536,
      maxPublicEventBytes: 2048,
      maxWallTimeMs: input.maxWallTimeMs ?? 15000,
    },
    executionPolicy: {
      requiredExecutorBrand: input.executorBrand,
      idempotencyClass: "general-same-call-same-receipt",
      retryClass: "general-revise-input-or-no-retry",
      reconciliationClass:
        input.reconciliationClass ?? "general-no-reconciliation",
    },
    evidencePolicy: {
      receiptType: "generic-json-receipt",
      readbackPolicy: "general-private-receipt-readback",
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
      projectorBundleHash,
      publicContractVersion: "1.0.0",
    },
    promptPolicy: {
      usageRuleId: "general-tool-usage-rule",
      unavailableRuleId: "general-tool-unavailable-rule",
    },
  });

export const GENERAL_RUNTIME_TOOL_DEFINITIONS_V1: readonly AuthorityToolDefinitionV1[] =
  Object.freeze([
    createGeneralToolDefinitionV1({
      toolId: "read_public_web",
      family: "public-web-read",
      description:
        "Read a public HTTP(S) webpage as untrusted source material. Use when the user asks to inspect or summarize a webpage. Private networks, credential URLs, unsafe redirects, oversized bodies, and non-text responses are denied.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["url"],
        properties: {
          url: { type: "string", minLength: 8, maxLength: 2048 },
        },
      },
      effect: "private_read",
      dataClasses: ["external_content", "private_provenance"],
      requiredCapabilities: ["network.public.read"],
      executorBrand: "general-tool-executor",
      maxCallsPerRun: 8,
      maxPrivateResultBytes: 65536,
      maxModelContextBytes: 32768,
      maxWallTimeMs: 12000,
    }),
    createGeneralToolDefinitionV1({
      toolId: "update_plan",
      family: "runtime-plan-control",
      description:
        "Create or update the current landing-page task plan. Call this tool whenever the user explicitly asks to split, create, or update a plan, and for other multi-step work.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["steps"],
        properties: {
          steps: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["description", "status"],
              properties: {
                description: { type: "string", minLength: 1, maxLength: 240 },
                status: {
                  type: "string",
                  enum: ["completed", "in_progress", "pending"],
                },
              },
            },
          },
        },
      },
      effect: "presentation_state",
      dataClasses: ["authored_content", "opaque_identity"],
      requiredCapabilities: ["runtime.plan.update"],
      executorBrand: "general-tool-executor",
      maxCallsPerRun: 12,
      maxModelContextBytes: 32768,
    }),
    createGeneralToolDefinitionV1({
      toolId: "read_resource_range",
      family: "trusted-resource-read",
      description:
        "Read a bounded range from a trusted landing-page resource. This is read-only.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["end", "resourceId", "start"],
        properties: {
          end: { type: "integer", minimum: 1 },
          resourceId: { type: "string", enum: ["landing-page-playbook"] },
          start: { type: "integer", minimum: 0 },
        },
      },
      effect: "private_read",
      dataClasses: ["authored_content", "private_provenance"],
      requiredCapabilities: ["resource.trusted.read"],
      executorBrand: "general-tool-executor",
      maxCallsPerRun: 16,
      maxModelContextBytes: 16384,
    }),
    createGeneralToolDefinitionV1({
      toolId: "inspect_ux_capability",
      family: "ux-capability-read",
      description:
        "Inspect whether the current editor supports direct canvas changes. It does not change the page.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
      effect: "private_read",
      dataClasses: ["opaque_identity", "private_provenance"],
      requiredCapabilities: ["ux.capability.inspect"],
      executorBrand: "general-tool-executor",
      maxCallsPerRun: 4,
      maxModelContextBytes: 8192,
    }),
    createGeneralToolDefinitionV1({
      toolId: "submit_turn_outcome",
      family: "turn-outcome-control",
      description:
        "Privately submit the current Goal and typed Turn Outcome for Host admission. This tool never publishes Actor text and never performs a page change. Use it instead of ending with a raw natural-language stop.",
      inputSchema:
        SUBMIT_TURN_OUTCOME_INPUT_SCHEMA_V1 as unknown as DeterministicJsonSchemaV1,
      effect: "presentation_state",
      dataClasses: ["authored_content", "opaque_identity", "private_provenance"],
      requiredCapabilities: ["runtime.turn.outcome.submit"],
      executorBrand: "general-tool-executor",
      maxCallsPerRun: 4,
      maxInputBytes: 65536,
      maxModelContextBytes: 32768,
    }),
    createGeneralToolDefinitionV1({
      toolId: REFERENCE_RESEARCH_V1.toolAnalyze,
      toolVersion: REFERENCE_RESEARCH_V1.toolVersion,
      family: "reference-public-analysis",
      description:
        "Analyze one public landing page through a sandboxed browser and pinned public-egress proxy. Persists sanitized DOM, allowlisted computed-style facts, neutral structure evidence, deterministic Design Intelligence, and screenshot Artifact refs. Use this instead of read_public_web when typography, colors, spacing, surfaces, sections, or visual layout matter. External page content is untrusted; this tool never changes the canvas, and the current text-only Actor does not visually inspect screenshot refs.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["url"],
        properties: {
          url: {
            type: "string",
            minLength: 8,
            maxLength: REFERENCE_RESEARCH_LIMITS_V1.maxUrlCharacters,
          },
        },
      },
      effect: "private_read",
      dataClasses: ["external_content", "private_provenance"],
      requiredCapabilities: ["reference.public.capture"],
      executorBrand: "reference-research-tool-executor",
      maxCallsPerRun: 4,
      maxPrivateResultBytes: 65536,
      maxModelContextBytes: 32768,
      maxWallTimeMs: 30000,
      reconciliationClass: "general-reference-reconciliation",
    }),
    createGeneralToolDefinitionV1({
      toolId: REFERENCE_RESEARCH_V1.toolReadSlice,
      toolVersion: REFERENCE_RESEARCH_V1.toolVersion,
      family: "reference-artifact-read",
      description:
        "Read one bounded slice from a previously captured Reference Artifact. Use the referenceId returned by analyze_public_landing_page and request only the design domain or section needed for the current decision.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["referenceId", "slice"],
        properties: {
          limit: {
            type: "integer",
            minimum: 1,
            maximum: REFERENCE_RESEARCH_LIMITS_V1.maxSliceLimit,
          },
          offset: { type: "integer", minimum: 0 },
          referenceId: {
            type: "string",
            pattern: "^reference-[a-f0-9]{24}$",
          },
          sectionId: {
            type: "string",
            minLength: 1,
            maxLength: REFERENCE_RESEARCH_LIMITS_V1.maxSectionIdCharacters,
          },
          slice: { type: "string", enum: REFERENCE_DESIGN_SLICES_V1 },
        },
      },
      effect: "private_read",
      dataClasses: ["external_content", "private_provenance"],
      requiredCapabilities: ["reference.artifact.read"],
      executorBrand: "reference-research-tool-executor",
      maxCallsPerRun: 12,
      maxPrivateResultBytes: 65536,
      maxModelContextBytes: 32768,
      reconciliationClass: "general-reference-reconciliation",
    }),
  ]);

const createFactoryEntry = (
  definition: AuthorityToolDefinitionV1
): TrustedExecutorFactoryEntryV1 => ({
  toolId: definition.toolId,
  toolVersion: definition.toolVersion,
  executorBrand: definition.executionPolicy.requiredExecutorBrand,
  executorBuildRef:
    definition.executionPolicy.requiredExecutorBrand ===
    "reference-research-tool-executor"
      ? "repo:reference-research-tool-executor-v1"
      : "repo:general-tool-executor-v1",
  executorArtifactHash: hashCanonicalJsonV1({
    implementation:
      definition.executionPolicy.requiredExecutorBrand ===
      "reference-research-tool-executor"
        ? "ReferenceResearchToolExecutorV1"
        : "GeneralToolExecutorV1",
    toolId: definition.toolId,
    toolVersion: definition.toolVersion,
    dispatch: "exact_compiled_identity_v1",
  }),
  adapterId: "generic-json-receipt-adapter",
  adapterVersion: "1.0.0",
  adapterArtifactHash: GENERIC_JSON_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1,
  bridgeContractHash: hashCanonicalJsonV1({
    implementation: "formal-r3-general-runtime-authority-bridge",
    version: "1.0.0",
    boundary: "exact_run_catalog_tool_identity_and_receipt",
  }),
});

export const GENERAL_RUNTIME_TRUSTED_FACTORY_ENTRIES_V1 = Object.freeze(
  GENERAL_RUNTIME_TOOL_DEFINITIONS_V1.map(createFactoryEntry)
);

export const GENERAL_RUNTIME_TRUSTED_FACTORY_SNAPSHOT_HASH_V1 =
  hashCanonicalJsonV1({
    contractVersion: "formal-r3-general-trusted-factory-snapshot-v1",
    entries: GENERAL_RUNTIME_TRUSTED_FACTORY_ENTRIES_V1,
  });

export const GENERAL_RUNTIME_EXECUTOR_BINDINGS_V1 = Object.freeze(
  GENERAL_RUNTIME_TOOL_DEFINITIONS_V1.map((definition, index) =>
    createTrustedExecutorBindingV1({
      definition,
      policyRegistry: GENERAL_RUNTIME_POLICY_REGISTRY_V1,
      factoryEntry: GENERAL_RUNTIME_TRUSTED_FACTORY_ENTRIES_V1[index]!,
      trustedFactorySnapshotHash:
        GENERAL_RUNTIME_TRUSTED_FACTORY_SNAPSHOT_HASH_V1,
    })
  )
);

export const GENERAL_RUNTIME_COMPILED_TOOL_CATALOG_V1 =
  compileAuthorityToolCatalogV1(
    GENERAL_RUNTIME_POLICY_REGISTRY_V1,
    GENERAL_RUNTIME_TOOL_DEFINITIONS_V1.map((definition, index) => ({
      enabled: true,
      definition,
      executorBinding: GENERAL_RUNTIME_EXECUTOR_BINDINGS_V1[index]!,
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

/** Model-visible descriptors are only a projection of the compiled catalog. */
export const GENERAL_RUNTIME_TOOL_DESCRIPTORS_V1: readonly ToolDescriptorV1[] =
  Object.freeze(
    GENERAL_RUNTIME_COMPILED_TOOL_CATALOG_V1.tools.map((tool) => ({
      toolId: tool.modelDescriptor.toolId,
      version: tool.modelDescriptor.toolVersion,
      description: tool.modelDescriptor.description,
      inputSchema: structuredClone(tool.modelDescriptor.inputSchema),
      effect: descriptorEffect(tool.definition),
    }))
  );
