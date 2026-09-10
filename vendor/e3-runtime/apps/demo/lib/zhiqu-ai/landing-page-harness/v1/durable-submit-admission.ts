import type {
  H1RuntimeAdmissionActiveV1,
  H1RuntimeAdmissionRecordV1,
  H1RuntimeAdmissionSeedV1,
  H1RuntimeAuthorityMaterialV1,
} from "./h1-runtime-admission";
import type { H1StoreCommitLeaseV1 } from "./h1-runtime-commit-lease";
import type { EffectiveFactsCaptureGrantReceiptV1 } from "../../editor-canvas/v1/effective-facts-capture-grant";
import type { EffectiveFactsHostReceiptV1 } from "../../editor-canvas/v1/effective-facts-turn-registry";
import type { RunToolCatalogBindingSeedV1 } from "./run-tool-catalog-binding";
import {
  hashCanonicalJsonV1,
  requiredHashV1,
  requiredIdV1,
  requiredTimestampV1,
  strictRecordV1,
} from "./strict-json";

export const H1_DURABLE_SUBMIT_ADMISSION_V1 = Object.freeze({
  envelopeContractVersion: "formal-r3-h1-durable-submit-envelope-v1",
  hashVersion: "canonical-json-sha256-v1",
  originKind: "host_ui_submit_gesture_v1",
  maximumBatchSize: 8,
  minimumLeaseMs: 1_000,
  maximumLeaseMs: 60_000,
} as const);

export type H1DurableSubmitEnvelopeV1 = Readonly<{
  contractVersion:
    typeof H1_DURABLE_SUBMIT_ADMISSION_V1.envelopeContractVersion;
  hashVersion: typeof H1_DURABLE_SUBMIT_ADMISSION_V1.hashVersion;
  envelopeId: string;
  requestId: string;
  workspaceId: string;
  sessionId: string;
  documentId: string;
  requestedThreadPolicy: "fresh_isolated";
  principalHash: string;
  messageHash: string;
  requestBodyHash: string;
  capabilityAdmissionBindingHash: string;
  capabilityExpiresAt: string;
  catalogBindingSeedHash: string;
  grantClaimsHash: string;
  grantReservationHash: string;
  grantTokenHash: string;
  observationBindingHash: string;
  snapshotFingerprint: string;
  revisionFingerprint: string;
  snapshotHash: string;
  originBinding: Readonly<{
    kind: typeof H1_DURABLE_SUBMIT_ADMISSION_V1.originKind;
    bindingHash: string;
  }>;
  createdAt: string;
  activateBy: string;
  envelopeHash: string;
}>;

export type H1DurableSubmitReservationV1 = Readonly<{
  envelope: H1DurableSubmitEnvelopeV1;
  threadId: string;
  turnId: string;
  runId: string;
  status: "pending" | "active" | "rejected";
  rejectionCode: string | null;
  updatedAt: string;
}>;

export type H1AdmissionClaimV1 = Readonly<{
  runId: string;
  envelopeHash: string;
  ownerId: string;
  fencingToken: number;
}>;

const materialForHashV1 = (
  value: Omit<H1DurableSubmitEnvelopeV1, "envelopeHash">
) => value;

export const hashH1DurableSubmitEnvelopeV1 = (
  value: Omit<H1DurableSubmitEnvelopeV1, "envelopeHash">
) => hashCanonicalJsonV1(materialForHashV1(value));

export const createH1DurableSubmitEnvelopeV1 = (input: Readonly<{
  envelopeId: string;
  requestId: string;
  workspaceId: string;
  sessionId: string;
  documentId: string;
  message: string;
  requestBodyHash: string;
  seed: H1RuntimeAdmissionSeedV1;
  catalogBindingSeed: RunToolCatalogBindingSeedV1;
  capabilityExpiresAt: string;
  createdAt: string;
}>): H1DurableSubmitEnvelopeV1 => {
  const base = {
    contractVersion:
      H1_DURABLE_SUBMIT_ADMISSION_V1.envelopeContractVersion,
    hashVersion: H1_DURABLE_SUBMIT_ADMISSION_V1.hashVersion,
    envelopeId: requiredIdV1(input.envelopeId, "submitEnvelope.envelopeId"),
    requestId: requiredIdV1(input.requestId, "submitEnvelope.requestId"),
    workspaceId: requiredIdV1(
      input.workspaceId,
      "submitEnvelope.workspaceId"
    ),
    sessionId: requiredIdV1(input.sessionId, "submitEnvelope.sessionId"),
    documentId: requiredIdV1(
      input.documentId,
      "submitEnvelope.documentId"
    ),
    requestedThreadPolicy: "fresh_isolated" as const,
    principalHash: requiredHashV1(
      input.seed.principalHash,
      "submitEnvelope.principalHash"
    ),
    messageHash: hashCanonicalJsonV1(input.message),
    requestBodyHash: requiredHashV1(
      input.requestBodyHash,
      "submitEnvelope.requestBodyHash"
    ),
    capabilityAdmissionBindingHash: requiredHashV1(
      input.seed.capabilityAdmission.bindingHash,
      "submitEnvelope.capabilityAdmissionBindingHash"
    ),
    capabilityExpiresAt: requiredTimestampV1(
      input.capabilityExpiresAt,
      "submitEnvelope.capabilityExpiresAt"
    ),
    catalogBindingSeedHash: hashCanonicalJsonV1(input.catalogBindingSeed),
    grantClaimsHash: hashCanonicalJsonV1(input.seed.grantClaims),
    grantReservationHash: hashCanonicalJsonV1(input.seed.grantReservation),
    grantTokenHash: requiredHashV1(
      input.seed.grantReservation.tokenHash,
      "submitEnvelope.grantTokenHash"
    ),
    observationBindingHash: requiredHashV1(
      input.seed.observationBindingHash,
      "submitEnvelope.observationBindingHash"
    ),
    snapshotFingerprint: requiredHashV1(
      input.seed.snapshot.effectiveFactsFingerprint,
      "submitEnvelope.snapshotFingerprint"
    ),
    revisionFingerprint: hashCanonicalJsonV1(input.seed.snapshot.revision),
    snapshotHash: hashCanonicalJsonV1(input.seed.snapshot),
    originBinding: {
      kind: H1_DURABLE_SUBMIT_ADMISSION_V1.originKind,
      bindingHash: hashCanonicalJsonV1({
        requestId: input.requestId,
        envelopeId: input.envelopeId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        documentId: input.documentId,
        requestedThreadPolicy: "fresh_isolated",
        messageHash: hashCanonicalJsonV1(input.message),
        requestBodyHash: input.requestBodyHash,
      }),
    },
    createdAt: requiredTimestampV1(input.createdAt, "submitEnvelope.createdAt"),
    activateBy: new Date(
      Math.min(
        Date.parse(input.seed.grantClaims.expiresAt),
        Date.parse(input.capabilityExpiresAt)
      )
    ).toISOString(),
  };
  return Object.freeze({
    ...base,
    envelopeHash: hashH1DurableSubmitEnvelopeV1(base),
  });
};

export const decodeH1DurableSubmitEnvelopeV1 = (
  value: unknown
): H1DurableSubmitEnvelopeV1 => {
  const input = strictRecordV1(
    value,
    [
      "contractVersion",
      "hashVersion",
      "envelopeId",
      "requestId",
      "workspaceId",
      "sessionId",
      "documentId",
      "requestedThreadPolicy",
      "principalHash",
      "messageHash",
      "requestBodyHash",
      "capabilityAdmissionBindingHash",
      "capabilityExpiresAt",
      "catalogBindingSeedHash",
      "grantClaimsHash",
      "grantReservationHash",
      "grantTokenHash",
      "observationBindingHash",
      "snapshotFingerprint",
      "revisionFingerprint",
      "snapshotHash",
      "originBinding",
      "createdAt",
      "activateBy",
      "envelopeHash",
    ],
    "submitEnvelope"
  );
  if (
    input.contractVersion !==
      H1_DURABLE_SUBMIT_ADMISSION_V1.envelopeContractVersion ||
    input.hashVersion !== H1_DURABLE_SUBMIT_ADMISSION_V1.hashVersion ||
    input.requestedThreadPolicy !== "fresh_isolated"
  ) {
    throw new Error("h1_durable_submit_envelope_version_invalid");
  }
  const originBinding = strictRecordV1(
    input.originBinding,
    ["kind", "bindingHash"],
    "submitEnvelope.originBinding"
  );
  if (originBinding.kind !== H1_DURABLE_SUBMIT_ADMISSION_V1.originKind) {
    throw new Error("h1_durable_submit_origin_invalid");
  }
  const base = {
    contractVersion:
      H1_DURABLE_SUBMIT_ADMISSION_V1.envelopeContractVersion,
    hashVersion: H1_DURABLE_SUBMIT_ADMISSION_V1.hashVersion,
    envelopeId: requiredIdV1(input.envelopeId, "submitEnvelope.envelopeId"),
    requestId: requiredIdV1(input.requestId, "submitEnvelope.requestId"),
    workspaceId: requiredIdV1(input.workspaceId, "submitEnvelope.workspaceId"),
    sessionId: requiredIdV1(input.sessionId, "submitEnvelope.sessionId"),
    documentId: requiredIdV1(input.documentId, "submitEnvelope.documentId"),
    requestedThreadPolicy: "fresh_isolated" as const,
    principalHash: requiredHashV1(input.principalHash, "submitEnvelope.principalHash"),
    messageHash: requiredHashV1(input.messageHash, "submitEnvelope.messageHash"),
    requestBodyHash: requiredHashV1(input.requestBodyHash, "submitEnvelope.requestBodyHash"),
    capabilityAdmissionBindingHash: requiredHashV1(input.capabilityAdmissionBindingHash, "submitEnvelope.capabilityAdmissionBindingHash"),
    capabilityExpiresAt: requiredTimestampV1(input.capabilityExpiresAt, "submitEnvelope.capabilityExpiresAt"),
    catalogBindingSeedHash: requiredHashV1(input.catalogBindingSeedHash, "submitEnvelope.catalogBindingSeedHash"),
    grantClaimsHash: requiredHashV1(input.grantClaimsHash, "submitEnvelope.grantClaimsHash"),
    grantReservationHash: requiredHashV1(input.grantReservationHash, "submitEnvelope.grantReservationHash"),
    grantTokenHash: requiredHashV1(input.grantTokenHash, "submitEnvelope.grantTokenHash"),
    observationBindingHash: requiredHashV1(input.observationBindingHash, "submitEnvelope.observationBindingHash"),
    snapshotFingerprint: requiredHashV1(input.snapshotFingerprint, "submitEnvelope.snapshotFingerprint"),
    revisionFingerprint: requiredHashV1(input.revisionFingerprint, "submitEnvelope.revisionFingerprint"),
    snapshotHash: requiredHashV1(input.snapshotHash, "submitEnvelope.snapshotHash"),
    originBinding: {
      kind: H1_DURABLE_SUBMIT_ADMISSION_V1.originKind,
      bindingHash: requiredHashV1(
        originBinding.bindingHash,
        "submitEnvelope.originBinding.bindingHash"
      ),
    },
    createdAt: requiredTimestampV1(input.createdAt, "submitEnvelope.createdAt"),
    activateBy: requiredTimestampV1(input.activateBy, "submitEnvelope.activateBy"),
  };
  const envelopeHash = requiredHashV1(
    input.envelopeHash,
    "submitEnvelope.envelopeHash"
  );
  if (hashH1DurableSubmitEnvelopeV1(base) !== envelopeHash) {
    throw new Error("h1_durable_submit_envelope_hash_mismatch");
  }
  return Object.freeze({ ...base, envelopeHash });
};

export const assertH1DurableSubmitEnvelopeMatchesV1 = (input: Readonly<{
  envelope: H1DurableSubmitEnvelopeV1;
  requestId: string;
  workspaceId: string;
  sessionId: string;
  documentId: string;
  message: string;
  seed: H1RuntimeAdmissionSeedV1;
  catalogBindingSeed: RunToolCatalogBindingSeedV1;
}>) => {
  const envelope = decodeH1DurableSubmitEnvelopeV1(input.envelope);
  const expected = createH1DurableSubmitEnvelopeV1({
    envelopeId: envelope.envelopeId,
    requestId: input.requestId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    documentId: input.documentId,
    message: input.message,
    requestBodyHash: envelope.requestBodyHash,
    seed: input.seed,
    catalogBindingSeed: input.catalogBindingSeed,
    capabilityExpiresAt: envelope.capabilityExpiresAt,
    createdAt: envelope.createdAt,
  });
  if (
    expected.activateBy !== envelope.activateBy ||
    expected.envelopeHash !== envelope.envelopeHash
  ) {
    throw new Error("h1_durable_submit_envelope_binding_mismatch");
  }
  return envelope;
};

export interface H1DurableSubmitAdmissionStorePortV1 {
  getH1DurableSubmitReservationByRequestId(
    requestId: string
  ): H1DurableSubmitReservationV1 | null;
  getH1DurableSubmitReservationByRunId(
    runId: string
  ): H1DurableSubmitReservationV1 | null;
  takePendingH1AdmissionRunIdsForDispatch(limit: number): readonly string[];
  takeExpiredH1AdmissionRunIdsForDispatch(limit: number): readonly string[];
  claimH1Admission(
    runId: string,
    envelopeHash: string,
    ownerId: string,
    leaseMs: number,
    activationCeilingEpoch: number
  ): H1AdmissionClaimV1 | null;
  renewH1AdmissionClaim(
    claim: H1AdmissionClaimV1,
    leaseMs: number
  ): boolean;
  releaseH1AdmissionClaim(claim: H1AdmissionClaimV1): void;
  activateClaimedH1RuntimeAdmission(
    input: {
      runId: string;
      grantReceipt: EffectiveFactsCaptureGrantReceiptV1;
      hostReceipt: EffectiveFactsHostReceiptV1;
      authority: H1RuntimeAuthorityMaterialV1;
      activatedAt: string;
    },
    claim: H1AdmissionClaimV1,
    lease: H1StoreCommitLeaseV1
  ): H1RuntimeAdmissionActiveV1;
  rejectClaimedH1RuntimeAdmission(
    input: { runId: string; rejectionCode: string; rejectedAt: string },
    claim: H1AdmissionClaimV1,
    lease: H1StoreCommitLeaseV1
  ): H1RuntimeAdmissionRecordV1;
  rejectExpiredH1RuntimeAdmission(
    input: { runId: string; rejectionCode: string; rejectedAt: string },
    envelopeHash: string
  ): H1RuntimeAdmissionRecordV1;
}

export const asH1DurableSubmitAdmissionStoreV1 = (
  value: unknown
): H1DurableSubmitAdmissionStorePortV1 | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<H1DurableSubmitAdmissionStorePortV1>;
  return typeof candidate.getH1DurableSubmitReservationByRequestId === "function" &&
    typeof candidate.getH1DurableSubmitReservationByRunId === "function" &&
    typeof candidate.takePendingH1AdmissionRunIdsForDispatch === "function" &&
    typeof candidate.takeExpiredH1AdmissionRunIdsForDispatch === "function" &&
    typeof candidate.claimH1Admission === "function" &&
    typeof candidate.renewH1AdmissionClaim === "function" &&
    typeof candidate.releaseH1AdmissionClaim === "function" &&
    typeof candidate.activateClaimedH1RuntimeAdmission === "function" &&
    typeof candidate.rejectClaimedH1RuntimeAdmission === "function" &&
    typeof candidate.rejectExpiredH1RuntimeAdmission === "function"
    ? (candidate as H1DurableSubmitAdmissionStorePortV1)
    : null;
};
