import {
  decodeR2SelectionC0HostReceiptV1,
  type R2SelectionC0HostReceiptV1,
} from "./r2-selection-c0-host-authority";
import {
  hashCanonicalJsonV1,
  requiredHashV1,
  requiredIdV1,
  requiredTimestampV1,
  strictRecordV1,
} from "./strict-json";

export const R2_SELECTION_C0_RUNTIME_ADMISSION_V1 = Object.freeze({
  contractVersion: "formal-r3-r2-selection-c0-runtime-admission-v1",
  runtimeAuthorityKind: "r2-selection-runtime-admission-v1",
  claim: "r2_atomic_acceptance_selection_durable_admission_candidate_runtime_not_installed",
} as const);

export type R2SelectionC0RuntimeAdmissionStatusV1 =
  | "pending"
  | "active"
  | "rejected";

export type R2SelectionC0RuntimeAdmissionV1 = Readonly<{
  contractVersion: typeof R2_SELECTION_C0_RUNTIME_ADMISSION_V1.contractVersion;
  runtimeAuthorityKind: typeof R2_SELECTION_C0_RUNTIME_ADMISSION_V1.runtimeAuthorityKind;
  requestId: string;
  envelopeId: string;
  workspaceId: string;
  sessionId: string;
  documentId: string;
  threadId: string;
  turnId: string;
  runId: string;
  principalHash: string;
  aclScopeHash: string;
  aclDecisionHash: string;
  hostReceipt: R2SelectionC0HostReceiptV1;
  catalogBindingSeedHash: string;
  requestBodyHash: string;
  observationHash: string;
  queryHash: string;
  createdAt: string;
  activateBy: string;
  status: R2SelectionC0RuntimeAdmissionStatusV1;
  rejectionCode: string | null;
  activatedAt: string | null;
  recordHash: string;
}>;

const material = (
  value: Omit<R2SelectionC0RuntimeAdmissionV1, "recordHash">
) => value;

export const createR2SelectionC0RuntimeAdmissionV1 = (
  input: Omit<
    R2SelectionC0RuntimeAdmissionV1,
    "contractVersion" | "runtimeAuthorityKind" | "status" | "rejectionCode" | "activatedAt" | "recordHash"
  >
): R2SelectionC0RuntimeAdmissionV1 => {
  const base = {
    contractVersion: R2_SELECTION_C0_RUNTIME_ADMISSION_V1.contractVersion,
    runtimeAuthorityKind:
      R2_SELECTION_C0_RUNTIME_ADMISSION_V1.runtimeAuthorityKind,
    ...input,
    status: "pending" as const,
    rejectionCode: null,
    activatedAt: null,
  };
  return decodeR2SelectionC0RuntimeAdmissionV1({
    ...base,
    recordHash: hashCanonicalJsonV1(material(base)),
  });
};

export const transitionR2SelectionC0RuntimeAdmissionV1 = (
  current: R2SelectionC0RuntimeAdmissionV1,
  input:
    | Readonly<{ status: "active"; at: string }>
    | Readonly<{ status: "rejected"; at: string; rejectionCode: string }>
): R2SelectionC0RuntimeAdmissionV1 => {
  if (current.status !== "pending") {
    throw new Error("r2_runtime_admission_terminal_transition_forbidden");
  }
  const base = {
    ...current,
    status: input.status,
    rejectionCode:
      input.status === "rejected"
        ? requiredIdV1(input.rejectionCode, "r2Admission.rejectionCode")
        : null,
    activatedAt:
      input.status === "active"
        ? requiredTimestampV1(input.at, "r2Admission.activatedAt")
        : null,
  } as const;
  const { recordHash: _ignored, ...withoutHash } = base;
  return decodeR2SelectionC0RuntimeAdmissionV1({
    ...withoutHash,
    recordHash: hashCanonicalJsonV1(withoutHash),
  });
};

export const decodeR2SelectionC0RuntimeAdmissionV1 = (
  value: unknown
): R2SelectionC0RuntimeAdmissionV1 => {
  const record = strictRecordV1(
    value,
    [
      "contractVersion", "runtimeAuthorityKind", "requestId", "envelopeId",
      "workspaceId", "sessionId", "documentId", "threadId", "turnId", "runId",
      "principalHash", "aclScopeHash", "aclDecisionHash", "hostReceipt", "catalogBindingSeedHash",
      "requestBodyHash", "observationHash", "queryHash", "createdAt", "activateBy",
      "status", "rejectionCode", "activatedAt", "recordHash",
    ],
    "r2RuntimeAdmission"
  );
  if (
    record.contractVersion !== R2_SELECTION_C0_RUNTIME_ADMISSION_V1.contractVersion ||
    record.runtimeAuthorityKind !== R2_SELECTION_C0_RUNTIME_ADMISSION_V1.runtimeAuthorityKind ||
    !["pending", "active", "rejected"].includes(record.status as string)
  ) throw new Error("r2_runtime_admission_contract_invalid");
  const status = record.status as R2SelectionC0RuntimeAdmissionStatusV1;
  if (
    (status === "pending" && (record.rejectionCode !== null || record.activatedAt !== null)) ||
    (status === "active" && (record.rejectionCode !== null || record.activatedAt === null)) ||
    (status === "rejected" && (record.rejectionCode === null || record.activatedAt !== null))
  ) throw new Error("r2_runtime_admission_state_invalid");
  const hostReceipt = decodeR2SelectionC0HostReceiptV1(record.hostReceipt);
  const base = {
    contractVersion: R2_SELECTION_C0_RUNTIME_ADMISSION_V1.contractVersion,
    runtimeAuthorityKind: R2_SELECTION_C0_RUNTIME_ADMISSION_V1.runtimeAuthorityKind,
    requestId: requiredIdV1(record.requestId, "r2Admission.requestId"),
    envelopeId: requiredIdV1(record.envelopeId, "r2Admission.envelopeId"),
    workspaceId: requiredIdV1(record.workspaceId, "r2Admission.workspaceId"),
    sessionId: requiredIdV1(record.sessionId, "r2Admission.sessionId"),
    documentId: requiredIdV1(record.documentId, "r2Admission.documentId"),
    threadId: requiredIdV1(record.threadId, "r2Admission.threadId"),
    turnId: requiredIdV1(record.turnId, "r2Admission.turnId"),
    runId: requiredIdV1(record.runId, "r2Admission.runId"),
    principalHash: requiredHashV1(record.principalHash, "r2Admission.principalHash"),
    aclScopeHash: requiredHashV1(record.aclScopeHash, "r2Admission.aclScopeHash"),
    aclDecisionHash: requiredHashV1(record.aclDecisionHash, "r2Admission.aclDecisionHash"),
    hostReceipt,
    catalogBindingSeedHash: requiredHashV1(record.catalogBindingSeedHash, "r2Admission.catalogBindingSeedHash"),
    requestBodyHash: requiredHashV1(record.requestBodyHash, "r2Admission.requestBodyHash"),
    observationHash: requiredHashV1(record.observationHash, "r2Admission.observationHash"),
    queryHash: requiredHashV1(record.queryHash, "r2Admission.queryHash"),
    createdAt: requiredTimestampV1(record.createdAt, "r2Admission.createdAt"),
    activateBy: requiredTimestampV1(record.activateBy, "r2Admission.activateBy"),
    status,
    rejectionCode: record.rejectionCode === null ? null : requiredIdV1(record.rejectionCode, "r2Admission.rejectionCode"),
    activatedAt: record.activatedAt === null ? null : requiredTimestampV1(record.activatedAt, "r2Admission.activatedAt"),
  } as const;
  if (Date.parse(base.activateBy) <= Date.parse(base.createdAt)) {
    throw new Error("r2_runtime_admission_ttl_invalid");
  }
  if (
    hostReceipt.requestId !== base.requestId ||
    hostReceipt.envelopeId !== base.envelopeId ||
    hostReceipt.workspaceId !== base.workspaceId ||
    hostReceipt.sessionId !== base.sessionId ||
    hostReceipt.documentId !== base.documentId ||
    !hostReceipt.mountId ||
    !hostReceipt.routePath ||
    hostReceipt.threadId !== base.threadId ||
    hostReceipt.turnId !== base.turnId ||
    hostReceipt.runId !== base.runId ||
    hostReceipt.principalHash !== base.principalHash ||
    hostReceipt.aclScopeHash !== base.aclScopeHash ||
    hostReceipt.aclDecisionHash !== base.aclDecisionHash ||
    hostReceipt.requestBodyHash !== base.requestBodyHash ||
    hostReceipt.observationHash !== base.observationHash ||
    hostReceipt.queryHash !== base.queryHash ||
    hostReceipt.expiresAt !== base.activateBy
  ) throw new Error("r2_runtime_admission_host_receipt_closure_invalid");
  const recordHash = requiredHashV1(record.recordHash, "r2Admission.recordHash");
  if (recordHash !== hashCanonicalJsonV1(base)) {
    throw new Error("r2_runtime_admission_hash_mismatch");
  }
  return Object.freeze({ ...base, recordHash });
};
