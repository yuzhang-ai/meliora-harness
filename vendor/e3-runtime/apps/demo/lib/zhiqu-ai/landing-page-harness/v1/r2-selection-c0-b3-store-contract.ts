import type { EffectiveFactsAuthenticatedPrincipalV1 } from "../../editor-canvas/v1/effective-facts-capture-grant";
import type {
  AgentRunV1,
  AgentTurnV1,
  ConversationThreadV1,
} from "./contracts";
import type {
  R2SelectionC0AclReservationLeaseV1,
} from "./r2-selection-c0-host-authority";
import type { R2SelectionC0RuntimeAdmissionV1 } from "./r2-selection-c0-runtime-admission";
import type { E1LocalSelectionReadAdmissionV1 } from "./e1-local-selection-read-admission";
import type { DecodedR2SelectionC0TurnObservationV1 } from "./r2-selection-c0-turn-observation";
import type {
  R2SelectionC0ExecutionAuthorizationV1,
  R2SelectionC0ExecutionLeaseV1,
  R2SelectionC0SettlementLeaseV1,
} from "./r2-selection-c0-b3-execution-authority";
import type { ToolCallV1, ToolInvocationReceiptV1 } from "./contracts";
import type { ActorTurnOutputV1 } from "./model-port";
import type {
  R2SelectionC0ModelSelectionAuthorizationV1,
  R2SelectionC0ModelSelectionEvidenceV1,
  R2SelectionC0ModelSelectionLeaseV1,
  R2SelectionC0ModelSelectionReasonV1,
  R2SelectionC0ModelSelectionExecutionPermitV1,
} from "./r2-selection-c0-b3-model-selection";
import type {
  R2SelectionC0FinalAnswerAcquisitionV1,
  R2SelectionC0FinalAnswerAuthorizationV1,
  R2SelectionC0FinalAnswerLeaseV1,
} from "./r2-selection-c0-b3-final-answer";
import type {
  R2SelectionC0FinalDeliveryAuthorizationV1,
  R2SelectionC0FinalDeliveryResultV1,
} from "./r2-selection-c0-b3-final-delivery";
import { R2_SELECTION_C0_V1 } from "./r2-selection-c0-profile";
import { canonicalJsonV1, hashCanonicalJsonV1, requiredIdV1 } from "./strict-json";

export const R2_SELECTION_C0_B3_STORE_V1 = Object.freeze({
  reservationVersion:
    "formal-r3-r2-selection-c0-b3-main-store-reservation-v1",
  runtimeNotInstalledCode: "r2_runtime_lane_not_installed_b3_a",
  executionVersion:
    "formal-r3-r2-selection-c0-b3-main-store-execution-v1",
  dispatcherCandidateVersion:
    "formal-r3-r2-selection-c0-b3-dispatcher-candidate-v1",
  maximumExecutionLeaseMs: 3_000,
  maximumDispatchBatchSize: 8,
} as const);

export type R2SelectionC0DispatchCandidateV1 = Readonly<{
  contractVersion:
    typeof R2_SELECTION_C0_B3_STORE_V1.dispatcherCandidateVersion;
  disposition: "execute_ready" | "receipt_pending_settlement";
  runId: string;
  principalHash: string;
  call: ToolCallV1;
}>;

export const createR2SelectionC0DispatchCallV1 = (runId: string): ToolCallV1 => {
  const normalizedRunId = requiredIdV1(runId, "r2Dispatch.runId");
  const argumentsJson = canonicalJsonV1({
    contractVersion: R2_SELECTION_C0_V1.requestVersion,
    scope: "selection",
  });
  return Object.freeze({
    callId: `call-r2-selection-c0-${hashCanonicalJsonV1({
      contractVersion:
        R2_SELECTION_C0_B3_STORE_V1.dispatcherCandidateVersion,
      runId: normalizedRunId,
      toolId: R2_SELECTION_C0_V1.toolId,
      argumentsJson,
    })}`,
    toolId: R2_SELECTION_C0_V1.toolId,
    argumentsJson,
  });
};

export type R2SelectionC0InvocationV1 = Readonly<{
  contractVersion: typeof R2_SELECTION_C0_B3_STORE_V1.executionVersion;
  runId: string;
  call: ToolCallV1;
  toolVersion: string;
  argumentsHash: string;
  snapshotHash: string;
  catalogBindingHash: string;
  tupleHash: string;
  ownerId: string;
  fencingToken: number;
  leaseExpiresAt: string;
}>;

export type R2SelectionC0ExecutionAcquisitionV1 =
  | Readonly<{
      disposition: "dispatch_now";
      invocation: R2SelectionC0InvocationV1;
      lease: R2SelectionC0ExecutionLeaseV1;
    }>
  | Readonly<{
      disposition: "outcome_unknown";
      invocation: R2SelectionC0InvocationV1;
      lease: null;
    }>
  | Readonly<{
      disposition: "terminal_replay";
      invocation: R2SelectionC0InvocationV1;
      receipt: ToolInvocationReceiptV1;
      lease: null;
    }>;

export type R2SelectionC0ReceiptRecoveryV1 = Readonly<{
  invocation: R2SelectionC0InvocationV1;
  receipt: ToolInvocationReceiptV1;
  settlementLease: R2SelectionC0SettlementLeaseV1;
}>;

export type R2SelectionC0ModelSelectionAcquisitionV1 =
  | Readonly<{
      disposition: "dispatch_now";
      evidence: null;
      lease: R2SelectionC0ModelSelectionLeaseV1;
    }>
  | Readonly<{
      disposition: "outcome_unknown";
      evidence: null;
      lease: null;
    }>
  | Readonly<{
      disposition: "selected" | "rejected";
      evidence: R2SelectionC0ModelSelectionEvidenceV1;
      lease: null;
    }>;

export type ReserveR2SelectionC0TurnV1 = Readonly<{
  requestId: string;
  envelopeId: string;
  requestBodyHash: string;
  workspaceId: string;
  sessionId: string;
  documentId: string;
  threadId?: string;
  message: string;
  principal: EffectiveFactsAuthenticatedPrincipalV1;
  aclLease: R2SelectionC0AclReservationLeaseV1;
  observation: DecodedR2SelectionC0TurnObservationV1;
}>;

export type R2SelectionC0MainStoreReservationV1 = Readonly<{
  contractVersion: typeof R2_SELECTION_C0_B3_STORE_V1.reservationVersion;
  requestId: string;
  envelopeId: string;
  requestBodyHash: string;
  thread: ConversationThreadV1;
  turn: AgentTurnV1;
  run: AgentRunV1;
  admission: R2SelectionC0RuntimeAdmissionV1 | E1LocalSelectionReadAdmissionV1;
  observationHash: string;
  snapshotHash: string;
  catalogBindingHash: string;
  replayed: boolean;
}>;

export interface R2SelectionC0MainStorePortV1 {
  r2ExecutionAuthorityIdentityV1(): object;
  reserveR2SelectionC0TurnV1(
    input: ReserveR2SelectionC0TurnV1
  ): R2SelectionC0MainStoreReservationV1;
  reserveE1LocalSelectionReadTurnV1(
    input: ReserveR2SelectionC0TurnV1
  ): R2SelectionC0MainStoreReservationV1;
  getR2SelectionC0AdmissionByRequestIdV1(
    requestId: string
  ): R2SelectionC0MainStoreReservationV1 | null;
  getR2SelectionC0AdmissionByRunIdV1(
    runId: string
  ): R2SelectionC0MainStoreReservationV1 | null;
  listR2SelectionC0DispatchCandidatesV1(
    maximumCandidates: number
  ): readonly R2SelectionC0DispatchCandidateV1[];
  acquireR2SelectionC0ModelSelectionV1(input: Readonly<{
    authorization: R2SelectionC0ModelSelectionAuthorizationV1;
    runId: string;
    workerId: string;
  }>): R2SelectionC0ModelSelectionAcquisitionV1;
  settleR2SelectionC0ModelSelectionV1(input: Readonly<{
    lease: R2SelectionC0ModelSelectionLeaseV1;
    output: ActorTurnOutputV1;
  }>): R2SelectionC0ModelSelectionAcquisitionV1;
  rejectR2SelectionC0ModelSelectionV1(input: Readonly<{
    lease: R2SelectionC0ModelSelectionLeaseV1;
    reason: Extract<R2SelectionC0ModelSelectionReasonV1, "provider_error">;
    errorHash: string;
  }>): R2SelectionC0ModelSelectionAcquisitionV1;
  getR2SelectionC0ModelSelectionV1(
    runId: string
  ): R2SelectionC0ModelSelectionEvidenceV1 | null;
  issueR2SelectionC0ModelSelectionExecutionPermitV1(
    runId: string
  ): R2SelectionC0ModelSelectionExecutionPermitV1;
  acquireR2SelectionC0FinalAnswerV1(input: Readonly<{
    authorization: R2SelectionC0FinalAnswerAuthorizationV1;
    runId: string;
    workerId: string;
  }>): R2SelectionC0FinalAnswerAcquisitionV1;
  settleR2SelectionC0FinalAnswerV1(input: Readonly<{
    lease: R2SelectionC0FinalAnswerLeaseV1;
    output: ActorTurnOutputV1;
  }>): R2SelectionC0FinalAnswerAcquisitionV1;
  deliverR2SelectionC0AcceptedFinalV1(input: Readonly<{
    authorization: R2SelectionC0FinalDeliveryAuthorizationV1;
  }>): R2SelectionC0FinalDeliveryResultV1;
  acquireR2SelectionC0ModelSelectedExecutionV1(input: Readonly<{
    permit: R2SelectionC0ModelSelectionExecutionPermitV1;
    authorization: R2SelectionC0ExecutionAuthorizationV1;
    ownerId: string;
  }>): R2SelectionC0ExecutionAcquisitionV1;
  acquireR2SelectionC0ExecutionV1(input: Readonly<{
    authorization: R2SelectionC0ExecutionAuthorizationV1;
    runId: string;
    ownerId: string;
    call: ToolCallV1;
  }>): R2SelectionC0ExecutionAcquisitionV1;
  persistR2SelectionC0CompletedReceiptV1(input: Readonly<{
    lease: R2SelectionC0ExecutionLeaseV1;
  }>): ToolInvocationReceiptV1;
  reconcileR2SelectionC0CompletedReceiptV1(input: Readonly<{
    runId: string;
    call: ToolCallV1;
  }>): R2SelectionC0ReceiptRecoveryV1 | null;
  settleR2SelectionC0CompletedReceiptV1(input: Readonly<{
    recovery: R2SelectionC0ReceiptRecoveryV1;
  }>): AgentRunV1;
}
