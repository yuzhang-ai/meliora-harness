import type {
  AuthorityToolDefinitionV1,
  CompiledPublicProjectionV1,
} from "./authority-fabric-contracts";
import { FORMAL_R3_AUTHORITY_FABRIC_V1 } from "./authority-fabric-contracts";
import {
  decodeToolInvocationReceiptV1,
  type ToolInvocationReceiptV1,
} from "./contracts";
import {
  DETERMINISTIC_SCHEMA_INSTANCE_VALIDATOR_HASH_V1,
  decodeDeterministicJsonValueV1,
} from "./authority-fabric-schema";
import { canonicalJsonV1, hashCanonicalJsonV1 } from "./strict-json";
import {
  R2_SELECTION_C0_V1,
  decodeR2SelectionC0ResultV1,
} from "./r2-selection-c0-contract";

export class AuthorityPrivateProjectionErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AuthorityPrivateProjectionErrorV1";
  }
}

export const H1_ARGUMENT_PROJECTION_ID_V1 = "h1-argument-opaque";
export const H1_MODEL_PROJECTION_ID_V1 = "h1-model-effective-facts";
export const H1_PUBLIC_PROJECTION_ID_V1 = "h1-public-opaque";
export const STRICT_JSON_ARGUMENT_PROJECTION_ID_V1 =
  "strict-json-argument-v1";
export const GENERIC_JSON_MODEL_PROJECTION_ID_V1 =
  "generic-json-observation-v1";
export const OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_ID_V1 =
  "opaque-public-lifecycle-v1";
export const R2_SELECTION_C0_MODEL_PROJECTION_ID_V1 =
  "r2-selection-c0-model-v1";

export const ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1 =
  hashCanonicalJsonV1({
    version: "formal-r3-h1-authority-argument-projection-v1",
    projectionId: H1_ARGUMENT_PROJECTION_ID_V1,
    schemaInstanceValidatorHash:
      DETERMINISTIC_SCHEMA_INSTANCE_VALIDATOR_HASH_V1,
    projection: "strict_input_schema_canonical_clone_v1",
    budget: "definition_max_input_bytes_v1",
  });

export const MODEL_PROJECTION_IMPLEMENTATION_HASH_V1 = hashCanonicalJsonV1({
  version: "formal-r3-h1-effective-facts-model-projection-v3",
  projectionId: H1_MODEL_PROJECTION_ID_V1,
  schemaInstanceValidatorHash: DETERMINISTIC_SCHEMA_INSTANCE_VALIDATOR_HASH_V1,
  privateProjection:
    "receipt_observation_to_bounded_allowlisted_facts_json_with_opaque_ref_v1",
  receiptEnvelopeBinding:
    "compiled_tool_actual_receipt_id_source_hash_status_observation_indivisible_v1",
  budget: "definition_max_model_context_bytes_v1",
});

// B0/B1 receipts remain verifiable after the B2 projection gains bounded
// model facts. This is an explicit registered legacy implementation, not a
// fallback: an unknown hash still fails closed.
export const LEGACY_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1 =
  hashCanonicalJsonV1({
    version: "formal-r3-h1-effective-facts-model-projection-v2",
    projectionId: H1_MODEL_PROJECTION_ID_V1,
    schemaInstanceValidatorHash:
      DETERMINISTIC_SCHEMA_INSTANCE_VALIDATOR_HASH_V1,
    privateProjection:
      "contentRef_to_observationRef_resultHash_to_observationHash_v1",
    receiptEnvelopeBinding:
      "compiled_tool_actual_receipt_id_source_hash_status_observation_indivisible_v1",
    budget: "definition_max_model_context_bytes_v1",
  });

export const PUBLIC_PROJECTION_IMPLEMENTATION_HASH_V1 = hashCanonicalJsonV1({
  version: "formal-r3-authority-public-lifecycle-projection-v2",
  contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.opaquePublicLifecycleEvent,
  toolKeys: [
    "contractVersion",
    "kind",
    "toolId",
    "toolVersion",
    "status",
    "receiptId",
    "detailRef",
    "projectionHash",
    "eventHash",
  ],
  skillKeys: [
    "contractVersion",
    "kind",
    "status",
    "receiptId",
    "detailRef",
    "eventHash",
  ],
  unavailableKeys: [
    "contractVersion",
    "kind",
    "status",
    "receiptId",
    "detailRef",
    "deliveryTemplateId",
    "deliveryTemplateVersion",
    "eventHash",
  ],
  projection: "closed_opaque_default_deny",
  privateSourceBinding:
    "exact_h1_receipt_id_hash_status_private_payload_compiled_tool_schema_budget_v1",
  publicPayload:
    "definition_public_event_schema_and_full_event_byte_budget_v1",
  detailReference: "receipt_and_private_payload_hash_derived_v1",
  unavailableDelivery: "exact_registered_template_identity_and_text_v1",
  hostileDecode: "closed_status_kind_version_and_hash_v1",
  contextualReplay:
    "host_resolved_actual_receipt_or_unavailable_source_recompute_v1",
  standaloneAuthority:
    "raw_structural_projectors_internal_authoritative_create_verify_require_host_authority_run_turn_v1",
  offlineRunThreadSse:
    "host_authority_bound_run_turn_thread_context_recompute_with_count_and_byte_bounds_v1",
});

export const STRICT_JSON_ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1 =
  hashCanonicalJsonV1({
    version: "formal-r3-strict-json-argument-projection-v1",
    projectionId: STRICT_JSON_ARGUMENT_PROJECTION_ID_V1,
    schemaInstanceValidatorHash:
      DETERMINISTIC_SCHEMA_INSTANCE_VALIDATOR_HASH_V1,
    projection: "strict_input_schema_canonical_clone_v1",
    budget: "definition_max_input_bytes_v1",
  });

export const GENERIC_JSON_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1 =
  hashCanonicalJsonV1({
    version: "formal-r3-generic-json-model-projection-v1",
    projectionId: GENERIC_JSON_MODEL_PROJECTION_ID_V1,
    schemaInstanceValidatorHash:
      DETERMINISTIC_SCHEMA_INSTANCE_VALIDATOR_HASH_V1,
    privateProjection:
      "receipt_observation_to_canonical_json_or_typed_status_json_v1",
    receiptEnvelopeBinding:
      "compiled_tool_actual_receipt_id_source_hash_status_observation_indivisible_v1",
    budget: "definition_max_model_context_bytes_v1",
  });

export const R2_SELECTION_C0_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1 =
  hashCanonicalJsonV1({
    version: "formal-r3-r2-selection-c0-model-projection-v1",
    projectionId: R2_SELECTION_C0_MODEL_PROJECTION_ID_V1,
    sourceResultContract: R2_SELECTION_C0_V1.resultVersion,
    projection:
      "strict_result_decode_then_rebuild_allowlisted_selection_json_v1",
    receiptEnvelopeBinding:
      "exact_tool_version_receipt_id_hash_status_observation_indivisible_v1",
    publicProjection: "opaque_lifecycle_only",
  });

export const OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_IMPLEMENTATION_HASH_V1 =
  hashCanonicalJsonV1({
    version: "formal-r3-opaque-public-lifecycle-projection-v1",
    projectionId: OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_ID_V1,
    implementationHash: PUBLIC_PROJECTION_IMPLEMENTATION_HASH_V1,
    projection: "closed_opaque_default_deny_no_observation_v1",
  });

export const H1_EFFECTIVE_FACTS_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1 =
  hashCanonicalJsonV1({
    version: "formal-r3-h1-effective-facts-receipt-adapter-v3",
    sourceContract: "landing-page-tool-invocation-receipt-v1",
    toolId: "canvas_inspect",
    toolVersion: "h1-effective-facts-inspect-v1",
    projection:
      "resultRef_resultHash_plus_sanitized_model_facts_json_v1",
    binding:
      "receiptId_sourceReceiptHash_publicStatus_privatePayload_indivisible_v1",
    statusMap: {
      completed: "completed",
      denied: "denied",
      unavailable: "unavailable",
      schema_invalid: "failed",
      transport_unknown: "failed",
      failed: "failed",
    },
    privateSchema: "definition_bound_deterministic_instance_validation_v1",
    budget: "definition_max_private_result_bytes_v1",
  });

export const GENERIC_JSON_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1 =
  hashCanonicalJsonV1({
    version: "formal-r3-generic-json-receipt-adapter-v1",
    sourceContract: "landing-page-tool-invocation-receipt-v1",
    projection:
      "resultRef_resultHash_plus_canonical_observation_json_v1",
    statusMap: {
      completed: "completed",
      denied: "denied",
      unavailable: "unavailable",
      schema_invalid: "failed",
      transport_unknown: "failed",
      failed: "failed",
    },
    privateSchema: "definition_bound_deterministic_instance_validation_v1",
    budget: "definition_max_private_result_bytes_v1",
  });

export const R2_SELECTION_C0_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1 =
  hashCanonicalJsonV1({
    version: "formal-r3-r2-selection-c0-receipt-adapter-v1",
    sourceContract: "landing-page-tool-invocation-receipt-v1",
    toolId: R2_SELECTION_C0_V1.toolId,
    toolVersion: R2_SELECTION_C0_V1.toolVersion,
    resultContract: R2_SELECTION_C0_V1.resultVersion,
    projection:
      "completed_observation_strict_decode_to_selection_json_status_otherwise_typed_status_v1",
    privateSchema: "definition_bound_deterministic_instance_validation_v1",
  });

export type H1AuthorityReceiptProjectionV1 = Readonly<{
  receiptId: string;
  sourceReceiptHash: string;
  publicStatus: "completed" | "unavailable" | "denied" | "failed";
  privatePayload: unknown;
}>;

export type AuthorityReceiptProjectionV1 = H1AuthorityReceiptProjectionV1;

const projectH1ModelFactsJsonV1 = (observation: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(observation) as unknown;
  } catch {
    throw new AuthorityPrivateProjectionErrorV1(
      "h1_effective_facts_receipt_observation_invalid",
      "The H1 receipt observation is not valid JSON."
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AuthorityPrivateProjectionErrorV1(
      "h1_effective_facts_receipt_observation_invalid",
      "The H1 receipt observation is not a JSON object."
    );
  }
  const value = parsed as Record<string, unknown>;
  if (value.kind === "h1_effective_facts_inspect_result") {
    const provenance = value.provenance;
    if (
      !provenance ||
      typeof provenance !== "object" ||
      Array.isArray(provenance) ||
      typeof value.contractVersion !== "string" ||
      !["summary", "selection", "nodes"].includes(String(value.scope))
    ) {
      throw new AuthorityPrivateProjectionErrorV1(
        "h1_effective_facts_receipt_observation_invalid",
        "The H1 completed observation does not match the installed result shape."
      );
    }
    const source = provenance as Record<string, unknown>;
    const safeSource = {
      freshness: source.freshness,
      routePath: source.routePath,
      captureProfile: source.captureProfile,
      documentId: source.documentId,
      viewport: source.viewport,
      observedAt: source.observedAt,
    };
    if (Object.values(safeSource).some((item) => typeof item !== "string")) {
      throw new AuthorityPrivateProjectionErrorV1(
        "h1_effective_facts_receipt_observation_invalid",
        "The H1 completed observation is missing safe source identity."
      );
    }
    return canonicalJsonV1({
      kind: value.kind,
      contractVersion: value.contractVersion,
      scope: value.scope,
      source: safeSource,
      facts: value.payload,
    });
  }
  if (
    value.kind === "h1_effective_facts_inspect_unavailable" ||
    value.kind === "h1_effective_facts_inspect_error"
  ) {
    if (typeof value.code !== "string") {
      throw new AuthorityPrivateProjectionErrorV1(
        "h1_effective_facts_receipt_observation_invalid",
        "The H1 unavailable observation is missing its reason code."
      );
    }
    return canonicalJsonV1({
      kind: value.kind,
      code: value.code,
      ...(typeof value.truthfulNextStep === "string"
        ? { truthfulNextStep: value.truthfulNextStep }
        : {}),
    });
  }
  throw new AuthorityPrivateProjectionErrorV1(
    "h1_effective_facts_receipt_observation_invalid",
    "The H1 receipt observation kind is not installed."
  );
};

const canonicalByteLength = (value: unknown) =>
  new TextEncoder().encode(canonicalJsonV1(value)).byteLength;

export const assertRegisteredPrivateProjectorClosureV1 = (
  definition: AuthorityToolDefinitionV1
) => {
  const h1 =
    definition.projectionPolicy.argumentProjectionId ===
      H1_ARGUMENT_PROJECTION_ID_V1 &&
    definition.projectionPolicy.argumentProjectorImplementationHash ===
      ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1 &&
    definition.projectionPolicy.modelProjectionId ===
      H1_MODEL_PROJECTION_ID_V1 &&
    [
      MODEL_PROJECTION_IMPLEMENTATION_HASH_V1,
      LEGACY_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1,
    ].includes(definition.projectionPolicy.modelProjectorImplementationHash);
  const generic =
    definition.projectionPolicy.argumentProjectionId ===
      STRICT_JSON_ARGUMENT_PROJECTION_ID_V1 &&
    definition.projectionPolicy.argumentProjectorImplementationHash ===
      STRICT_JSON_ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1 &&
    definition.projectionPolicy.modelProjectionId ===
      GENERIC_JSON_MODEL_PROJECTION_ID_V1 &&
    definition.projectionPolicy.modelProjectorImplementationHash ===
      GENERIC_JSON_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1;
  const r2Selection =
    definition.projectionPolicy.argumentProjectionId ===
      STRICT_JSON_ARGUMENT_PROJECTION_ID_V1 &&
    definition.projectionPolicy.argumentProjectorImplementationHash ===
      STRICT_JSON_ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1 &&
    definition.projectionPolicy.modelProjectionId ===
      R2_SELECTION_C0_MODEL_PROJECTION_ID_V1 &&
    definition.projectionPolicy.modelProjectorImplementationHash ===
      R2_SELECTION_C0_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1;
  if (!h1 && !generic && !r2Selection) {
    throw new AuthorityPrivateProjectionErrorV1(
      "authority_private_projector_registry_drift",
      "Argument and model projectors must match the server-owned implementation registry."
    );
  }
  return true;
};

export const assertRegisteredPublicProjectorClosureV1 = (
  projection: Readonly<
    Pick<
      CompiledPublicProjectionV1,
      "publicProjectionId" | "publicProjectorImplementationHash"
    >
  >
) => {
  const h1 =
    projection.publicProjectionId === H1_PUBLIC_PROJECTION_ID_V1 &&
    projection.publicProjectorImplementationHash ===
      PUBLIC_PROJECTION_IMPLEMENTATION_HASH_V1;
  const generic =
    projection.publicProjectionId ===
      OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_ID_V1 &&
    projection.publicProjectorImplementationHash ===
      OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_IMPLEMENTATION_HASH_V1;
  if (!h1 && !generic) {
    throw new AuthorityPrivateProjectionErrorV1(
      "authority_public_projector_registry_drift",
      "Public projector must match the server-owned executable implementation registry."
    );
  }
  return true;
};

export const assertRegisteredProjectorClosureV1 = (
  definition: AuthorityToolDefinitionV1
) => {
  assertRegisteredPrivateProjectorClosureV1(definition);
  assertRegisteredPublicProjectorClosureV1(definition.projectionPolicy);
  return true;
};

export const projectAuthorityToolArgumentsV1 = (input: Readonly<{
  definition: AuthorityToolDefinitionV1;
  argumentsValue: unknown;
}>) => {
  assertRegisteredPrivateProjectorClosureV1(input.definition);
  const projected = decodeDeterministicJsonValueV1(
    input.definition.inputSchema,
    input.argumentsValue,
    "authorityToolArguments"
  );
  if (canonicalByteLength(projected) > input.definition.budgets.maxInputBytes) {
    throw new AuthorityPrivateProjectionErrorV1(
      "authority_argument_projection_budget_exceeded",
      "Projected Tool arguments exceed the definition input byte budget."
    );
  }
  return structuredClone(projected);
};

export const projectAuthorityToolPrivateResultV1 = (input: Readonly<{
  definition: AuthorityToolDefinitionV1;
  privatePayload: unknown;
}>) => {
  assertRegisteredProjectorClosureV1(input.definition);
  const projected = decodeDeterministicJsonValueV1(
    input.definition.privateResultSchema,
    input.privatePayload,
    "authorityToolPrivateResult"
  );
  if (
    canonicalByteLength(projected) >
    input.definition.budgets.maxPrivateResultBytes
  ) {
    throw new AuthorityPrivateProjectionErrorV1(
      "authority_private_result_projection_budget_exceeded",
      "Projected private Tool result exceeds the definition byte budget."
    );
  }
  return structuredClone(projected);
};

export const adaptH1EffectiveFactsReceiptToAuthorityPrivateResultV1 = (
  input: Readonly<{
    definition: AuthorityToolDefinitionV1;
    receipt: ToolInvocationReceiptV1;
  }>
): H1AuthorityReceiptProjectionV1 => {
  const receipt = decodeToolInvocationReceiptV1(input.receipt);
  if (
    receipt.toolId !== input.definition.toolId ||
    receipt.toolVersion !== input.definition.toolVersion ||
    receipt.toolId !== "canvas_inspect" ||
    receipt.toolVersion !== "h1-effective-facts-inspect-v1"
  ) {
    throw new AuthorityPrivateProjectionErrorV1(
      "h1_effective_facts_receipt_adapter_identity_mismatch",
      "The H1 receipt adapter only accepts the exact frozen canvas_inspect executor receipt."
    );
  }
  const legacyProjection =
    input.definition.projectionPolicy.modelProjectorImplementationHash ===
    LEGACY_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1;
  const privatePayload = projectAuthorityToolPrivateResultV1({
    definition: input.definition,
    privatePayload: legacyProjection
      ? {
          contentRef: receipt.resultRef,
          resultHash: receipt.resultHash,
        }
      : {
          contentRef: receipt.resultRef,
          modelFactsJson: projectH1ModelFactsJsonV1(receipt.observation),
          resultHash: receipt.resultHash,
        },
  });
  const publicStatus =
    receipt.status === "completed" ||
    receipt.status === "unavailable" ||
    receipt.status === "denied"
      ? receipt.status
      : "failed";
  return {
    receiptId: receipt.receiptId,
    sourceReceiptHash: hashCanonicalJsonV1(receipt),
    publicStatus,
    privatePayload,
  };
};

const canonicalGenericObservationJsonV1 = (
  receipt: ToolInvocationReceiptV1
) => {
  try {
    return canonicalJsonV1(JSON.parse(receipt.observation) as unknown);
  } catch {
    return canonicalJsonV1({
      kind: "tool_status",
      status: receipt.status,
      message: receipt.observation,
    });
  }
};

export const adaptGenericJsonReceiptToAuthorityPrivateResultV1 = (
  input: Readonly<{
    definition: AuthorityToolDefinitionV1;
    receipt: ToolInvocationReceiptV1;
  }>
): AuthorityReceiptProjectionV1 => {
  const receipt = decodeToolInvocationReceiptV1(input.receipt);
  if (
    receipt.toolId !== input.definition.toolId ||
    receipt.toolVersion !== input.definition.toolVersion ||
    input.definition.projectionPolicy.modelProjectionId !==
      GENERIC_JSON_MODEL_PROJECTION_ID_V1
  ) {
    throw new AuthorityPrivateProjectionErrorV1(
      "generic_json_receipt_adapter_identity_mismatch",
      "The generic JSON receipt adapter requires the exact compiled Tool identity."
    );
  }
  const privatePayload = projectAuthorityToolPrivateResultV1({
    definition: input.definition,
    privatePayload: {
      contentRef: receipt.resultRef,
      observationJson: canonicalGenericObservationJsonV1(receipt),
      resultHash: receipt.resultHash,
    },
  });
  const publicStatus =
    receipt.status === "completed" ||
    receipt.status === "unavailable" ||
    receipt.status === "denied"
      ? receipt.status
      : "failed";
  return {
    receiptId: receipt.receiptId,
    sourceReceiptHash: hashCanonicalJsonV1(receipt),
    publicStatus,
    privatePayload,
  };
};

const projectR2SelectionC0ReceiptJsonV1 = (
  receipt: ToolInvocationReceiptV1
) => {
  if (receipt.status !== "completed") {
    return canonicalJsonV1({
      kind: "r2_selection_c0_status",
      status: receipt.status,
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(receipt.observation) as unknown;
  } catch {
    throw new AuthorityPrivateProjectionErrorV1(
      "r2_selection_c0_receipt_observation_invalid",
      "The completed R2 selection receipt observation is not JSON."
    );
  }
  try {
    return canonicalJsonV1(decodeR2SelectionC0ResultV1(parsed));
  } catch {
    throw new AuthorityPrivateProjectionErrorV1(
      "r2_selection_c0_receipt_observation_invalid",
      "The completed R2 selection receipt observation exceeds its exact allowlist."
    );
  }
};

export const adaptR2SelectionC0ReceiptToAuthorityPrivateResultV1 = (
  input: Readonly<{
    definition: AuthorityToolDefinitionV1;
    receipt: ToolInvocationReceiptV1;
  }>
): AuthorityReceiptProjectionV1 => {
  const receipt = decodeToolInvocationReceiptV1(input.receipt);
  if (
    receipt.toolId !== R2_SELECTION_C0_V1.toolId ||
    receipt.toolVersion !== R2_SELECTION_C0_V1.toolVersion ||
    receipt.toolId !== input.definition.toolId ||
    receipt.toolVersion !== input.definition.toolVersion ||
    input.definition.projectionPolicy.modelProjectionId !==
      R2_SELECTION_C0_MODEL_PROJECTION_ID_V1 ||
    input.definition.evidencePolicy.receiptType !==
      "r2-selection-c0-receipt"
  ) {
    throw new AuthorityPrivateProjectionErrorV1(
      "r2_selection_c0_receipt_adapter_identity_mismatch",
      "The R2 selection adapter accepts only the exact compiled Tool and receipt identity."
    );
  }
  const privatePayload = projectAuthorityToolPrivateResultV1({
    definition: input.definition,
    privatePayload: {
      contentRef: receipt.resultRef,
      resultHash: receipt.resultHash,
      selectionJson: projectR2SelectionC0ReceiptJsonV1(receipt),
    },
  });
  const publicStatus =
    receipt.status === "completed" ||
    receipt.status === "unavailable" ||
    receipt.status === "denied"
      ? receipt.status
      : "failed";
  return {
    receiptId: receipt.receiptId,
    sourceReceiptHash: hashCanonicalJsonV1(receipt),
    publicStatus,
    privatePayload,
  };
};

export const adaptAuthorityToolReceiptToPrivateResultV1 = (
  input: Readonly<{
    definition: AuthorityToolDefinitionV1;
    receipt: ToolInvocationReceiptV1;
  }>
): AuthorityReceiptProjectionV1 =>
  input.definition.projectionPolicy.modelProjectionId ===
  H1_MODEL_PROJECTION_ID_V1
    ? adaptH1EffectiveFactsReceiptToAuthorityPrivateResultV1(input)
    : input.definition.projectionPolicy.modelProjectionId ===
        R2_SELECTION_C0_MODEL_PROJECTION_ID_V1
      ? adaptR2SelectionC0ReceiptToAuthorityPrivateResultV1(input)
      : adaptGenericJsonReceiptToAuthorityPrivateResultV1(input);

export const projectAuthorityToolModelObservationV1 = (input: Readonly<{
  definition: AuthorityToolDefinitionV1;
  privatePayload: unknown;
}>) => {
  assertRegisteredProjectorClosureV1(input.definition);
  const privatePayload = projectAuthorityToolPrivateResultV1(input) as Readonly<
    Record<string, unknown>
  >;
  const genericProjection =
    input.definition.projectionPolicy.modelProjectionId ===
    GENERIC_JSON_MODEL_PROJECTION_ID_V1;
  const r2SelectionProjection =
    input.definition.projectionPolicy.modelProjectionId ===
    R2_SELECTION_C0_MODEL_PROJECTION_ID_V1;
  const legacyProjection =
    input.definition.projectionPolicy.modelProjectorImplementationHash ===
    LEGACY_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1;
  if (genericProjection || r2SelectionProjection) {
    const jsonField = r2SelectionProjection
      ? privatePayload.selectionJson
      : privatePayload.observationJson;
    if (
      typeof privatePayload.contentRef !== "string" ||
      typeof privatePayload.resultHash !== "string" ||
      typeof jsonField !== "string"
    ) {
      throw new AuthorityPrivateProjectionErrorV1(
        "authority_model_projection_private_shape_mismatch",
        "The JSON model projector requires its exact frozen private result shape."
      );
    }
    const projected = decodeDeterministicJsonValueV1(
      input.definition.modelObservationSchema,
      r2SelectionProjection
        ? {
            selectionJson: jsonField,
            observationHash: privatePayload.resultHash,
            observationRef: privatePayload.contentRef,
          }
        : {
            observationJson: jsonField,
            observationHash: privatePayload.resultHash,
            observationRef: privatePayload.contentRef,
          },
      "authorityToolModelObservation"
    );
    if (
      canonicalByteLength(projected) >
      input.definition.budgets.maxModelContextBytes
    ) {
      throw new AuthorityPrivateProjectionErrorV1(
        "authority_model_projection_budget_exceeded",
        "Projected model observation exceeds the definition model-context byte budget."
      );
    }
    return structuredClone(projected);
  }
  if (
    typeof privatePayload.contentRef !== "string" ||
    typeof privatePayload.resultHash !== "string" ||
    (!legacyProjection && typeof privatePayload.modelFactsJson !== "string")
  ) {
    throw new AuthorityPrivateProjectionErrorV1(
      "authority_model_projection_private_shape_mismatch",
      "The H1 model projector requires the frozen Effective Facts private result shape."
    );
  }
  const projected = decodeDeterministicJsonValueV1(
    input.definition.modelObservationSchema,
    legacyProjection
      ? {
          observationHash: privatePayload.resultHash,
          observationRef: privatePayload.contentRef,
        }
      : {
          factsJson: privatePayload.modelFactsJson,
          observationHash: privatePayload.resultHash,
          observationRef: privatePayload.contentRef,
        },
    "authorityToolModelObservation"
  );
  if (
    canonicalByteLength(projected) >
    input.definition.budgets.maxModelContextBytes
  ) {
    throw new AuthorityPrivateProjectionErrorV1(
      "authority_model_projection_budget_exceeded",
      "Projected model observation exceeds the definition model-context byte budget."
    );
  }
  return structuredClone(projected);
};

export const AUTHORITY_PRIVATE_PROJECTION_REGISTRY_HASH_V1 =
  hashCanonicalJsonV1({
    argument: {
      projectionId: H1_ARGUMENT_PROJECTION_ID_V1,
      implementationHash: ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1,
    },
    model: {
      projectionId: H1_MODEL_PROJECTION_ID_V1,
      implementationHash: MODEL_PROJECTION_IMPLEMENTATION_HASH_V1,
    },
    public: {
      projectionId: H1_PUBLIC_PROJECTION_ID_V1,
      implementationHash: PUBLIC_PROJECTION_IMPLEMENTATION_HASH_V1,
    },
    receiptAdapter: {
      adapterId: "h1-effective-facts-read-adapter",
      implementationHash:
        H1_EFFECTIVE_FACTS_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1,
    },
    generic: {
      argument: {
        projectionId: STRICT_JSON_ARGUMENT_PROJECTION_ID_V1,
        implementationHash:
          STRICT_JSON_ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1,
      },
      model: {
        projectionId: GENERIC_JSON_MODEL_PROJECTION_ID_V1,
        implementationHash:
          GENERIC_JSON_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1,
      },
      public: {
        projectionId: OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_ID_V1,
        implementationHash:
          OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_IMPLEMENTATION_HASH_V1,
      },
      receiptAdapterImplementationHash:
        GENERIC_JSON_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1,
    },
    r2SelectionC0: {
      argument: {
        projectionId: STRICT_JSON_ARGUMENT_PROJECTION_ID_V1,
        implementationHash:
          STRICT_JSON_ARGUMENT_PROJECTION_IMPLEMENTATION_HASH_V1,
      },
      model: {
        projectionId: R2_SELECTION_C0_MODEL_PROJECTION_ID_V1,
        implementationHash:
          R2_SELECTION_C0_MODEL_PROJECTION_IMPLEMENTATION_HASH_V1,
      },
      public: {
        projectionId: OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_ID_V1,
        implementationHash:
          OPAQUE_PUBLIC_LIFECYCLE_PROJECTION_IMPLEMENTATION_HASH_V1,
      },
      receiptAdapterImplementationHash:
        R2_SELECTION_C0_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1,
    },
  });

export const AUTHORITY_PROJECTOR_REGISTRY_HASH_V1 =
  AUTHORITY_PRIVATE_PROJECTION_REGISTRY_HASH_V1;
