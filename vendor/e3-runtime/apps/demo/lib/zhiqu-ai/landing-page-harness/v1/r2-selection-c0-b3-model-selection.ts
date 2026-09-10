import type { EffectiveFactsAuthenticatedPrincipalV1 } from "../../editor-canvas/v1/effective-facts-capture-grant";
import type { ActorMessageV1, ActorTurnOutputV1 } from "./model-port";
import {
  R2_SELECTION_C0_B3_TOOL_DESCRIPTORS_V1,
} from "./r2-selection-c0-b3-authority";
import type {
  R2SelectionC0AclDecisionV1,
  R2SelectionC0AclInputV1,
  R2SelectionC0AclPortV1,
} from "./r2-selection-c0-host-authority";
import type {
  R2SelectionC0MainStorePortV1,
  R2SelectionC0MainStoreReservationV1,
  R2SelectionC0ModelSelectionAcquisitionV1,
} from "./r2-selection-c0-b3-store-contract";
import { R2_SELECTION_C0_V1 } from "./r2-selection-c0-profile";
import type { ToolDescriptorV1 } from "./tools";
import {
  hashCanonicalJsonV1,
  hashUtf8V1,
  requiredHashV1,
  requiredIdV1,
  requiredModelIdentityV1,
  requiredTimestampV1,
  strictRecordV1,
} from "./strict-json";

export const R2_SELECTION_C0_B3_MODEL_SELECTION_V1 = Object.freeze({
  evidenceVersion:
    "formal-r3-r2-selection-c0-b3-model-selection-evidence-v1",
  attemptVersion:
    "formal-r3-r2-selection-c0-b3-model-selection-attempt-v1",
  toolChoice: "auto",
  maximumCalls: 1,
  maximumSelectedArgumentsBytes: 4_096,
  systemPrompt:
    "You are the R2 atomic selection-read decision actor. Decide whether the user's request requires the exact current-selection read. When it does, call canvas_inspect exactly once with the provided selection-only schema. Do not invent selected facts, do not call another tool, and do not answer the selected facts before the tool result is available.",
} as const);

export type R2SelectionC0ModelSelectionReasonV1 =
  | "selected"
  | "provider_error"
  | "finish_reason_invalid"
  | "call_count_invalid"
  | "tool_identity_invalid"
  | "arguments_invalid";

export type R2SelectionC0ModelSelectionEvidenceV1 = Readonly<{
  contractVersion:
    typeof R2_SELECTION_C0_B3_MODEL_SELECTION_V1.evidenceVersion;
  selectionAttemptId: string;
  workspaceId: string;
  sessionId: string;
  threadId: string;
  turnId: string;
  runId: string;
  actorCallId: string;
  admissionHash: string;
  snapshotHash: string;
  principalHash: string;
  aclScopeHash: string;
  aclDecisionHash: string;
  aclPolicyRevision: string;
  modelIdentity: string;
  providerBindingHash: string;
  toolChoice: typeof R2_SELECTION_C0_B3_MODEL_SELECTION_V1.toolChoice;
  actorRequestHash: string;
  contextManifestHash: string;
  catalogBindingHash: string;
  offeredToolDescriptorsHash: string;
  responseProjectionHash: string;
  status: "selected" | "rejected";
  reason: R2SelectionC0ModelSelectionReasonV1;
  providerResponseIdHash: string | null;
  providerCallId: string | null;
  providerCallHash: string | null;
  providerToolId: string | null;
  providerArgumentsRaw: string | null;
  providerArgumentsRawHash: string | null;
  canonicalArgumentsHash: string | null;
  hostCallId: string | null;
  hostToolId: string | null;
  hostArgumentsHash: string | null;
  compiledCallHash: string | null;
  selectionTupleHash: string;
  evidenceHash: string;
  createdAt: string;
}>;

declare const R2_MODEL_SELECTION_AUTHORIZATION_BRAND_V1: unique symbol;
declare const R2_MODEL_SELECTION_LEASE_BRAND_V1: unique symbol;
declare const R2_MODEL_SELECTION_EXECUTION_PERMIT_BRAND_V1: unique symbol;

export type R2SelectionC0ModelSelectionAuthorizationV1 = Readonly<{
  material: Readonly<{
    runId: string;
    principalHash: string;
    scopeHash: string;
    aclDecisionHash: string;
    policyRevision: string;
    actorCallId: string;
    modelIdentity: string;
    providerBindingHash: string;
    actorRequestHash: string;
    contextManifestHash: string;
    catalogBindingHash: string;
    offeredToolDescriptorsHash: string;
  }>;
  readonly [R2_MODEL_SELECTION_AUTHORIZATION_BRAND_V1]: true;
}>;

export type R2SelectionC0ModelSelectionLeaseV1 = Readonly<{
  runId: string;
  actorCallId: string;
  readonly [R2_MODEL_SELECTION_LEASE_BRAND_V1]: true;
}>;

export type R2SelectionC0ModelSelectionExecutionPermitV1 = Readonly<{
  runId: string;
  selectionTupleHash: string;
  compiledCallHash: string;
  readonly [R2_MODEL_SELECTION_EXECUTION_PERMIT_BRAND_V1]: true;
}>;

export class R2SelectionC0B3ModelSelectionErrorV1 extends Error {
  constructor(readonly code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "R2SelectionC0B3ModelSelectionErrorV1";
  }
}

export interface R2SelectionC0AutoToolChoiceActorPortV1 {
  readonly modelIdentity: string;
  readonly toolChoiceMode: "auto";
  readonly maximumProviderAttempts: 1;
  readonly providerBindingHash: string;
  completeAutoToolChoiceV1(input: Readonly<{
    messages: readonly ActorMessageV1[];
    tools: readonly ToolDescriptorV1[];
    abortSignal?: AbortSignal;
  }>): Promise<ActorTurnOutputV1>;
}

type LocalExecutionAssertionV1 = Readonly<{ assertCurrent: () => void }>;
type LocalExecutionAuthorityV1 = Readonly<{
  issueR2SelectionC0LocalExecutionAssertionV1(input: Readonly<{
    scope: R2SelectionC0AclInputV1;
    decision: Extract<R2SelectionC0AclDecisionV1, Readonly<{ allowed: true }>>;
  }>): LocalExecutionAssertionV1;
}>;

const issuedAuthorizationsV1 = new WeakMap<object, Readonly<{
  authorityStoreIdentity: object;
  assertCurrent: () => void;
  consumed: boolean;
}>>();

const localExecutionAuthorityV1 = (acl: R2SelectionC0AclPortV1) => {
  const candidate = acl as R2SelectionC0AclPortV1 & Partial<LocalExecutionAuthorityV1>;
  if (typeof candidate.issueR2SelectionC0LocalExecutionAssertionV1 !== "function") {
    throw new R2SelectionC0B3ModelSelectionErrorV1(
      "r2_model_selection_authority_unavailable",
      "R2 model selection requires a synchronous local authority assertion."
    );
  }
  return candidate as R2SelectionC0AclPortV1 & LocalExecutionAuthorityV1;
};

export const consumeR2SelectionC0ModelSelectionAuthorizationForStoreV1 = (
  authorization: R2SelectionC0ModelSelectionAuthorizationV1,
  storeIdentity: object,
  runId: string
) => {
  const state = issuedAuthorizationsV1.get(authorization);
  if (
    !state ||
    state.consumed ||
    state.authorityStoreIdentity !== storeIdentity ||
    authorization.material.runId !== runId
  ) {
    throw new R2SelectionC0B3ModelSelectionErrorV1(
      "r2_model_selection_authorization_invalid",
      "R2 model-selection authorization is forged, spent, or bound elsewhere."
    );
  }
  state.assertCurrent();
  issuedAuthorizationsV1.set(authorization, { ...state, consumed: true });
  return Object.freeze({
    material: authorization.material,
    assertCurrent: state.assertCurrent,
  });
};

export const createR2SelectionC0ModelSelectionEvidenceHashV1 = (
  input: Omit<R2SelectionC0ModelSelectionEvidenceV1, "evidenceHash">
) => hashCanonicalJsonV1(input);

export const decodeR2SelectionC0ModelSelectionEvidenceV1 = (
  value: unknown
): R2SelectionC0ModelSelectionEvidenceV1 => {
  const record = strictRecordV1(value, [
    "contractVersion", "selectionAttemptId", "workspaceId", "sessionId",
    "threadId", "turnId", "runId", "actorCallId", "admissionHash",
    "snapshotHash", "principalHash", "aclScopeHash", "aclDecisionHash",
    "aclPolicyRevision", "modelIdentity", "providerBindingHash",
    "toolChoice", "actorRequestHash", "contextManifestHash",
    "catalogBindingHash", "offeredToolDescriptorsHash",
    "responseProjectionHash", "status", "reason", "providerResponseIdHash",
    "providerCallId", "providerCallHash", "providerToolId",
    "providerArgumentsRaw",
    "providerArgumentsRawHash", "canonicalArgumentsHash", "hostCallId",
    "hostToolId", "hostArgumentsHash", "compiledCallHash",
    "selectionTupleHash", "evidenceHash", "createdAt",
  ], "r2ModelSelectionEvidence");
  if (
    record.contractVersion !== R2_SELECTION_C0_B3_MODEL_SELECTION_V1.evidenceVersion ||
    record.toolChoice !== "auto" ||
    !["selected", "rejected"].includes(String(record.status)) ||
    ![
      "selected", "provider_error", "finish_reason_invalid",
      "call_count_invalid", "tool_identity_invalid", "arguments_invalid",
    ].includes(String(record.reason))
  ) {
    throw new R2SelectionC0B3ModelSelectionErrorV1(
      "r2_model_selection_evidence_invalid",
      "R2 model-selection evidence contains an invalid enum or version."
    );
  }
  for (const key of [
    "selectionAttemptId", "workspaceId", "sessionId", "threadId", "turnId",
    "runId", "actorCallId", "modelIdentity", "providerBindingHash",
  ] as const) requiredIdV1(record[key], `r2ModelSelectionEvidence.${key}`);
  for (const key of [
    "admissionHash", "snapshotHash", "principalHash", "aclScopeHash",
    "aclDecisionHash", "actorRequestHash",
    "contextManifestHash", "catalogBindingHash", "offeredToolDescriptorsHash",
    "responseProjectionHash", "selectionTupleHash", "evidenceHash",
  ] as const) requiredHashV1(record[key], `r2ModelSelectionEvidence.${key}`);
  requiredIdV1(
    record.aclPolicyRevision,
    "r2ModelSelectionEvidence.aclPolicyRevision"
  );
  for (const key of [
    "providerResponseIdHash", "providerCallHash", "providerArgumentsRawHash",
    "canonicalArgumentsHash", "hostArgumentsHash", "compiledCallHash",
  ] as const) {
    if (record[key] !== null) {
      requiredHashV1(record[key], `r2ModelSelectionEvidence.${key}`);
    }
  }
  for (const key of ["providerCallId", "providerToolId", "hostCallId", "hostToolId"] as const) {
    if (record[key] !== null) {
      requiredIdV1(record[key], `r2ModelSelectionEvidence.${key}`);
    }
  }
  if (
    record.providerArgumentsRaw !== null &&
    (typeof record.providerArgumentsRaw !== "string" ||
      new TextEncoder().encode(record.providerArgumentsRaw).byteLength >
        R2_SELECTION_C0_B3_MODEL_SELECTION_V1.maximumSelectedArgumentsBytes)
  ) {
    throw new R2SelectionC0B3ModelSelectionErrorV1(
      "r2_model_selection_evidence_arguments_invalid",
      "R2 model-selection evidence contains invalid raw arguments."
    );
  }
  requiredTimestampV1(record.createdAt, "r2ModelSelectionEvidence.createdAt");
  const { evidenceHash, ...projection } = record;
  if (
    evidenceHash !== createR2SelectionC0ModelSelectionEvidenceHashV1(
      projection as Omit<R2SelectionC0ModelSelectionEvidenceV1, "evidenceHash">
    )
  ) {
    throw new R2SelectionC0B3ModelSelectionErrorV1(
      "r2_model_selection_evidence_hash_mismatch",
      "R2 model-selection evidence hash differs from its projection."
    );
  }
  const selected = record.status === "selected";
  const selectedFields = [
    record.providerCallId, record.providerCallHash, record.providerToolId,
    record.providerArgumentsRaw, record.providerArgumentsRawHash,
    record.canonicalArgumentsHash,
    record.hostCallId, record.hostToolId, record.hostArgumentsHash,
    record.compiledCallHash,
  ];
  if (
    (selected && (record.reason !== "selected" || selectedFields.some((item) => item === null))) ||
    (!selected && (record.reason === "selected" || selectedFields.some((item) => item !== null)))
  ) {
    throw new R2SelectionC0B3ModelSelectionErrorV1(
      "r2_model_selection_evidence_state_invalid",
      "R2 model-selection status and call mapping disagree."
    );
  }
  return structuredClone(record) as R2SelectionC0ModelSelectionEvidenceV1;
};

const selectionDescriptorV1 = () => {
  const descriptor = R2_SELECTION_C0_B3_TOOL_DESCRIPTORS_V1.find(
    ({ toolId }) => toolId === R2_SELECTION_C0_V1.toolId
  );
  if (!descriptor) {
    throw new R2SelectionC0B3ModelSelectionErrorV1(
      "r2_model_selection_descriptor_missing",
      "The exact R2 selection descriptor is not installed."
    );
  }
  return Object.freeze(structuredClone(descriptor));
};

export const createR2SelectionC0ModelRequestFactsV1 = (input: Readonly<{
  reservation: R2SelectionC0MainStoreReservationV1;
  modelIdentity: string;
  providerBindingHash: string;
}>) => {
  const trigger = input.reservation.thread.messages.find(
    ({ messageId }) => messageId === input.reservation.run.triggerMessageId
  );
  if (!trigger || trigger.role !== "user") {
    throw new R2SelectionC0B3ModelSelectionErrorV1(
      "r2_model_selection_trigger_missing",
      "R2 model selection requires the exact persisted user trigger."
    );
  }
  const descriptor = selectionDescriptorV1();
  const messages = Object.freeze([
    Object.freeze({
      role: "system" as const,
      content: R2_SELECTION_C0_B3_MODEL_SELECTION_V1.systemPrompt,
    }),
    Object.freeze({ role: "user" as const, content: trigger.content }),
  ]);
  const tools = Object.freeze([descriptor]);
  const offeredToolDescriptorsHash = hashCanonicalJsonV1(tools);
  const actorRequestHash = hashCanonicalJsonV1({
    toolChoice: R2_SELECTION_C0_B3_MODEL_SELECTION_V1.toolChoice,
    messages,
    tools,
    modelIdentity: input.modelIdentity,
    providerBindingHash: input.providerBindingHash,
  });
  const contextManifestHash = hashCanonicalJsonV1({
    runId: input.reservation.run.runId,
    triggerMessageId: trigger.messageId,
    triggerContentHash: hashUtf8V1(trigger.content),
    systemPromptHash: hashUtf8V1(
      R2_SELECTION_C0_B3_MODEL_SELECTION_V1.systemPrompt
    ),
    offeredToolDescriptorsHash,
    catalogBindingHash: input.reservation.catalogBindingHash,
  });
  const actorCallId = `actor-r2-selection-${hashCanonicalJsonV1({
    runId: input.reservation.run.runId,
    modelIdentity: input.modelIdentity,
    providerBindingHash: input.providerBindingHash,
    actorRequestHash,
    contextManifestHash,
    catalogBindingHash: input.reservation.catalogBindingHash,
  })}`;
  return Object.freeze({
    trigger,
    messages,
    tools,
    offeredToolDescriptorsHash,
    actorRequestHash,
    contextManifestHash,
    actorCallId,
  });
};

export class R2SelectionC0B3ModelSelectionServiceV1 {
  constructor(
    private readonly store: R2SelectionC0MainStorePortV1,
    private readonly acl: R2SelectionC0AclPortV1,
    private readonly actor: R2SelectionC0AutoToolChoiceActorPortV1
  ) {
    if (process.env.NODE_ENV === "production") {
      throw new R2SelectionC0B3ModelSelectionErrorV1(
        "r2_model_selection_forbidden_in_production",
        "R2 B3-B3a model selection is acceptance-only."
      );
    }
    if (actor.toolChoiceMode !== R2_SELECTION_C0_B3_MODEL_SELECTION_V1.toolChoice) {
      throw new R2SelectionC0B3ModelSelectionErrorV1(
        "r2_model_selection_tool_choice_invalid",
        "R2 model selection requires a toolChoice=auto actor port."
      );
    }
    if (actor.maximumProviderAttempts !== 1) {
      throw new R2SelectionC0B3ModelSelectionErrorV1(
        "r2_model_selection_retry_policy_invalid",
        "R2 model selection permits exactly one provider attempt."
      );
    }
    requiredHashV1(
      actor.providerBindingHash,
      "r2ModelSelection.providerBindingHash"
    );
    requiredModelIdentityV1(actor.modelIdentity, "r2ModelSelection.modelIdentity");
  }

  async select(input: Readonly<{
    runId: string;
    workerId: string;
    principal: EffectiveFactsAuthenticatedPrincipalV1;
    abortSignal?: AbortSignal;
  }>): Promise<R2SelectionC0ModelSelectionAcquisitionV1> {
    const runId = requiredIdV1(input.runId, "r2ModelSelection.runId");
    const reservation = this.store.getR2SelectionC0AdmissionByRunIdV1(runId);
    if (!reservation) {
      throw new R2SelectionC0B3ModelSelectionErrorV1(
        "r2_model_selection_admission_missing",
        "R2 model selection requires an exact main Store admission."
      );
    }
    const requestFacts = createR2SelectionC0ModelRequestFactsV1({
      reservation,
      modelIdentity: this.actor.modelIdentity,
      providerBindingHash: this.actor.providerBindingHash,
    });
    const { actorCallId, actorRequestHash, contextManifestHash, messages, tools } =
      requestFacts;
    const scope: R2SelectionC0AclInputV1 = {
      principal: input.principal,
      workspaceId: reservation.admission.workspaceId,
      sessionId: reservation.admission.sessionId,
      documentId: reservation.admission.documentId,
      mountId: reservation.admission.hostReceipt.mountId,
      routePath: reservation.admission.hostReceipt.routePath,
    };
    const decision = await this.acl.authorize(scope);
    if (!decision.allowed) {
      throw new R2SelectionC0B3ModelSelectionErrorV1(
        decision.reasonCode,
        "R2 current ACL denied the model-selection attempt."
      );
    }
    const principalHash = hashCanonicalJsonV1(input.principal);
    if (
      principalHash !== reservation.admission.principalHash ||
      decision.decisionHash !== reservation.admission.aclDecisionHash
    ) {
      throw new R2SelectionC0B3ModelSelectionErrorV1(
        "r2_model_selection_acl_changed",
        "R2 model-selection identity or ACL revision changed after admission."
      );
    }
    const assertion = localExecutionAuthorityV1(this.acl)
      .issueR2SelectionC0LocalExecutionAssertionV1({ scope, decision });
    const authorization = Object.freeze({
      material: Object.freeze({
        runId,
        principalHash,
        scopeHash: hashCanonicalJsonV1(scope),
        aclDecisionHash: decision.decisionHash,
        policyRevision: decision.policyRevision,
        actorCallId,
        modelIdentity: this.actor.modelIdentity,
        providerBindingHash: this.actor.providerBindingHash,
        actorRequestHash,
        contextManifestHash,
        catalogBindingHash: reservation.catalogBindingHash,
        offeredToolDescriptorsHash: requestFacts.offeredToolDescriptorsHash,
      }),
    }) as R2SelectionC0ModelSelectionAuthorizationV1;
    issuedAuthorizationsV1.set(authorization, {
      authorityStoreIdentity: this.store.r2ExecutionAuthorityIdentityV1(),
      assertCurrent: assertion.assertCurrent,
      consumed: false,
    });
    const acquired = this.store.acquireR2SelectionC0ModelSelectionV1({
      authorization,
      runId,
      workerId: requiredIdV1(input.workerId, "r2ModelSelection.workerId"),
    });
    if (acquired.disposition !== "dispatch_now") return acquired;
    let output: ActorTurnOutputV1;
    try {
      output = await this.actor.completeAutoToolChoiceV1({
        messages,
        tools,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
    } catch {
      // Once the provider attempt has started, a timeout/connection failure
      // cannot prove whether the provider produced a response. Keep the
      // durable prepared row as outcome_unknown and never retry it.
      return { disposition: "outcome_unknown", evidence: null, lease: null };
    }
    return this.store.settleR2SelectionC0ModelSelectionV1({
      lease: acquired.lease,
      output,
    });
  }
}
