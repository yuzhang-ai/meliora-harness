import type { EffectiveFactsAuthenticatedPrincipalV1 } from "../../editor-canvas/v1/effective-facts-capture-grant";
import type { ActorMessageV1, ActorTurnOutputV1 } from "./model-port";
import type {
  R2SelectionC0AclDecisionV1,
  R2SelectionC0AclInputV1,
  R2SelectionC0AclPortV1,
} from "./r2-selection-c0-host-authority";
import type { R2SelectionC0MainStorePortV1 } from "./r2-selection-c0-b3-store-contract";
import {
  hashCanonicalJsonV1,
  hashUtf8V1,
  requiredHashV1,
  requiredIdV1,
  requiredModelIdentityV1,
  requiredTimestampV1,
  strictRecordV1,
} from "./strict-json";

export const R2_SELECTION_C0_B3_FINAL_ANSWER_V1 = Object.freeze({
  attemptVersion: "formal-r3-r2-selection-c0-b3-final-attempt-v1",
  attemptCommitmentVersion:
    "formal-r3-r2-selection-c0-b3-final-attempt-commitment-v1",
  evidenceVersion: "formal-r3-r2-selection-c0-b3-final-evidence-v1",
  responseCommitmentVersion:
    "formal-r3-r2-selection-c0-b3-final-response-commitment-v1",
  systemPrompt:
    "You are the final response stage for a read-only landing-page selection inspection. Answer the user's request using only the persisted tool observation. When the observation contains a non-null selection, include its exact selection.nodeRef verbatim in the answer. Do not call tools. Be concise and do not claim any page mutation.",
  toolChoice: "none",
  maximumProviderAttempts: 1,
  maximumContentBytes: 16_384,
} as const);

export type R2SelectionC0FinalAnswerReasonV1 =
  | "accepted"
  | "finish_reason_invalid"
  | "tool_calls_forbidden"
  | "content_invalid"
  | "content_too_large";

export type R2SelectionC0FinalAnswerEvidenceV1 = Readonly<{
  contractVersion: typeof R2_SELECTION_C0_B3_FINAL_ANSWER_V1.evidenceVersion;
  finalAttemptId: string;
  actorCallId: string;
  workspaceId: string;
  sessionId: string;
  threadId: string;
  turnId: string;
  runId: string;
  modelIdentity: string;
  providerBindingHash: string;
  selectionEvidenceHash: string;
  selectionTupleHash: string;
  compiledCallHash: string;
  executionTupleHash: string;
  receiptId: string;
  receiptHash: string;
  mainReceiptProjectionHash: string;
  settledRunRevision: number;
  principalHash: string;
  aclScopeHash: string;
  aclDecisionHash: string;
  aclPolicyRevision: string;
  actorRequestHash: string;
  contextManifestHash: string;
  responseProjectionHash: string;
  responseCommitmentKeyId: string;
  responseCommitmentMac: string;
  status: "accepted" | "rejected";
  reason: R2SelectionC0FinalAnswerReasonV1;
  content: string | null;
  contentHash: string | null;
  contentBytes: number | null;
  createdAt: string;
  evidenceHash: string;
}>;

export type R2SelectionC0FinalAnswerRequestV1 = Readonly<{
  actorCallId: string;
  actorRequestHash: string;
  contextManifestHash: string;
  messages: readonly ActorMessageV1[];
}>;

declare const R2_FINAL_AUTHORIZATION_BRAND_V1: unique symbol;
declare const R2_FINAL_LEASE_BRAND_V1: unique symbol;

export type R2SelectionC0FinalAnswerAuthorizationV1 = Readonly<{
  material: Readonly<{
    runId: string;
    principalHash: string;
    scopeHash: string;
    aclDecisionHash: string;
    policyRevision: string;
    modelIdentity: string;
    providerBindingHash: string;
  }>;
  readonly [R2_FINAL_AUTHORIZATION_BRAND_V1]: true;
}>;

export type R2SelectionC0FinalAnswerLeaseV1 = Readonly<{
  runId: string;
  actorCallId: string;
  readonly [R2_FINAL_LEASE_BRAND_V1]: true;
}>;

export type R2SelectionC0FinalAnswerAcquisitionV1 =
  | Readonly<{
      disposition: "dispatch_now";
      evidence: null;
      request: R2SelectionC0FinalAnswerRequestV1;
      lease: R2SelectionC0FinalAnswerLeaseV1;
    }>
  | Readonly<{
      disposition: "outcome_unknown";
      evidence: null;
      request: null;
      lease: null;
    }>
  | Readonly<{
      disposition: "accepted" | "rejected";
      evidence: R2SelectionC0FinalAnswerEvidenceV1;
      request: null;
      lease: null;
    }>;

export interface R2SelectionC0FinalAnswerActorPortV1 {
  readonly modelIdentity: string;
  readonly toolChoiceMode: "none";
  readonly maximumProviderAttempts: 1;
  readonly providerBindingHash: string;
  completeFinalAnswerV1(input: Readonly<{
    messages: readonly ActorMessageV1[];
    abortSignal?: AbortSignal;
  }>): Promise<ActorTurnOutputV1>;
}

export type R2SelectionC0FinalAttemptReservationV1 = Readonly<{
  contractVersion:
    typeof R2_SELECTION_C0_B3_FINAL_ANSWER_V1.attemptCommitmentVersion;
  runId: string;
  attemptMaterialHash: string;
  keyId: string;
  mac: string;
}>;

export type R2SelectionC0FinalAttemptReservationResultV1 = Readonly<{
  disposition: "reserved" | "already_reserved";
  reservation: R2SelectionC0FinalAttemptReservationV1;
}>;

export interface R2SelectionC0FinalAnswerCommitmentVerifierPortV1 {
  readonly keyId: string;
  lookupFinalAttemptV1(
    runId: string
  ): R2SelectionC0FinalAttemptReservationV1 | null;
  verifyFinalAttemptV1(
    reservation: R2SelectionC0FinalAttemptReservationV1
  ): boolean;
  verifyResponseV1(input: Readonly<{
    keyId: string;
    materialHash: string;
    mac: string;
  }>): boolean;
  verifyDeliveryV1(input: Readonly<{
    keyId: string;
    materialHash: string;
    mac: string;
  }>): boolean;
}

export interface R2SelectionC0FinalAnswerCommitmentPortV1
  extends R2SelectionC0FinalAnswerCommitmentVerifierPortV1 {
  reserveFinalAttemptV1(input: Readonly<{
    runId: string;
    attemptMaterialHash: string;
  }>): R2SelectionC0FinalAttemptReservationResultV1;
  sealResponseV1(materialHash: string): string;
  sealDeliveryV1(materialHash: string): string;
}

export const createR2SelectionC0FinalAttemptCommitmentMaterialHashV1 = (
  input: Readonly<{
    runId: string;
    finalAttemptId: string;
    actorCallId: string;
    actorRequestHash: string;
    contextManifestHash: string;
  }>
) => hashCanonicalJsonV1({
  contractVersion:
    R2_SELECTION_C0_B3_FINAL_ANSWER_V1.attemptCommitmentVersion,
  ...input,
});

type LocalExecutionAuthorityV1 = Readonly<{
  issueR2SelectionC0LocalExecutionAssertionV1(input: Readonly<{
    scope: R2SelectionC0AclInputV1;
    decision: Extract<R2SelectionC0AclDecisionV1, Readonly<{ allowed: true }>>;
  }>): Readonly<{ assertCurrent: () => void }>;
}>;

const issuedFinalAuthorizationsV1 = new WeakMap<object, Readonly<{
  storeIdentity: object;
  assertCurrent: () => void;
  consumed: boolean;
}>>();

export const consumeR2SelectionC0FinalAnswerAuthorizationForStoreV1 = (
  authorization: R2SelectionC0FinalAnswerAuthorizationV1,
  storeIdentity: object,
  runId: string
) => {
  const state = issuedFinalAuthorizationsV1.get(authorization);
  if (
    !state ||
    state.consumed ||
    state.storeIdentity !== storeIdentity ||
    authorization.material.runId !== runId
  ) {
    throw new Error("r2_final_authorization_invalid");
  }
  state.assertCurrent();
  issuedFinalAuthorizationsV1.set(authorization, { ...state, consumed: true });
  return Object.freeze({
    material: authorization.material,
    assertCurrent: state.assertCurrent,
  });
};

export const createR2SelectionC0FinalAnswerEvidenceHashV1 = (
  input: Omit<R2SelectionC0FinalAnswerEvidenceV1, "evidenceHash">
) => hashCanonicalJsonV1(input);

export const createR2SelectionC0FinalAnswerResponseCommitmentMaterialHashV1 = (
  input: Pick<
    R2SelectionC0FinalAnswerEvidenceV1,
    | "finalAttemptId"
    | "actorCallId"
    | "providerBindingHash"
    | "actorRequestHash"
    | "contextManifestHash"
    | "responseProjectionHash"
    | "status"
    | "reason"
    | "contentHash"
    | "contentBytes"
    | "createdAt"
  >
) => hashCanonicalJsonV1({
  contractVersion:
    R2_SELECTION_C0_B3_FINAL_ANSWER_V1.responseCommitmentVersion,
  finalAttemptId: input.finalAttemptId,
  actorCallId: input.actorCallId,
  providerBindingHash: input.providerBindingHash,
  actorRequestHash: input.actorRequestHash,
  contextManifestHash: input.contextManifestHash,
  responseProjectionHash: input.responseProjectionHash,
  status: input.status,
  reason: input.reason,
  contentHash: input.contentHash,
  contentBytes: input.contentBytes,
  createdAt: input.createdAt,
});

export const decodeR2SelectionC0FinalAnswerEvidenceV1 = (
  value: unknown
): R2SelectionC0FinalAnswerEvidenceV1 => {
  const record = strictRecordV1(value, [
    "contractVersion", "finalAttemptId", "actorCallId", "workspaceId",
    "sessionId", "threadId", "turnId", "runId", "modelIdentity",
    "providerBindingHash", "selectionEvidenceHash", "selectionTupleHash",
    "compiledCallHash", "executionTupleHash", "receiptId", "receiptHash",
    "mainReceiptProjectionHash", "settledRunRevision", "principalHash",
    "aclScopeHash", "aclDecisionHash", "aclPolicyRevision",
    "actorRequestHash", "contextManifestHash", "responseProjectionHash",
    "responseCommitmentKeyId", "responseCommitmentMac",
    "status", "reason", "content", "contentHash", "contentBytes",
    "createdAt", "evidenceHash",
  ], "r2FinalAnswerEvidence");
  if (
    record.contractVersion !== R2_SELECTION_C0_B3_FINAL_ANSWER_V1.evidenceVersion ||
    !["accepted", "rejected"].includes(String(record.status)) ||
    !["accepted", "finish_reason_invalid", "tool_calls_forbidden", "content_invalid", "content_too_large"].includes(String(record.reason))
  ) throw new Error("r2_final_evidence_enum_invalid");
  for (const key of ["finalAttemptId", "actorCallId", "workspaceId", "sessionId", "threadId", "turnId", "runId", "receiptId", "aclPolicyRevision"] as const) requiredIdV1(record[key], `r2Final.${key}`);
  requiredIdV1(record.responseCommitmentKeyId, "r2Final.responseCommitmentKeyId");
  requiredModelIdentityV1(record.modelIdentity, "r2Final.modelIdentity");
  for (const key of ["providerBindingHash", "selectionEvidenceHash", "selectionTupleHash", "compiledCallHash", "executionTupleHash", "receiptHash", "mainReceiptProjectionHash", "principalHash", "aclScopeHash", "aclDecisionHash", "actorRequestHash", "contextManifestHash", "responseProjectionHash", "responseCommitmentMac", "evidenceHash"] as const) requiredHashV1(record[key], `r2Final.${key}`);
  if (!Number.isSafeInteger(record.settledRunRevision) || Number(record.settledRunRevision) < 1) throw new Error("r2_final_revision_invalid");
  requiredTimestampV1(record.createdAt, "r2Final.createdAt");
  const accepted = record.status === "accepted";
  if (
    accepted !== (record.reason === "accepted") ||
    accepted !== (typeof record.content === "string") ||
    accepted !== (typeof record.contentHash === "string") ||
    accepted !== (typeof record.contentBytes === "number")
  ) throw new Error("r2_final_evidence_state_invalid");
  if (accepted) {
    const content = String(record.content);
    const bytes = new TextEncoder().encode(content).byteLength;
    if (!content.trim() || bytes > R2_SELECTION_C0_B3_FINAL_ANSWER_V1.maximumContentBytes || record.contentHash !== hashUtf8V1(content) || record.contentBytes !== bytes) throw new Error("r2_final_content_invalid");
  } else if (
    record.content !== null ||
    record.contentHash !== null ||
    record.contentBytes !== null
  ) {
    throw new Error("r2_final_rejected_content_invalid");
  }
  const { evidenceHash, ...projection } = record;
  if (evidenceHash !== createR2SelectionC0FinalAnswerEvidenceHashV1(projection as Omit<R2SelectionC0FinalAnswerEvidenceV1, "evidenceHash">)) throw new Error("r2_final_evidence_hash_invalid");
  return structuredClone(record) as R2SelectionC0FinalAnswerEvidenceV1;
};

export class R2SelectionC0B3FinalAnswerServiceV1 {
  constructor(
    private readonly store: R2SelectionC0MainStorePortV1,
    private readonly acl: R2SelectionC0AclPortV1,
    private readonly actor: R2SelectionC0FinalAnswerActorPortV1
  ) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("r2_final_answer_forbidden_in_production");
    }
    requiredModelIdentityV1(actor.modelIdentity, "r2Final.modelIdentity");
    requiredHashV1(actor.providerBindingHash, "r2Final.providerBindingHash");
    if (actor.toolChoiceMode !== "none" || actor.maximumProviderAttempts !== 1) {
      throw new Error("r2_final_actor_contract_invalid");
    }
  }

  async answer(input: Readonly<{
    runId: string;
    workerId: string;
    principal: EffectiveFactsAuthenticatedPrincipalV1;
    abortSignal?: AbortSignal;
  }>): Promise<R2SelectionC0FinalAnswerAcquisitionV1> {
    const runId = requiredIdV1(input.runId, "r2Final.runId");
    const reservation = this.store.getR2SelectionC0AdmissionByRunIdV1(runId);
    if (!reservation) throw new Error("r2_final_admission_missing");
    const scope: R2SelectionC0AclInputV1 = {
      principal: input.principal,
      workspaceId: reservation.admission.workspaceId,
      sessionId: reservation.admission.sessionId,
      documentId: reservation.admission.documentId,
      mountId: reservation.admission.hostReceipt.mountId,
      routePath: reservation.admission.hostReceipt.routePath,
    };
    const decision = await this.acl.authorize(scope);
    if (!decision.allowed) throw new Error(decision.reasonCode);
    const principalHash = hashCanonicalJsonV1(input.principal);
    if (principalHash !== reservation.admission.principalHash || decision.decisionHash !== reservation.admission.aclDecisionHash) throw new Error("r2_final_acl_changed");
    const authority = this.acl as R2SelectionC0AclPortV1 & Partial<LocalExecutionAuthorityV1>;
    if (typeof authority.issueR2SelectionC0LocalExecutionAssertionV1 !== "function") throw new Error("r2_final_authority_unavailable");
    const assertion = authority.issueR2SelectionC0LocalExecutionAssertionV1({ scope, decision });
    const authorization = Object.freeze({
      material: Object.freeze({
        runId,
        principalHash,
        scopeHash: hashCanonicalJsonV1(scope),
        aclDecisionHash: decision.decisionHash,
        policyRevision: decision.policyRevision,
        modelIdentity: this.actor.modelIdentity,
        providerBindingHash: this.actor.providerBindingHash,
      }),
    }) as R2SelectionC0FinalAnswerAuthorizationV1;
    issuedFinalAuthorizationsV1.set(authorization, {
      storeIdentity: this.store.r2ExecutionAuthorityIdentityV1(),
      assertCurrent: assertion.assertCurrent,
      consumed: false,
    });
    const acquired = this.store.acquireR2SelectionC0FinalAnswerV1({
      authorization,
      runId,
      workerId: requiredIdV1(input.workerId, "r2Final.workerId"),
    });
    if (acquired.disposition !== "dispatch_now") return acquired;
    let output: ActorTurnOutputV1;
    try {
      output = await this.actor.completeFinalAnswerV1({
        messages: acquired.request.messages,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
    } catch {
      return { disposition: "outcome_unknown", evidence: null, request: null, lease: null };
    }
    return this.store.settleR2SelectionC0FinalAnswerV1({
      lease: acquired.lease,
      output,
    });
  }
}
