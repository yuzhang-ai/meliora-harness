import {
  decodeR2SelectionC0HostReceiptV1,
  type R2SelectionC0HostReceiptV1,
} from "./r2-selection-c0-host-authority";
import {
  E1_LOCAL_SELECTION_READ_SOURCE_V1,
  E1_LOCAL_SELECTION_READ_V1,
} from "./e1-local-selection-read-profile";
import {
  hashCanonicalJsonV1,
  requiredHashV1,
  requiredIdV1,
  requiredTimestampV1,
  strictRecordV1,
} from "./strict-json";

export const E1_LOCAL_SELECTION_READ_ADMISSION_V1 = Object.freeze({
  contractVersion: "formal-r3-e1-local-selection-read-admission-v1",
  runtimeAuthorityKind: "e1-local-selection-read-admission-v1",
  claim: "e1_local_editor_selection_read_admitted",
  effect: "canvas_read_selection",
  readBudget: 1,
  canvasWriteBudget: 0,
  environment: "development-local-isolated",
} as const);

export type E1LocalSelectionReadAdmissionV1 = Readonly<{
  contractVersion: typeof E1_LOCAL_SELECTION_READ_ADMISSION_V1.contractVersion;
  runtimeAuthorityKind: typeof E1_LOCAL_SELECTION_READ_ADMISSION_V1.runtimeAuthorityKind;
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
  status: "pending";
  rejectionCode: null;
  activatedAt: null;
  profileId: typeof E1_LOCAL_SELECTION_READ_V1.profileId;
  profileHash: string;
  sourceManifestHash: typeof E1_LOCAL_SELECTION_READ_SOURCE_V1.canonicalManifestHash;
  effect: typeof E1_LOCAL_SELECTION_READ_ADMISSION_V1.effect;
  readBudget: typeof E1_LOCAL_SELECTION_READ_ADMISSION_V1.readBudget;
  canvasWriteBudget: typeof E1_LOCAL_SELECTION_READ_ADMISSION_V1.canvasWriteBudget;
  environment: typeof E1_LOCAL_SELECTION_READ_ADMISSION_V1.environment;
  recordHash: string;
}>;

const commonFields = (record: Record<string, unknown>) => ({
  requestId: requiredIdV1(record.requestId, "e1Admission.requestId"),
  envelopeId: requiredIdV1(record.envelopeId, "e1Admission.envelopeId"),
  workspaceId: requiredIdV1(record.workspaceId, "e1Admission.workspaceId"),
  sessionId: requiredIdV1(record.sessionId, "e1Admission.sessionId"),
  documentId: requiredIdV1(record.documentId, "e1Admission.documentId"),
  threadId: requiredIdV1(record.threadId, "e1Admission.threadId"),
  turnId: requiredIdV1(record.turnId, "e1Admission.turnId"),
  runId: requiredIdV1(record.runId, "e1Admission.runId"),
  principalHash: requiredHashV1(record.principalHash, "e1Admission.principalHash"),
  aclScopeHash: requiredHashV1(record.aclScopeHash, "e1Admission.aclScopeHash"),
  aclDecisionHash: requiredHashV1(record.aclDecisionHash, "e1Admission.aclDecisionHash"),
  hostReceipt: decodeR2SelectionC0HostReceiptV1(record.hostReceipt),
  catalogBindingSeedHash: requiredHashV1(record.catalogBindingSeedHash, "e1Admission.catalogBindingSeedHash"),
  requestBodyHash: requiredHashV1(record.requestBodyHash, "e1Admission.requestBodyHash"),
  observationHash: requiredHashV1(record.observationHash, "e1Admission.observationHash"),
  queryHash: requiredHashV1(record.queryHash, "e1Admission.queryHash"),
  createdAt: requiredTimestampV1(record.createdAt, "e1Admission.createdAt"),
  activateBy: requiredTimestampV1(record.activateBy, "e1Admission.activateBy"),
});

export const decodeE1LocalSelectionReadAdmissionV1 = (
  value: unknown
): E1LocalSelectionReadAdmissionV1 => {
  const record = strictRecordV1(value, [
    "contractVersion", "runtimeAuthorityKind", "requestId", "envelopeId",
    "workspaceId", "sessionId", "documentId", "threadId", "turnId", "runId",
    "principalHash", "aclScopeHash", "aclDecisionHash", "hostReceipt",
    "catalogBindingSeedHash", "requestBodyHash", "observationHash", "queryHash",
    "createdAt", "activateBy", "status", "rejectionCode", "activatedAt",
    "profileId", "profileHash", "sourceManifestHash", "effect", "readBudget",
    "canvasWriteBudget", "environment", "recordHash",
  ], "e1Admission");
  if (
    record.contractVersion !== E1_LOCAL_SELECTION_READ_ADMISSION_V1.contractVersion ||
    record.runtimeAuthorityKind !== E1_LOCAL_SELECTION_READ_ADMISSION_V1.runtimeAuthorityKind ||
    record.status !== "pending" || record.rejectionCode !== null ||
    record.activatedAt !== null ||
    record.profileId !== E1_LOCAL_SELECTION_READ_V1.profileId ||
    record.profileHash !== hashCanonicalJsonV1(E1_LOCAL_SELECTION_READ_V1) ||
    record.sourceManifestHash !== E1_LOCAL_SELECTION_READ_SOURCE_V1.canonicalManifestHash ||
    record.effect !== E1_LOCAL_SELECTION_READ_ADMISSION_V1.effect ||
    record.readBudget !== E1_LOCAL_SELECTION_READ_ADMISSION_V1.readBudget ||
    record.canvasWriteBudget !== E1_LOCAL_SELECTION_READ_ADMISSION_V1.canvasWriteBudget ||
    record.environment !== E1_LOCAL_SELECTION_READ_ADMISSION_V1.environment
  ) throw new Error("e1_runtime_admission_contract_invalid");
  const common = commonFields(record);
  if (Date.parse(common.activateBy) <= Date.parse(common.createdAt)) {
    throw new Error("e1_runtime_admission_ttl_invalid");
  }
  const base = {
    contractVersion: E1_LOCAL_SELECTION_READ_ADMISSION_V1.contractVersion,
    runtimeAuthorityKind: E1_LOCAL_SELECTION_READ_ADMISSION_V1.runtimeAuthorityKind,
    ...common,
    status: "pending" as const,
    rejectionCode: null,
    activatedAt: null,
    profileId: E1_LOCAL_SELECTION_READ_V1.profileId,
    profileHash: hashCanonicalJsonV1(E1_LOCAL_SELECTION_READ_V1),
    sourceManifestHash: E1_LOCAL_SELECTION_READ_SOURCE_V1.canonicalManifestHash,
    effect: E1_LOCAL_SELECTION_READ_ADMISSION_V1.effect,
    readBudget: E1_LOCAL_SELECTION_READ_ADMISSION_V1.readBudget,
    canvasWriteBudget: E1_LOCAL_SELECTION_READ_ADMISSION_V1.canvasWriteBudget,
    environment: E1_LOCAL_SELECTION_READ_ADMISSION_V1.environment,
  } as const;
  const receipt = common.hostReceipt;
  if (
    receipt.requestId !== base.requestId || receipt.envelopeId !== base.envelopeId ||
    receipt.workspaceId !== base.workspaceId || receipt.sessionId !== base.sessionId ||
    receipt.documentId !== base.documentId || receipt.threadId !== base.threadId ||
    receipt.turnId !== base.turnId || receipt.runId !== base.runId ||
    receipt.principalHash !== base.principalHash || receipt.aclScopeHash !== base.aclScopeHash ||
    receipt.aclDecisionHash !== base.aclDecisionHash ||
    receipt.requestBodyHash !== base.requestBodyHash ||
    receipt.observationHash !== base.observationHash || receipt.queryHash !== base.queryHash ||
    receipt.expiresAt !== base.activateBy
  ) throw new Error("e1_runtime_admission_host_receipt_closure_invalid");
  const recordHash = requiredHashV1(record.recordHash, "e1Admission.recordHash");
  if (recordHash !== hashCanonicalJsonV1(base)) {
    throw new Error("e1_runtime_admission_hash_mismatch");
  }
  return Object.freeze({ ...base, recordHash });
};

export const createE1LocalSelectionReadAdmissionV1 = (
  input: Omit<E1LocalSelectionReadAdmissionV1,
    "contractVersion" | "runtimeAuthorityKind" | "status" | "rejectionCode" |
    "activatedAt" | "profileId" | "profileHash" | "sourceManifestHash" |
    "effect" | "readBudget" | "canvasWriteBudget" | "environment" | "recordHash">
) => {
  const base = {
    contractVersion: E1_LOCAL_SELECTION_READ_ADMISSION_V1.contractVersion,
    runtimeAuthorityKind: E1_LOCAL_SELECTION_READ_ADMISSION_V1.runtimeAuthorityKind,
    ...input,
    status: "pending" as const,
    rejectionCode: null,
    activatedAt: null,
    profileId: E1_LOCAL_SELECTION_READ_V1.profileId,
    profileHash: hashCanonicalJsonV1(E1_LOCAL_SELECTION_READ_V1),
    sourceManifestHash: E1_LOCAL_SELECTION_READ_SOURCE_V1.canonicalManifestHash,
    effect: E1_LOCAL_SELECTION_READ_ADMISSION_V1.effect,
    readBudget: E1_LOCAL_SELECTION_READ_ADMISSION_V1.readBudget,
    canvasWriteBudget: E1_LOCAL_SELECTION_READ_ADMISSION_V1.canvasWriteBudget,
    environment: E1_LOCAL_SELECTION_READ_ADMISSION_V1.environment,
  } as const;
  return decodeE1LocalSelectionReadAdmissionV1({
    ...base,
    recordHash: hashCanonicalJsonV1(base),
  });
};
