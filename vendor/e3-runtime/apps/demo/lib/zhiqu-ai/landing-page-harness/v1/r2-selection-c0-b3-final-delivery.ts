import type { EffectiveFactsAuthenticatedPrincipalV1 } from "../../editor-canvas/v1/effective-facts-capture-grant";
import type {
  R2SelectionC0AclDecisionV1,
  R2SelectionC0AclInputV1,
  R2SelectionC0AclPortV1,
} from "./r2-selection-c0-host-authority";
import type { R2SelectionC0MainStorePortV1 } from "./r2-selection-c0-b3-store-contract";
import {
  hashCanonicalJsonV1,
  requiredHashV1,
  requiredIdV1,
  requiredTimestampV1,
  strictRecordV1,
} from "./strict-json";

export const R2_SELECTION_C0_B3_FINAL_DELIVERY_V1 = Object.freeze({
  evidenceVersion: "formal-r3-r2-selection-c0-b3-final-delivery-evidence-v1",
  commitmentVersion:
    "formal-r3-r2-selection-c0-b3-final-delivery-commitment-v1",
  emptyToolCallsHash: hashCanonicalJsonV1([]),
} as const);

export type R2SelectionC0FinalDeliveryEvidenceV1 = Readonly<{
  contractVersion:
    typeof R2_SELECTION_C0_B3_FINAL_DELIVERY_V1.evidenceVersion;
  deliveryId: string;
  workspaceId: string;
  sessionId: string;
  threadId: string;
  turnId: string;
  runId: string;
  finalAttemptId: string;
  finalEvidenceHash: string;
  selectionEvidenceHash: string;
  selectionTupleHash: string;
  executionTupleHash: string;
  receiptId: string;
  receiptHash: string;
  mainReceiptProjectionHash: string;
  responseCommitmentKeyId: string;
  responseCommitmentMac: string;
  preDeliveryRunRevision: number;
  assistantMessageId: string;
  assistantMessageHash: string;
  assistantMessageSequence: number;
  assistantRole: "assistant";
  assistantContentHash: string;
  assistantContentBytes: number;
  assistantToolCallsHash: string;
  deliveredAt: string;
  completedAt: string;
  completedRunRevision: number;
  deliveryProjectionHash: string;
  deliveryCommitmentKeyId: string;
  deliveryCommitmentMac: string;
  evidenceHash: string;
}>;

export type R2SelectionC0FinalDeliveryMemoryClosureV1 = Readonly<{
  runId: string;
  threadId: string;
  turnId: string;
  assistantMessageId: string;
  assistantMessageHash: string;
  assistantMessageSequence: number;
  /**
   * The committed assistant sequence is also the exact thread length at the
   * delivery transaction. Conversation messages are contiguous and the
   * delivery transaction appends this assistant as the tail. Keeping the
   * semantic alias in the closure lets later Turns append safely without
   * weakening the historical tail proof or changing the frozen evidence
   * wire contract.
   */
  threadMessageCountAtDelivery: number;
  assistantContentHash: string;
  assistantContentBytes: number;
  preDeliveryRunRevision: number;
  completedRunRevision: number;
  deliveredAt: string;
  completedAt: string;
}>;

declare const R2_FINAL_DELIVERY_AUTHORIZATION_BRAND_V1: unique symbol;

export type R2SelectionC0FinalDeliveryAuthorizationV1 = Readonly<{
  material: Readonly<{
    runId: string;
    principalHash: string;
    scopeHash: string;
    aclDecisionHash: string;
    policyRevision: string;
  }>;
  readonly [R2_FINAL_DELIVERY_AUTHORIZATION_BRAND_V1]: true;
}>;

export type R2SelectionC0FinalDeliveryResultV1 = Readonly<{
  disposition: "delivered" | "terminal_replay";
  evidence: R2SelectionC0FinalDeliveryEvidenceV1;
}>;

type LocalExecutionAuthorityV1 = Readonly<{
  issueR2SelectionC0LocalExecutionAssertionV1(input: Readonly<{
    scope: R2SelectionC0AclInputV1;
    decision: Extract<R2SelectionC0AclDecisionV1, Readonly<{ allowed: true }>>;
  }>): Readonly<{ assertCurrent: () => void }>;
}>;

const issuedFinalDeliveryAuthorizationsV1 = new WeakMap<object, Readonly<{
  storeIdentity: object;
  assertCurrent: () => void;
  consumed: boolean;
}>>();

export const consumeR2SelectionC0FinalDeliveryAuthorizationForStoreV1 = (
  authorization: R2SelectionC0FinalDeliveryAuthorizationV1,
  storeIdentity: object,
  runId: string
) => {
  const state = issuedFinalDeliveryAuthorizationsV1.get(authorization);
  if (
    !state ||
    state.consumed ||
    state.storeIdentity !== storeIdentity ||
    authorization.material.runId !== runId
  ) {
    throw new Error("r2_final_delivery_authorization_invalid");
  }
  state.assertCurrent();
  issuedFinalDeliveryAuthorizationsV1.set(authorization, {
    ...state,
    consumed: true,
  });
  return Object.freeze({
    material: authorization.material,
    assertCurrent: state.assertCurrent,
  });
};

export const createR2SelectionC0FinalDeliveryEvidenceHashV1 = (
  input: Omit<R2SelectionC0FinalDeliveryEvidenceV1, "evidenceHash">
) => hashCanonicalJsonV1(input);

export const createR2SelectionC0FinalDeliveryCommitmentMaterialHashV1 = (
  input: Pick<
    R2SelectionC0FinalDeliveryEvidenceV1,
    | "deliveryId"
    | "runId"
    | "finalAttemptId"
    | "finalEvidenceHash"
    | "responseCommitmentKeyId"
    | "responseCommitmentMac"
    | "preDeliveryRunRevision"
    | "assistantMessageId"
    | "assistantMessageHash"
    | "assistantMessageSequence"
    | "assistantContentHash"
    | "assistantContentBytes"
    | "deliveredAt"
    | "completedAt"
    | "completedRunRevision"
    | "deliveryProjectionHash"
  >
) => hashCanonicalJsonV1({
  contractVersion: R2_SELECTION_C0_B3_FINAL_DELIVERY_V1.commitmentVersion,
  deliveryId: input.deliveryId,
  runId: input.runId,
  finalAttemptId: input.finalAttemptId,
  finalEvidenceHash: input.finalEvidenceHash,
  responseCommitmentKeyId: input.responseCommitmentKeyId,
  responseCommitmentMac: input.responseCommitmentMac,
  preDeliveryRunRevision: input.preDeliveryRunRevision,
  assistantMessageId: input.assistantMessageId,
  assistantMessageHash: input.assistantMessageHash,
  assistantMessageSequence: input.assistantMessageSequence,
  assistantContentHash: input.assistantContentHash,
  assistantContentBytes: input.assistantContentBytes,
  deliveredAt: input.deliveredAt,
  completedAt: input.completedAt,
  completedRunRevision: input.completedRunRevision,
  deliveryProjectionHash: input.deliveryProjectionHash,
});

export const decodeR2SelectionC0FinalDeliveryEvidenceV1 = (
  value: unknown
): R2SelectionC0FinalDeliveryEvidenceV1 => {
  const record = strictRecordV1(value, [
    "contractVersion", "deliveryId", "workspaceId", "sessionId",
    "threadId", "turnId", "runId", "finalAttemptId", "finalEvidenceHash",
    "selectionEvidenceHash", "selectionTupleHash", "executionTupleHash",
    "receiptId", "receiptHash", "mainReceiptProjectionHash",
    "responseCommitmentKeyId", "responseCommitmentMac",
    "preDeliveryRunRevision", "assistantMessageId", "assistantMessageHash",
    "assistantMessageSequence", "assistantRole", "assistantContentHash",
    "assistantContentBytes", "assistantToolCallsHash", "deliveredAt",
    "completedAt", "completedRunRevision", "deliveryProjectionHash",
    "deliveryCommitmentKeyId", "deliveryCommitmentMac", "evidenceHash",
  ], "r2FinalDeliveryEvidence");
  if (
    record.contractVersion !==
      R2_SELECTION_C0_B3_FINAL_DELIVERY_V1.evidenceVersion ||
    record.assistantRole !== "assistant"
  ) throw new Error("r2_final_delivery_enum_invalid");
  for (const key of [
    "deliveryId", "workspaceId", "sessionId", "threadId", "turnId",
    "runId", "finalAttemptId", "receiptId", "responseCommitmentKeyId",
    "assistantMessageId", "deliveryCommitmentKeyId",
  ] as const) requiredIdV1(record[key], `r2FinalDelivery.${key}`);
  for (const key of [
    "finalEvidenceHash", "selectionEvidenceHash", "selectionTupleHash",
    "executionTupleHash", "receiptHash", "mainReceiptProjectionHash",
    "responseCommitmentMac", "assistantMessageHash",
    "assistantContentHash", "assistantToolCallsHash",
    "deliveryProjectionHash", "deliveryCommitmentMac", "evidenceHash",
  ] as const) requiredHashV1(record[key], `r2FinalDelivery.${key}`);
  if (
    record.assistantToolCallsHash !==
      R2_SELECTION_C0_B3_FINAL_DELIVERY_V1.emptyToolCallsHash ||
    !Number.isSafeInteger(record.preDeliveryRunRevision) ||
    Number(record.preDeliveryRunRevision) < 1 ||
    !Number.isSafeInteger(record.completedRunRevision) ||
    Number(record.completedRunRevision) !==
      Number(record.preDeliveryRunRevision) + 1 ||
    !Number.isSafeInteger(record.assistantMessageSequence) ||
    Number(record.assistantMessageSequence) < 2 ||
    !Number.isSafeInteger(record.assistantContentBytes) ||
    Number(record.assistantContentBytes) < 1
  ) throw new Error("r2_final_delivery_state_invalid");
  requiredTimestampV1(record.deliveredAt, "r2FinalDelivery.deliveredAt");
  requiredTimestampV1(record.completedAt, "r2FinalDelivery.completedAt");
  if (record.deliveredAt !== record.completedAt) {
    throw new Error("r2_final_delivery_time_invalid");
  }
  const { evidenceHash, ...projection } = record;
  if (
    evidenceHash !==
      createR2SelectionC0FinalDeliveryEvidenceHashV1(
        projection as Omit<R2SelectionC0FinalDeliveryEvidenceV1, "evidenceHash">
      )
  ) throw new Error("r2_final_delivery_evidence_hash_invalid");
  return structuredClone(record) as R2SelectionC0FinalDeliveryEvidenceV1;
};

export const projectR2SelectionC0FinalDeliveryMemoryClosureV1 = (
  evidence: R2SelectionC0FinalDeliveryEvidenceV1
): R2SelectionC0FinalDeliveryMemoryClosureV1 => Object.freeze({
  runId: evidence.runId,
  threadId: evidence.threadId,
  turnId: evidence.turnId,
  assistantMessageId: evidence.assistantMessageId,
  assistantMessageHash: evidence.assistantMessageHash,
  assistantMessageSequence: evidence.assistantMessageSequence,
  threadMessageCountAtDelivery: evidence.assistantMessageSequence,
  assistantContentHash: evidence.assistantContentHash,
  assistantContentBytes: evidence.assistantContentBytes,
  preDeliveryRunRevision: evidence.preDeliveryRunRevision,
  completedRunRevision: evidence.completedRunRevision,
  deliveredAt: evidence.deliveredAt,
  completedAt: evidence.completedAt,
});

export class R2SelectionC0B3FinalDeliveryServiceV1 {
  constructor(
    private readonly store: R2SelectionC0MainStorePortV1,
    private readonly acl: R2SelectionC0AclPortV1
  ) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("r2_final_delivery_forbidden_in_production");
    }
  }

  async deliver(input: Readonly<{
    runId: string;
    principal: EffectiveFactsAuthenticatedPrincipalV1;
  }>): Promise<R2SelectionC0FinalDeliveryResultV1> {
    const runId = requiredIdV1(input.runId, "r2FinalDelivery.runId");
    const reservation = this.store.getR2SelectionC0AdmissionByRunIdV1(runId);
    if (!reservation) throw new Error("r2_final_delivery_admission_missing");
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
    if (
      principalHash !== reservation.admission.principalHash ||
      decision.decisionHash !== reservation.admission.aclDecisionHash
    ) throw new Error("r2_final_delivery_acl_changed");
    const authority = this.acl as R2SelectionC0AclPortV1 &
      Partial<LocalExecutionAuthorityV1>;
    if (
      typeof authority.issueR2SelectionC0LocalExecutionAssertionV1 !==
      "function"
    ) throw new Error("r2_final_delivery_authority_unavailable");
    const assertion = authority.issueR2SelectionC0LocalExecutionAssertionV1({
      scope,
      decision,
    });
    const authorization = Object.freeze({
      material: Object.freeze({
        runId,
        principalHash,
        scopeHash: hashCanonicalJsonV1(scope),
        aclDecisionHash: decision.decisionHash,
        policyRevision: decision.policyRevision,
      }),
    }) as R2SelectionC0FinalDeliveryAuthorizationV1;
    issuedFinalDeliveryAuthorizationsV1.set(authorization, {
      storeIdentity: this.store.r2ExecutionAuthorityIdentityV1(),
      assertCurrent: assertion.assertCurrent,
      consumed: false,
    });
    return this.store.deliverR2SelectionC0AcceptedFinalV1({ authorization });
  }
}
