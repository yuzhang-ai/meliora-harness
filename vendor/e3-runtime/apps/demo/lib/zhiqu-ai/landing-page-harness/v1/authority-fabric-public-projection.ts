import type {
  CapabilityUnavailableV1,
  CompiledAuthorityToolV1,
  CompiledPublicProjectionV1,
  SkillActivationReceiptV1,
  SkillActivationTransitionReceiptV1,
} from "./authority-fabric-contracts";
import { FORMAL_R3_AUTHORITY_FABRIC_V1 } from "./authority-fabric-contracts";
import type { ToolInvocationReceiptV1 } from "./contracts";
import {
  requiredEnumV1,
  requiredHashV1,
  requiredIdV1,
  requiredStringV1,
  strictRecordShapeV1,
} from "./authority-fabric-codecs";
import { decodeCapabilityUnavailableV1 } from "./authority-skill-compiler";
import {
  decodeSkillActivationReceiptV1,
  decodeSkillActivationTransitionReceiptV1,
} from "./authority-skill-lifecycle";
import { decodeCompiledAuthorityToolV1 } from "./authority-tool-compiler";
import { decodeDeterministicJsonValueV1 } from "./authority-fabric-schema";
import {
  PUBLIC_PROJECTION_IMPLEMENTATION_HASH_V1,
  adaptAuthorityToolReceiptToPrivateResultV1,
  assertRegisteredPublicProjectorClosureV1,
  projectAuthorityToolModelObservationV1,
} from "./authority-fabric-private-projection";
import { canonicalJsonV1, hashCanonicalJsonV1 } from "./strict-json";

export { PUBLIC_PROJECTION_IMPLEMENTATION_HASH_V1 } from "./authority-fabric-private-projection";

export const FORMAL_R3_PUBLIC_ENVELOPES_V1 = Object.freeze({
  toolPrivateResult: "formal-r3-tool-private-result-v1",
  toolModelObservation: "formal-r3-tool-model-observation-v1",
  toolPublicEvent: "formal-r3-tool-public-event-v1",
  skillPublicEvent: "formal-r3-skill-public-event-v1",
  unavailablePublicEvent: "formal-r3-unavailable-public-event-v1",
  offlineRunProjection: "formal-r3-offline-run-public-projection-v1",
  offlineThreadSnapshot: "formal-r3-offline-thread-public-snapshot-v1",
} as const);

export class AuthorityPublicProjectionErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AuthorityPublicProjectionErrorV1";
  }
}

export type ToolPrivateResultEnvelopeV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_PUBLIC_ENVELOPES_V1.toolPrivateResult;
  kind: "tool_private_result";
  toolId: string;
  toolVersion: string;
  receiptId: string;
  sourceReceiptHash: string;
  status: "completed" | "unavailable" | "denied" | "failed";
  resultHash: string;
  payload: unknown;
}>;

export type ToolModelObservationEnvelopeV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_PUBLIC_ENVELOPES_V1.toolModelObservation;
  kind: "tool_model_observation";
  toolId: string;
  toolVersion: string;
  receiptId: string;
  sourceReceiptHash: string;
  status: "completed" | "unavailable" | "denied" | "failed";
  observationHash: string;
  observation: unknown;
}>;

export type ToolInvocationStartedSourceV1 = Readonly<{
  runId: string;
  turnId: string;
  callId: string;
  catalogBindingHash: string;
  toolId: string;
  toolVersion: string;
  argumentsHash: string;
}>;

export type OpaquePublicLifecycleEventV1 =
  | Readonly<{
      contractVersion: typeof FORMAL_R3_PUBLIC_ENVELOPES_V1.toolPublicEvent;
      kind: "tool";
      toolId: string;
      toolVersion: string;
      status: "started" | "completed" | "unavailable" | "denied" | "failed";
      receiptId: string;
      detailRef: string;
      projectionHash: string;
      eventHash: string;
    }>
  | Readonly<{
      contractVersion: typeof FORMAL_R3_PUBLIC_ENVELOPES_V1.skillPublicEvent;
      kind: "skill_activation" | "skill_transition";
      status: "active" | "unavailable" | "completed" | "cancelled";
      receiptId: string;
      detailRef: string;
      eventHash: string;
    }>
  | Readonly<{
      contractVersion: typeof FORMAL_R3_PUBLIC_ENVELOPES_V1.unavailablePublicEvent;
      kind: "capability_unavailable" | "skill_unavailable";
      status: "unavailable";
      receiptId: string;
      detailRef: string;
      deliveryTemplateId: string;
      deliveryTemplateVersion: string;
      eventHash: string;
    }>;

const withEventHash = <T extends Readonly<Record<string, unknown>>>(material: T) =>
  ({ ...material, eventHash: hashCanonicalJsonV1(material) }) as T & {
    eventHash: string;
  };

const decodeCompiledPublicProjectionV1 = (
  value: unknown
): CompiledPublicProjectionV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "toolId",
      "toolVersion",
      "publicContractVersion",
      "argumentProjectionId",
      "modelProjectionId",
      "publicProjectionId",
      "argumentProjectorImplementationHash",
      "modelProjectorImplementationHash",
      "publicProjectorImplementationHash",
      "projectorBundleHash",
      "definitionHash",
      "policyRegistrySnapshotHash",
      "executorBindingHash",
    ],
    [],
    "compiledPublicProjection"
  );
  const projectorMaterial = {
    argumentProjectionId: requiredIdV1(
      record.argumentProjectionId,
      "compiledPublicProjection.argumentProjectionId"
    ),
    modelProjectionId: requiredIdV1(
      record.modelProjectionId,
      "compiledPublicProjection.modelProjectionId"
    ),
    publicProjectionId: requiredIdV1(
      record.publicProjectionId,
      "compiledPublicProjection.publicProjectionId"
    ),
    argumentProjectorImplementationHash: requiredHashV1(
      record.argumentProjectorImplementationHash,
      "compiledPublicProjection.argumentProjectorImplementationHash"
    ),
    modelProjectorImplementationHash: requiredHashV1(
      record.modelProjectorImplementationHash,
      "compiledPublicProjection.modelProjectorImplementationHash"
    ),
    publicProjectorImplementationHash: requiredHashV1(
      record.publicProjectorImplementationHash,
      "compiledPublicProjection.publicProjectorImplementationHash"
    ),
  } as const;
  if (
    new Set([
      projectorMaterial.argumentProjectionId,
      projectorMaterial.modelProjectionId,
      projectorMaterial.publicProjectionId,
    ]).size !== 3
  ) {
    throw new Error("public_projection_identity_overlap");
  }
  const projectorBundleHash = requiredHashV1(
    record.projectorBundleHash,
    "compiledPublicProjection.projectorBundleHash"
  );
  if (projectorBundleHash !== hashCanonicalJsonV1(projectorMaterial)) {
    throw new Error("public_projection_bundle_hash_drift");
  }
  const decoded = {
    toolId: requiredIdV1(record.toolId, "compiledPublicProjection.toolId"),
    toolVersion: requiredStringV1(
      record.toolVersion,
      "compiledPublicProjection.toolVersion",
      80
    ),
    publicContractVersion: requiredIdV1(
      record.publicContractVersion,
      "compiledPublicProjection.publicContractVersion"
    ),
    ...projectorMaterial,
    projectorBundleHash,
    definitionHash: requiredHashV1(
      record.definitionHash,
      "compiledPublicProjection.definitionHash"
    ),
    policyRegistrySnapshotHash: requiredHashV1(
      record.policyRegistrySnapshotHash,
      "compiledPublicProjection.policyRegistrySnapshotHash"
    ),
    executorBindingHash: requiredHashV1(
      record.executorBindingHash,
      "compiledPublicProjection.executorBindingHash"
    ),
  };
  assertRegisteredPublicProjectorClosureV1(decoded);
  return decoded;
};

export const createToolPrivateResultEnvelopeV1 = (input: Readonly<{
  tool: CompiledAuthorityToolV1;
  receipt: ToolInvocationReceiptV1;
}>): ToolPrivateResultEnvelopeV1 => {
  const tool = decodeCompiledAuthorityToolV1(input.tool);
  const adapted = adaptAuthorityToolReceiptToPrivateResultV1({
    definition: tool.definition,
    receipt: input.receipt,
  });
  return {
    contractVersion: FORMAL_R3_PUBLIC_ENVELOPES_V1.toolPrivateResult,
    kind: "tool_private_result",
    toolId: tool.definition.toolId,
    toolVersion: tool.definition.toolVersion,
    receiptId: adapted.receiptId,
    sourceReceiptHash: adapted.sourceReceiptHash,
    status: adapted.publicStatus,
    resultHash: hashCanonicalJsonV1(adapted.privatePayload),
    payload: adapted.privatePayload,
  };
};

export const decodeToolPrivateResultEnvelopeV1 = (
  value: unknown,
  toolInput: CompiledAuthorityToolV1,
  receipt: ToolInvocationReceiptV1
): ToolPrivateResultEnvelopeV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "contractVersion",
      "kind",
      "toolId",
      "toolVersion",
      "receiptId",
      "sourceReceiptHash",
      "status",
      "resultHash",
      "payload",
    ],
    [],
    "toolPrivateResult"
  );
  if (
    record.contractVersion !== FORMAL_R3_PUBLIC_ENVELOPES_V1.toolPrivateResult ||
    record.kind !== "tool_private_result"
  ) {
    throw new Error("tool_private_result_contract_mismatch");
  }
  const tool = decodeCompiledAuthorityToolV1(toolInput);
  const decoded = createToolPrivateResultEnvelopeV1({
    tool,
    receipt,
  });
  if (
    record.toolId !== decoded.toolId ||
    record.toolVersion !== decoded.toolVersion ||
    record.receiptId !== decoded.receiptId ||
    record.sourceReceiptHash !== decoded.sourceReceiptHash ||
    record.status !== decoded.status ||
    hashCanonicalJsonV1(record.payload) !== hashCanonicalJsonV1(decoded.payload) ||
    record.resultHash !== decoded.resultHash
  ) {
    throw new Error("tool_private_result_hash_drift");
  }
  return decoded;
};

export const createToolModelObservationEnvelopeV1 = (input: Readonly<{
  tool: CompiledAuthorityToolV1;
  receipt: ToolInvocationReceiptV1;
}>): ToolModelObservationEnvelopeV1 => {
  const tool = decodeCompiledAuthorityToolV1(input.tool);
  const adapted = adaptAuthorityToolReceiptToPrivateResultV1({
    definition: tool.definition,
    receipt: input.receipt,
  });
  const observation = projectAuthorityToolModelObservationV1({
    definition: tool.definition,
    privatePayload: adapted.privatePayload,
  });
  return {
    contractVersion: FORMAL_R3_PUBLIC_ENVELOPES_V1.toolModelObservation,
    kind: "tool_model_observation",
    toolId: tool.definition.toolId,
    toolVersion: tool.definition.toolVersion,
    receiptId: adapted.receiptId,
    sourceReceiptHash: adapted.sourceReceiptHash,
    status: adapted.publicStatus,
    observationHash: hashCanonicalJsonV1(observation),
    observation,
  };
};

export const decodeToolModelObservationEnvelopeV1 = (
  value: unknown,
  toolInput: CompiledAuthorityToolV1,
  receipt: ToolInvocationReceiptV1
): ToolModelObservationEnvelopeV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "contractVersion",
      "kind",
      "toolId",
      "toolVersion",
      "receiptId",
      "sourceReceiptHash",
      "status",
      "observationHash",
      "observation",
    ],
    [],
    "toolModelObservation"
  );
  if (
    record.contractVersion !==
      FORMAL_R3_PUBLIC_ENVELOPES_V1.toolModelObservation ||
    record.kind !== "tool_model_observation"
  ) {
    throw new Error("tool_model_observation_contract_mismatch");
  }
  const decoded = createToolModelObservationEnvelopeV1({
    tool: decodeCompiledAuthorityToolV1(toolInput),
    receipt,
  });
  if (
    record.toolId !== decoded.toolId ||
    record.toolVersion !== decoded.toolVersion ||
    record.receiptId !== decoded.receiptId ||
    record.sourceReceiptHash !== decoded.sourceReceiptHash ||
    record.status !== decoded.status ||
    record.observationHash !== decoded.observationHash ||
    hashCanonicalJsonV1(record.observation) !==
      hashCanonicalJsonV1(decoded.observation)
  ) {
    throw new Error("tool_model_observation_hash_drift");
  }
  return decoded;
};

const projectOpaqueToolPublicEventFromSourceV1 = (input: Readonly<{
  tool: CompiledAuthorityToolV1;
  receipt: ToolInvocationReceiptV1;
}>): OpaquePublicLifecycleEventV1 => {
  const tool = decodeCompiledAuthorityToolV1(input.tool);
  const projection = decodeCompiledPublicProjectionV1(tool.publicProjection);
  const privateResult = createToolPrivateResultEnvelopeV1({
    tool,
    receipt: input.receipt,
  });
  const publicPayload = decodeDeterministicJsonValueV1(
    tool.definition.publicEventSchema,
    {
      detailRef: `tool-receipt:${privateResult.resultHash}`,
      receiptId: privateResult.receiptId,
      status: privateResult.status,
    },
    "authorityToolPublicEvent"
  ) as Readonly<{
    detailRef: string;
    receiptId: string;
    status: "started" | "completed" | "unavailable" | "denied" | "failed";
  }>;
  const event = withEventHash({
    contractVersion: FORMAL_R3_PUBLIC_ENVELOPES_V1.toolPublicEvent,
    kind: "tool" as const,
    toolId: projection.toolId,
    toolVersion: projection.toolVersion,
    status: requiredEnumV1(publicPayload.status, [
      "started",
      "completed",
      "unavailable",
      "denied",
      "failed",
    ] as const, "toolPublic.status"),
    receiptId: publicPayload.receiptId,
    detailRef: publicPayload.detailRef,
    projectionHash: hashCanonicalJsonV1(projection),
  });
  if (
    new TextEncoder().encode(canonicalJsonV1(event)).byteLength >
    tool.definition.budgets.maxPublicEventBytes
  ) {
    throw new AuthorityPublicProjectionErrorV1(
      "authority_public_event_budget_exceeded",
      "Projected public Tool event exceeds the definition byte budget."
    );
  }
  return event;
};

const decodeToolInvocationStartedSourceV1 = (
  value: unknown
): ToolInvocationStartedSourceV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "runId",
      "turnId",
      "callId",
      "catalogBindingHash",
      "toolId",
      "toolVersion",
      "argumentsHash",
    ],
    [],
    "toolInvocationStartedSource"
  );
  return {
    runId: requiredIdV1(record.runId, "toolInvocationStartedSource.runId"),
    turnId: requiredIdV1(record.turnId, "toolInvocationStartedSource.turnId"),
    callId: requiredIdV1(record.callId, "toolInvocationStartedSource.callId"),
    catalogBindingHash: requiredHashV1(
      record.catalogBindingHash,
      "toolInvocationStartedSource.catalogBindingHash"
    ),
    toolId: requiredIdV1(record.toolId, "toolInvocationStartedSource.toolId"),
    toolVersion: requiredStringV1(
      record.toolVersion,
      "toolInvocationStartedSource.toolVersion",
      80
    ),
    argumentsHash: requiredHashV1(
      record.argumentsHash,
      "toolInvocationStartedSource.argumentsHash"
    ),
  };
};

const projectOpaqueToolStartedPublicEventFromSourceV1 = (input: Readonly<{
  tool: CompiledAuthorityToolV1;
  invocation: ToolInvocationStartedSourceV1;
}>): OpaquePublicLifecycleEventV1 => {
  const tool = decodeCompiledAuthorityToolV1(input.tool);
  const invocation = decodeToolInvocationStartedSourceV1(input.invocation);
  const projection = decodeCompiledPublicProjectionV1(tool.publicProjection);
  if (
    invocation.toolId !== tool.definition.toolId ||
    invocation.toolVersion !== tool.definition.toolVersion ||
    invocation.toolId !== projection.toolId ||
    invocation.toolVersion !== projection.toolVersion
  ) {
    throw new AuthorityPublicProjectionErrorV1(
      "tool_started_compiled_identity_mismatch",
      "Tool started source differs from its exact compiled Tool identity."
    );
  }
  const sourceHash = hashCanonicalJsonV1({
    contractVersion: "formal-r3-tool-start-source-v1",
    ...invocation,
    compiledToolHash: tool.compiledHash,
    publicProjectionHash: hashCanonicalJsonV1(projection),
  });
  const event = withEventHash({
    contractVersion: FORMAL_R3_PUBLIC_ENVELOPES_V1.toolPublicEvent,
    kind: "tool" as const,
    toolId: projection.toolId,
    toolVersion: projection.toolVersion,
    status: "started" as const,
    receiptId: `tool-start-${sourceHash.slice(0, 24)}`,
    detailRef: `tool-start:${sourceHash}`,
    projectionHash: hashCanonicalJsonV1(projection),
  });
  if (
    new TextEncoder().encode(canonicalJsonV1(event)).byteLength >
    tool.definition.budgets.maxPublicEventBytes
  ) {
    throw new AuthorityPublicProjectionErrorV1(
      "authority_public_event_budget_exceeded",
      "Projected public Tool started event exceeds the definition byte budget."
    );
  }
  return event;
};

const projectOpaqueSkillActivationEventFromSourceV1 = (
  receipt: SkillActivationReceiptV1
): OpaquePublicLifecycleEventV1 => {
  const decoded = decodeSkillActivationReceiptV1(receipt);
  return withEventHash({
    contractVersion: FORMAL_R3_PUBLIC_ENVELOPES_V1.skillPublicEvent,
    kind: "skill_activation" as const,
    status: decoded.status,
    receiptId: decoded.skillActivationId,
    detailRef: `skill-receipt:${decoded.receiptHash}`,
  });
};

const projectOpaqueSkillTransitionEventFromSourceV1 = (
  receipt: SkillActivationTransitionReceiptV1
): OpaquePublicLifecycleEventV1 => {
  const decoded = decodeSkillActivationTransitionReceiptV1(receipt);
  return withEventHash({
    contractVersion: FORMAL_R3_PUBLIC_ENVELOPES_V1.skillPublicEvent,
    kind: "skill_transition" as const,
    status: decoded.nextState,
    receiptId: decoded.transitionReceiptId,
    detailRef: `skill-transition:${decoded.receiptHash}`,
  });
};

const projectOpaqueUnavailableEventFromSourceV1 = (
  fact: CapabilityUnavailableV1
): OpaquePublicLifecycleEventV1 => {
  const decoded = decodeCapabilityUnavailableV1(fact);
  return withEventHash({
    contractVersion: FORMAL_R3_PUBLIC_ENVELOPES_V1.unavailablePublicEvent,
    kind: decoded.kind,
    status: "unavailable" as const,
    receiptId: `unavailable-${decoded.factHash.slice(0, 24)}`,
    detailRef: `unavailable-fact:${decoded.factHash}`,
    deliveryTemplateId: decoded.canonicalDeliveryTemplateId,
    deliveryTemplateVersion: decoded.canonicalDeliveryTemplateVersion,
  });
};

const assertOpaqueDetailRefV1 = (
  value: unknown,
  prefix: "tool-start" | "tool-receipt" | "skill-receipt" | "skill-transition" | "unavailable-fact"
) => {
  const detailRef = requiredStringV1(value, "publicLifecycleEvent.detailRef", 128);
  if (!new RegExp(`^${prefix}:[a-f0-9]{64}$`, "u").test(detailRef)) {
    throw new Error("public_lifecycle_detail_ref_invalid");
  }
  return detailRef;
};

const decodeOpaquePublicLifecycleEventStructureV1 = (
  value: unknown
): OpaquePublicLifecycleEventV1 => {
  const header = strictRecordShapeV1(value, ["contractVersion", "kind"], [
    "toolId",
    "toolVersion",
    "status",
    "receiptId",
    "detailRef",
    "projectionHash",
    "deliveryTemplateId",
    "deliveryTemplateVersion",
    "eventHash",
  ], "publicLifecycleEvent");
  let keys: readonly string[];
  if (
    header.contractVersion === FORMAL_R3_PUBLIC_ENVELOPES_V1.toolPublicEvent &&
    header.kind === "tool"
  ) {
    keys = [
      "contractVersion",
      "kind",
      "toolId",
      "toolVersion",
      "status",
      "receiptId",
      "detailRef",
      "projectionHash",
      "eventHash",
    ];
  } else if (
    header.contractVersion === FORMAL_R3_PUBLIC_ENVELOPES_V1.skillPublicEvent &&
    (header.kind === "skill_activation" || header.kind === "skill_transition")
  ) {
    keys = [
      "contractVersion",
      "kind",
      "status",
      "receiptId",
      "detailRef",
      "eventHash",
    ];
  } else if (
    header.contractVersion === FORMAL_R3_PUBLIC_ENVELOPES_V1.unavailablePublicEvent &&
    (header.kind === "capability_unavailable" || header.kind === "skill_unavailable")
  ) {
    keys = [
      "contractVersion",
      "kind",
      "status",
      "receiptId",
      "detailRef",
      "deliveryTemplateId",
      "deliveryTemplateVersion",
      "eventHash",
    ];
  } else {
    throw new Error("public_lifecycle_projector_default_deny");
  }
  const record = strictRecordShapeV1(value, keys, [], "publicLifecycleEvent");
  const eventHash = requiredHashV1(record.eventHash, "publicLifecycleEvent.eventHash");
  const material = Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== "eventHash")
  );
  if (eventHash !== hashCanonicalJsonV1(material)) {
    throw new Error("public_lifecycle_event_hash_drift");
  }
  if (record.kind === "tool") {
    requiredIdV1(record.toolId, "publicLifecycleEvent.toolId");
    requiredIdV1(record.toolVersion, "publicLifecycleEvent.toolVersion");
    const status = requiredEnumV1(
      record.status,
      ["started", "completed", "unavailable", "denied", "failed"] as const,
      "publicLifecycleEvent.status"
    );
    requiredHashV1(record.projectionHash, "publicLifecycleEvent.projectionHash");
    assertOpaqueDetailRefV1(
      record.detailRef,
      status === "started" ? "tool-start" : "tool-receipt"
    );
  } else if (record.kind === "skill_activation") {
    requiredEnumV1(
      record.status,
      ["active", "unavailable"] as const,
      "publicLifecycleEvent.status"
    );
    assertOpaqueDetailRefV1(record.detailRef, "skill-receipt");
  } else if (record.kind === "skill_transition") {
    requiredEnumV1(
      record.status,
      ["completed", "cancelled"] as const,
      "publicLifecycleEvent.status"
    );
    assertOpaqueDetailRefV1(record.detailRef, "skill-transition");
  } else {
    requiredEnumV1(
      record.status,
      ["unavailable"] as const,
      "publicLifecycleEvent.status"
    );
    assertOpaqueDetailRefV1(record.detailRef, "unavailable-fact");
    const deliveryTemplateId = requiredIdV1(
      record.deliveryTemplateId,
      "publicLifecycleEvent.deliveryTemplateId"
    );
    const deliveryTemplateVersion = requiredStringV1(
      record.deliveryTemplateVersion,
      "publicLifecycleEvent.deliveryTemplateVersion",
      80
    );
    if (
      deliveryTemplateId !== "skill-capability-unavailable" ||
      deliveryTemplateVersion !== "1.0.0"
    ) {
      throw new Error("public_lifecycle_delivery_template_not_registered");
    }
  }
  requiredIdV1(record.receiptId, "publicLifecycleEvent.receiptId");
  return structuredClone(value) as OpaquePublicLifecycleEventV1;
};

export type PublicLifecycleSourceV1 =
  | Readonly<{
      kind: "tool_started";
      tool: CompiledAuthorityToolV1;
      invocation: ToolInvocationStartedSourceV1;
    }>
  | Readonly<{
      kind: "tool";
      tool: CompiledAuthorityToolV1;
      receipt: ToolInvocationReceiptV1;
    }>
  | Readonly<{
      kind: "skill_activation";
      receipt: SkillActivationReceiptV1;
    }>
  | Readonly<{
      kind: "skill_transition";
      receipt: SkillActivationTransitionReceiptV1;
    }>
  | Readonly<{
      kind: "unavailable";
      fact: CapabilityUnavailableV1;
    }>;

export type PublicLifecycleAuthorityV1 = Readonly<{
  resolveSource: (input: Readonly<{
    event: OpaquePublicLifecycleEventV1;
  }>) => PublicLifecycleSourceV1 | null;
  verifyRunContext: (input: Readonly<{
    source: PublicLifecycleSourceV1;
    runId: string;
    turnId: string;
  }>) => boolean;
  verifyThreadContext: (input: Readonly<{
    threadId: string;
    runId: string;
    turnId: string;
    eventHashes: readonly string[];
  }>) => boolean;
}>;

const projectOpaquePublicLifecycleEventFromSourceV1 = (
  source: PublicLifecycleSourceV1
): OpaquePublicLifecycleEventV1 =>
  source.kind === "tool_started"
    ? projectOpaqueToolStartedPublicEventFromSourceV1(source)
    : source.kind === "tool"
    ? projectOpaqueToolPublicEventFromSourceV1(source)
    : source.kind === "skill_activation"
      ? projectOpaqueSkillActivationEventFromSourceV1(source.receipt)
      : source.kind === "skill_transition"
        ? projectOpaqueSkillTransitionEventFromSourceV1(source.receipt)
        : projectOpaqueUnavailableEventFromSourceV1(source.fact);

export const verifyOpaquePublicLifecycleEventV1 = (input: Readonly<{
  event: unknown;
  authority: PublicLifecycleAuthorityV1;
  expectedRunContext: Readonly<{ runId: string; turnId: string }>;
}>) => {
  const event = decodeOpaquePublicLifecycleEventStructureV1(input.event);
  const source = input.authority.resolveSource({ event });
  if (!source) {
    throw new AuthorityPublicProjectionErrorV1(
      "public_lifecycle_contextual_source_unresolved",
      "Public lifecycle verification requires a Host-resolved trusted source."
    );
  }
  const expected = projectOpaquePublicLifecycleEventFromSourceV1(source);
  if (hashCanonicalJsonV1(event) !== hashCanonicalJsonV1(expected)) {
    throw new AuthorityPublicProjectionErrorV1(
      "public_lifecycle_contextual_source_drift",
      "Persisted public lifecycle event differs from its actual private Receipt, projection, or unavailable fact."
    );
  }
  if (
    !input.authority.verifyRunContext({
      source,
      ...input.expectedRunContext,
    })
  ) {
    throw new AuthorityPublicProjectionErrorV1(
      "public_lifecycle_contextual_run_drift",
      "Public lifecycle source belongs to a different Run or Turn."
    );
  }
  return event;
};

export const createAuthoritativePublicLifecycleEventV1 = (input: Readonly<{
  source: PublicLifecycleSourceV1;
  authority: PublicLifecycleAuthorityV1;
  context: Readonly<{ runId: string; turnId: string }>;
}>): OpaquePublicLifecycleEventV1 =>
  verifyOpaquePublicLifecycleEventV1({
    event: projectOpaquePublicLifecycleEventFromSourceV1(input.source),
    authority: input.authority,
    expectedRunContext: {
      runId: requiredIdV1(input.context.runId, "publicLifecycle.runId"),
      turnId: requiredIdV1(input.context.turnId, "publicLifecycle.turnId"),
    },
  });

export type OfflineRunPublicProjectionV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_PUBLIC_ENVELOPES_V1.offlineRunProjection;
  runId: string;
  turnId: string;
  events: readonly OpaquePublicLifecycleEventV1[];
  projectionHash: string;
}>;

export const OFFLINE_PUBLIC_REPLAY_LIMITS_V1 = Object.freeze({
  maxEventsPerRun: 128,
  maxRunBytes: 262_144,
  maxRunsPerThread: 64,
  maxThreadBytes: 2_097_152,
  maxSseFrameBytes: 32_768,
} as const);

export const createOfflineRunPublicProjectionV1 = (input: Readonly<{
  runId: string;
  turnId: string;
  events: readonly OpaquePublicLifecycleEventV1[];
  authority: PublicLifecycleAuthorityV1;
}>): OfflineRunPublicProjectionV1 => {
  if (input.events.length > OFFLINE_PUBLIC_REPLAY_LIMITS_V1.maxEventsPerRun) {
    throw new AuthorityPublicProjectionErrorV1(
      "offline_run_public_event_budget_exceeded",
      "Offline Run public projection exceeds its event-count budget."
    );
  }
  const runId = requiredIdV1(input.runId, "offlineRunPublic.runId");
  const turnId = requiredIdV1(input.turnId, "offlineRunPublic.turnId");
  const material = {
    contractVersion: FORMAL_R3_PUBLIC_ENVELOPES_V1.offlineRunProjection,
    runId,
    turnId,
    events: input.events.map((event) =>
      verifyOpaquePublicLifecycleEventV1({
        event,
        authority: input.authority,
        expectedRunContext: { runId, turnId },
      })
    ),
  } as const;
  const projection = {
    ...material,
    projectionHash: hashCanonicalJsonV1(material),
  };
  if (
    new TextEncoder().encode(canonicalJsonV1(projection)).byteLength >
    OFFLINE_PUBLIC_REPLAY_LIMITS_V1.maxRunBytes
  ) {
    throw new AuthorityPublicProjectionErrorV1(
      "offline_run_public_byte_budget_exceeded",
      "Offline Run public projection exceeds its byte budget."
    );
  }
  return projection;
};

export const decodeOfflineRunPublicProjectionV1 = (
  value: unknown,
  authority: PublicLifecycleAuthorityV1
): OfflineRunPublicProjectionV1 => {
  const record = strictRecordShapeV1(
    value,
    ["contractVersion", "runId", "turnId", "events", "projectionHash"],
    [],
    "offlineRunPublic"
  );
  if (
    record.contractVersion !==
      FORMAL_R3_PUBLIC_ENVELOPES_V1.offlineRunProjection ||
    !Array.isArray(record.events)
  ) {
    throw new AuthorityPublicProjectionErrorV1(
      "offline_run_public_contract_mismatch",
      "Offline Run public projection contract differs."
    );
  }
  const decoded = createOfflineRunPublicProjectionV1({
    runId: record.runId as string,
    turnId: record.turnId as string,
    events: record.events as OpaquePublicLifecycleEventV1[],
    authority,
  });
  if (record.projectionHash !== decoded.projectionHash) {
    throw new AuthorityPublicProjectionErrorV1(
      "offline_run_public_hash_drift",
      "Offline Run public projection hash differs."
    );
  }
  return decoded;
};

export type OfflineThreadPublicSnapshotV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_PUBLIC_ENVELOPES_V1.offlineThreadSnapshot;
  threadId: string;
  runs: readonly OfflineRunPublicProjectionV1[];
  snapshotHash: string;
}>;

export const createOfflineThreadPublicSnapshotV1 = (input: Readonly<{
  threadId: string;
  runs: readonly OfflineRunPublicProjectionV1[];
  authority: PublicLifecycleAuthorityV1;
}>): OfflineThreadPublicSnapshotV1 => {
  if (input.runs.length > OFFLINE_PUBLIC_REPLAY_LIMITS_V1.maxRunsPerThread) {
    throw new AuthorityPublicProjectionErrorV1(
      "offline_thread_public_run_budget_exceeded",
      "Offline Thread public snapshot exceeds its Run-count budget."
    );
  }
  const threadId = requiredIdV1(input.threadId, "offlineThreadPublic.threadId");
  const runs = input.runs.map((projection) => {
    const decoded = decodeOfflineRunPublicProjectionV1(
      projection,
      input.authority
    );
    if (
      !input.authority.verifyThreadContext({
        threadId,
        runId: decoded.runId,
        turnId: decoded.turnId,
        eventHashes: decoded.events.map((event) => event.eventHash),
      })
    ) {
      throw new AuthorityPublicProjectionErrorV1(
        "offline_thread_public_context_drift",
        "Offline Thread contains a Run outside its Host-owned Thread context."
      );
    }
    return decoded;
  });
  const material = {
    contractVersion: FORMAL_R3_PUBLIC_ENVELOPES_V1.offlineThreadSnapshot,
    threadId,
    runs,
  } as const;
  const snapshot = { ...material, snapshotHash: hashCanonicalJsonV1(material) };
  if (
    new TextEncoder().encode(canonicalJsonV1(snapshot)).byteLength >
    OFFLINE_PUBLIC_REPLAY_LIMITS_V1.maxThreadBytes
  ) {
    throw new AuthorityPublicProjectionErrorV1(
      "offline_thread_public_byte_budget_exceeded",
      "Offline Thread public snapshot exceeds its byte budget."
    );
  }
  return snapshot;
};

export const decodeOfflineThreadPublicSnapshotV1 = (
  value: unknown,
  authority: PublicLifecycleAuthorityV1
): OfflineThreadPublicSnapshotV1 => {
  const record = strictRecordShapeV1(
    value,
    ["contractVersion", "threadId", "runs", "snapshotHash"],
    [],
    "offlineThreadPublic"
  );
  if (
    record.contractVersion !==
      FORMAL_R3_PUBLIC_ENVELOPES_V1.offlineThreadSnapshot ||
    !Array.isArray(record.runs)
  ) {
    throw new AuthorityPublicProjectionErrorV1(
      "offline_thread_public_contract_mismatch",
      "Offline Thread public snapshot contract differs."
    );
  }
  const decoded = createOfflineThreadPublicSnapshotV1({
    threadId: record.threadId as string,
    runs: record.runs as OfflineRunPublicProjectionV1[],
    authority,
  });
  if (record.snapshotHash !== decoded.snapshotHash) {
    throw new AuthorityPublicProjectionErrorV1(
      "offline_thread_public_hash_drift",
      "Offline Thread public snapshot hash differs."
    );
  }
  return decoded;
};

export const encodeOfflineAuthorityLifecycleSseFrameV1 = (
  input: Readonly<{
    event: OpaquePublicLifecycleEventV1;
    authority: PublicLifecycleAuthorityV1;
    context: Readonly<{ threadId: string; runId: string; turnId: string }>;
  }>
) => {
  const event = verifyOpaquePublicLifecycleEventV1({
    event: input.event,
    authority: input.authority,
    expectedRunContext: {
      runId: input.context.runId,
      turnId: input.context.turnId,
    },
  });
  if (
    !input.authority.verifyThreadContext({
      threadId: requiredIdV1(input.context.threadId, "offlineAuthoritySse.threadId"),
      runId: requiredIdV1(input.context.runId, "offlineAuthoritySse.runId"),
      turnId: requiredIdV1(input.context.turnId, "offlineAuthoritySse.turnId"),
      eventHashes: [event.eventHash],
    })
  ) {
    throw new AuthorityPublicProjectionErrorV1(
      "offline_authority_sse_context_drift",
      "Offline Authority SSE event is outside its Host-owned Thread context."
    );
  }
  const frame = `event: authority.lifecycle\ndata: ${JSON.stringify(event)}\n\n`;
  if (
    new TextEncoder().encode(frame).byteLength >
    OFFLINE_PUBLIC_REPLAY_LIMITS_V1.maxSseFrameBytes
  ) {
    throw new AuthorityPublicProjectionErrorV1(
      "offline_authority_sse_frame_budget_exceeded",
      "Offline Authority lifecycle SSE frame exceeds its byte budget."
    );
  }
  return frame;
};

export const decodeOfflineAuthorityLifecycleSseFrameV1 = (
  frame: unknown,
  authority: PublicLifecycleAuthorityV1,
  context: Readonly<{ threadId: string; runId: string; turnId: string }>
) => {
  const text = requiredStringV1(
    frame,
    "offlineAuthoritySseFrame",
    OFFLINE_PUBLIC_REPLAY_LIMITS_V1.maxSseFrameBytes
  );
  const match = /^event: authority\.lifecycle\ndata: ([^\n]+)\n\n$/u.exec(text);
  if (!match) {
    throw new AuthorityPublicProjectionErrorV1(
      "offline_authority_sse_frame_invalid",
      "Offline Authority lifecycle SSE frame is not canonical."
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]!);
  } catch {
    throw new AuthorityPublicProjectionErrorV1(
      "offline_authority_sse_json_invalid",
      "Offline Authority lifecycle SSE data is invalid JSON."
    );
  }
  const event = verifyOpaquePublicLifecycleEventV1({
    event: parsed,
    authority,
    expectedRunContext: {
      runId: context.runId,
      turnId: context.turnId,
    },
  });
  if (
    !authority.verifyThreadContext({
      threadId: requiredIdV1(context.threadId, "offlineAuthoritySse.threadId"),
      runId: requiredIdV1(context.runId, "offlineAuthoritySse.runId"),
      turnId: requiredIdV1(context.turnId, "offlineAuthoritySse.turnId"),
      eventHashes: [event.eventHash],
    })
  ) {
    throw new AuthorityPublicProjectionErrorV1(
      "offline_authority_sse_context_drift",
      "Offline Authority SSE event is outside its Host-owned Thread context."
    );
  }
  return event;
};

export const assertPrivateAndModelEnvelopesDistinctV1 = (input: Readonly<{
  tool: CompiledAuthorityToolV1;
  receipt: ToolInvocationReceiptV1;
  privateResult: ToolPrivateResultEnvelopeV1;
  modelObservation: ToolModelObservationEnvelopeV1;
}>) => {
  const privateResult = decodeToolPrivateResultEnvelopeV1(
    input.privateResult,
    input.tool,
    input.receipt
  );
  const modelObservation = decodeToolModelObservationEnvelopeV1(
    input.modelObservation,
    input.tool,
    input.receipt
  );
  if (
    privateResult.contractVersion === (modelObservation.contractVersion as string) ||
    privateResult.kind === (modelObservation.kind as string) ||
    privateResult.toolId !== modelObservation.toolId ||
    privateResult.toolVersion !== modelObservation.toolVersion ||
    privateResult.receiptId !== modelObservation.receiptId ||
    privateResult.sourceReceiptHash !== modelObservation.sourceReceiptHash ||
    privateResult.status !== modelObservation.status
  ) {
    throw new Error("private_model_envelope_collision");
  }
  return true;
};
