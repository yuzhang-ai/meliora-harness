import type { RunBoundCanvasReadIdentityV1 } from "../../canvas-runtime/v1/canvas-context-read-port";
import { hashCanonicalV1 } from "../../canvas-runtime/v1/store-contracts";
import {
  requiredHashV1,
  requiredIdV1,
  requiredRuntimeMountIdV1,
  requiredStringV1,
  requiredTimestampV1,
  strictRecordV1,
} from "../../landing-page-harness/v1/strict-json";
import {
  UX_EFFECTIVE_FACTS_CAPABILITY_FINGERPRINT_V1,
  decodeUxEffectiveFactsSnapshotV1,
  type UxEffectiveFactsCaptureProfileV1,
  type UxEffectiveFactsSnapshotV1,
} from "./effective-facts-read-contract";

export const EFFECTIVE_FACTS_TURN_REGISTRY_V1 = Object.freeze({
  contractVersion: "effective-facts-turn-registry-v1",
  hostReceiptVersion: "effective-facts-host-receipt-v1",
  ttlMs: 5 * 60 * 1_000,
  maxBindings: 64,
  maxRetainedBytes: 8_000_000,
  maxSnapshotBytes: 1_000_000,
  maxReadsPerRun: 8,
  admittedProfiles: [
    "h1-container-layout-r1",
    "h1-seven-atomic-r1",
  ] as const,
} as const);

type AdmittedProfileV1 =
  (typeof EFFECTIVE_FACTS_TURN_REGISTRY_V1.admittedProfiles)[number];

export class EffectiveFactsTurnRegistryErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "EffectiveFactsTurnRegistryErrorV1";
  }
}

export type PreparedEffectiveFactsTurnSnapshotV1 = Readonly<{
  documentId: string;
  routePath: string;
  captureProfile: AdmittedProfileV1;
  mountId: string;
  observedAt: string;
  snapshotByteLength: number;
  revisionFingerprint: string;
  snapshotFingerprint: string;
  reservationHash: string;
  snapshot: UxEffectiveFactsSnapshotV1;
}>;

export type EffectiveFactsTurnReservationV1 = Readonly<{
  requestId: string;
  reservationHash: string;
}>;

export type EffectiveFactsHostReceiptV1 = Readonly<{
  contractVersion: typeof EFFECTIVE_FACTS_TURN_REGISTRY_V1.hostReceiptVersion;
  requestId: string;
  workspaceId: string;
  sessionId: string;
  documentId: string;
  threadId: string;
  turnId: string;
  runId: string;
  routePath: string;
  captureProfile: AdmittedProfileV1;
  mountId: string;
  viewport: "desktop";
  providerId: string;
  providerVersion: string;
  providerBindingVersion: string;
  effectiveFactsSchemaVersion: string;
  capabilityFingerprint: string;
  rawDataFingerprint: string;
  historyIndex: number;
  historyLength: number;
  historyEntryId: string;
  historyFingerprint: string;
  historyDataFingerprint: string;
  revisionContractVersion: "ux-effective-facts-revision-v1";
  revisionOwner: "puck_history_store";
  revisionFingerprint: string;
  snapshotFingerprint: string;
  reservationHash: string;
  hostBindingHash: string;
  observedAt: string;
  boundAt: string;
  expiresAt: string;
  budget: Readonly<{
    snapshotBytes: number;
    maxSnapshotBytes: number;
    maxReads: number;
    maxBindings: number;
    maxRetainedBytes: number;
  }>;
}>;

export interface EffectiveFactsTurnRegistrarV1 {
  prepare(input: {
    documentId: string;
    value: unknown;
  }): PreparedEffectiveFactsTurnSnapshotV1;
  reserve(input: {
    requestId: string;
    prepared: PreparedEffectiveFactsTurnSnapshotV1;
  }): EffectiveFactsTurnReservationV1;
  commit(input: {
    reservation: EffectiveFactsTurnReservationV1;
    identity: RunBoundCanvasReadIdentityV1;
  }): EffectiveFactsHostReceiptV1;
  abort(reservation: EffectiveFactsTurnReservationV1): void;
  hasBoundSnapshot(input: { runId: string; reservationHash: string }): boolean;
}

export interface RunBoundEffectiveFactsReadPortV1 {
  getBoundMountId(
    input: Omit<RunBoundCanvasReadIdentityV1, "mountId">
  ): string;
  readSnapshot(input: RunBoundCanvasReadIdentityV1): UxEffectiveFactsSnapshotV1;
  getHostReceipt(
    identity: RunBoundCanvasReadIdentityV1
  ): EffectiveFactsHostReceiptV1;
}

type PendingBindingV1 = Readonly<{
  state: "pending";
  prepared: PreparedEffectiveFactsTurnSnapshotV1;
  retainedBytes: number;
  expiresAtEpoch: number;
}>;

type CommittedBindingV1 = Readonly<{
  state: "committed";
  prepared: PreparedEffectiveFactsTurnSnapshotV1;
  identity: RunBoundCanvasReadIdentityV1;
  receipt: EffectiveFactsHostReceiptV1;
  retainedBytes: number;
  readCount: number;
}>;

const admittedProfiles = new Set<string>(
  EFFECTIVE_FACTS_TURN_REGISTRY_V1.admittedProfiles
);

const expectedDocumentIdForRoute = (routePath: string) =>
  `path-${routePath}`
    .replace(/[^a-zA-Z0-9._:-]+/gu, "-")
    .slice(0, 160);

const identityHash = (identity: RunBoundCanvasReadIdentityV1) =>
  hashCanonicalV1(identity);

const reservationHash = (prepared: Omit<PreparedEffectiveFactsTurnSnapshotV1, "snapshot" | "reservationHash">) =>
  hashCanonicalV1({
    contractVersion: EFFECTIVE_FACTS_TURN_REGISTRY_V1.contractVersion,
    ...prepared,
  });

const retainedBytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

const clonePrepared = (
  value: PreparedEffectiveFactsTurnSnapshotV1
): PreparedEffectiveFactsTurnSnapshotV1 => structuredClone(value);

const assertIdentity = (identity: RunBoundCanvasReadIdentityV1) => {
  requiredIdV1(identity.workspaceId, "effectiveFactsIdentity.workspaceId");
  requiredIdV1(identity.sessionId, "effectiveFactsIdentity.sessionId");
  requiredIdV1(identity.documentId, "effectiveFactsIdentity.documentId");
  requiredIdV1(identity.threadId, "effectiveFactsIdentity.threadId");
  requiredIdV1(identity.turnId, "effectiveFactsIdentity.turnId");
  requiredIdV1(identity.runId, "effectiveFactsIdentity.runId");
  requiredRuntimeMountIdV1(
    identity.mountId,
    "effectiveFactsIdentity.mountId"
  );
};

type EffectiveFactsHostBindingMaterialV1 = Readonly<{
  identity: RunBoundCanvasReadIdentityV1;
  routePath: string;
  captureProfile: AdmittedProfileV1;
  revisionFingerprint: string;
  snapshotFingerprint: string;
  reservationHash: string;
  observedAt: string;
  boundAt: string;
  expiresAt: string;
  budget: EffectiveFactsHostReceiptV1["budget"];
}>;

export const hashEffectiveFactsHostBindingV1 = (
  input: EffectiveFactsHostBindingMaterialV1
) =>
  hashCanonicalV1({
    identity: input.identity,
    routePath: input.routePath,
    captureProfile: input.captureProfile,
    revisionFingerprint: input.revisionFingerprint,
    snapshotFingerprint: input.snapshotFingerprint,
    reservationHash: input.reservationHash,
    observedAt: input.observedAt,
    boundAt: input.boundAt,
    expiresAt: input.expiresAt,
    budget: input.budget,
  });

const requiredSafeInteger = (
  value: unknown,
  path: string,
  minimum: number,
  maximum: number
) => {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    throw new EffectiveFactsTurnRegistryErrorV1(
      "effective_facts_host_receipt_invalid",
      `${path} must be an integer inside the frozen ceiling.`
    );
  }
  return Number(value);
};

export const decodeEffectiveFactsHostReceiptV1 = (
  value: unknown
): EffectiveFactsHostReceiptV1 => {
  const record = strictRecordV1(
    value,
    [
      "contractVersion",
      "requestId",
      "workspaceId",
      "sessionId",
      "documentId",
      "threadId",
      "turnId",
      "runId",
      "routePath",
      "captureProfile",
      "mountId",
      "viewport",
      "providerId",
      "providerVersion",
      "providerBindingVersion",
      "effectiveFactsSchemaVersion",
      "capabilityFingerprint",
      "rawDataFingerprint",
      "historyIndex",
      "historyLength",
      "historyEntryId",
      "historyFingerprint",
      "historyDataFingerprint",
      "revisionContractVersion",
      "revisionOwner",
      "revisionFingerprint",
      "snapshotFingerprint",
      "reservationHash",
      "hostBindingHash",
      "observedAt",
      "boundAt",
      "expiresAt",
      "budget",
    ],
    "effectiveFactsHostReceipt"
  );
  if (
    record.contractVersion !==
      EFFECTIVE_FACTS_TURN_REGISTRY_V1.hostReceiptVersion ||
    record.viewport !== "desktop" ||
    record.revisionContractVersion !== "ux-effective-facts-revision-v1" ||
    record.revisionOwner !== "puck_history_store" ||
    record.capabilityFingerprint !==
      UX_EFFECTIVE_FACTS_CAPABILITY_FINGERPRINT_V1
  ) {
    throw new EffectiveFactsTurnRegistryErrorV1(
      "effective_facts_host_receipt_contract_mismatch",
      "Host Receipt contract identity differs."
    );
  }
  const documentId = requiredIdV1(
    record.documentId,
    "effectiveFactsHostReceipt.documentId"
  );
  const routePath = requiredStringV1(
    record.routePath,
    "effectiveFactsHostReceipt.routePath",
    160
  );
  const captureProfile = requiredStringV1(
    record.captureProfile,
    "effectiveFactsHostReceipt.captureProfile",
    80
  );
  if (
    expectedDocumentIdForRoute(routePath) !== documentId ||
    !admittedProfiles.has(captureProfile)
  ) {
    throw new EffectiveFactsTurnRegistryErrorV1(
      "effective_facts_host_receipt_target_mismatch",
      "Host Receipt document, route, and profile do not agree."
    );
  }
  const budgetRecord = strictRecordV1(
    record.budget,
    [
      "snapshotBytes",
      "maxSnapshotBytes",
      "maxReads",
      "maxBindings",
      "maxRetainedBytes",
    ],
    "effectiveFactsHostReceipt.budget"
  );
  const budget = {
    snapshotBytes: requiredSafeInteger(
      budgetRecord.snapshotBytes,
      "effectiveFactsHostReceipt.budget.snapshotBytes",
      1,
      EFFECTIVE_FACTS_TURN_REGISTRY_V1.maxSnapshotBytes
    ),
    maxSnapshotBytes: requiredSafeInteger(
      budgetRecord.maxSnapshotBytes,
      "effectiveFactsHostReceipt.budget.maxSnapshotBytes",
      EFFECTIVE_FACTS_TURN_REGISTRY_V1.maxSnapshotBytes,
      EFFECTIVE_FACTS_TURN_REGISTRY_V1.maxSnapshotBytes
    ),
    maxReads: requiredSafeInteger(
      budgetRecord.maxReads,
      "effectiveFactsHostReceipt.budget.maxReads",
      EFFECTIVE_FACTS_TURN_REGISTRY_V1.maxReadsPerRun,
      EFFECTIVE_FACTS_TURN_REGISTRY_V1.maxReadsPerRun
    ),
    maxBindings: requiredSafeInteger(
      budgetRecord.maxBindings,
      "effectiveFactsHostReceipt.budget.maxBindings",
      1,
      EFFECTIVE_FACTS_TURN_REGISTRY_V1.maxBindings
    ),
    maxRetainedBytes: requiredSafeInteger(
      budgetRecord.maxRetainedBytes,
      "effectiveFactsHostReceipt.budget.maxRetainedBytes",
      1,
      EFFECTIVE_FACTS_TURN_REGISTRY_V1.maxRetainedBytes
    ),
  };
  const historyIndex = requiredSafeInteger(
    record.historyIndex,
    "effectiveFactsHostReceipt.historyIndex",
    0,
    Number.MAX_SAFE_INTEGER
  );
  const historyLength = requiredSafeInteger(
    record.historyLength,
    "effectiveFactsHostReceipt.historyLength",
    1,
    Number.MAX_SAFE_INTEGER
  );
  if (historyIndex >= historyLength) {
    throw new EffectiveFactsTurnRegistryErrorV1(
      "effective_facts_host_receipt_history_invalid",
      "Host Receipt history index is outside its history length."
    );
  }
  const observedAt = requiredTimestampV1(
    record.observedAt,
    "effectiveFactsHostReceipt.observedAt"
  );
  const boundAt = requiredTimestampV1(
    record.boundAt,
    "effectiveFactsHostReceipt.boundAt"
  );
  const expiresAt = requiredTimestampV1(
    record.expiresAt,
    "effectiveFactsHostReceipt.expiresAt"
  );
  if (
    Date.parse(boundAt) < Date.parse(observedAt) ||
    Date.parse(expiresAt) <= Date.parse(boundAt) ||
    Date.parse(expiresAt) >
      Date.parse(observedAt) + EFFECTIVE_FACTS_TURN_REGISTRY_V1.ttlMs ||
    Date.parse(expiresAt) >
      Date.parse(boundAt) + EFFECTIVE_FACTS_TURN_REGISTRY_V1.ttlMs
  ) {
    throw new EffectiveFactsTurnRegistryErrorV1(
      "effective_facts_host_receipt_timing_invalid",
      "Host Receipt timing exceeds the frozen Registry ceiling."
    );
  }
  const identity: RunBoundCanvasReadIdentityV1 = {
    workspaceId: requiredIdV1(
      record.workspaceId,
      "effectiveFactsHostReceipt.workspaceId"
    ),
    sessionId: requiredIdV1(
      record.sessionId,
      "effectiveFactsHostReceipt.sessionId"
    ),
    documentId,
    threadId: requiredIdV1(
      record.threadId,
      "effectiveFactsHostReceipt.threadId"
    ),
    turnId: requiredIdV1(
      record.turnId,
      "effectiveFactsHostReceipt.turnId"
    ),
    runId: requiredIdV1(record.runId, "effectiveFactsHostReceipt.runId"),
    mountId: requiredRuntimeMountIdV1(
      record.mountId,
      "effectiveFactsHostReceipt.mountId"
    ),
  };
  const receipt: EffectiveFactsHostReceiptV1 = {
    contractVersion: EFFECTIVE_FACTS_TURN_REGISTRY_V1.hostReceiptVersion,
    requestId: requiredIdV1(
      record.requestId,
      "effectiveFactsHostReceipt.requestId"
    ),
    ...identity,
    routePath,
    captureProfile: captureProfile as AdmittedProfileV1,
    viewport: "desktop",
    providerId: requiredIdV1(
      record.providerId,
      "effectiveFactsHostReceipt.providerId"
    ),
    providerVersion: requiredIdV1(
      record.providerVersion,
      "effectiveFactsHostReceipt.providerVersion"
    ),
    providerBindingVersion: requiredIdV1(
      record.providerBindingVersion,
      "effectiveFactsHostReceipt.providerBindingVersion"
    ),
    effectiveFactsSchemaVersion: requiredIdV1(
      record.effectiveFactsSchemaVersion,
      "effectiveFactsHostReceipt.effectiveFactsSchemaVersion"
    ),
    capabilityFingerprint: requiredHashV1(
      record.capabilityFingerprint,
      "effectiveFactsHostReceipt.capabilityFingerprint"
    ),
    rawDataFingerprint: requiredHashV1(
      record.rawDataFingerprint,
      "effectiveFactsHostReceipt.rawDataFingerprint"
    ),
    historyIndex,
    historyLength,
    historyEntryId: requiredIdV1(
      record.historyEntryId,
      "effectiveFactsHostReceipt.historyEntryId"
    ),
    historyFingerprint: requiredHashV1(
      record.historyFingerprint,
      "effectiveFactsHostReceipt.historyFingerprint"
    ),
    historyDataFingerprint: requiredHashV1(
      record.historyDataFingerprint,
      "effectiveFactsHostReceipt.historyDataFingerprint"
    ),
    revisionContractVersion: "ux-effective-facts-revision-v1",
    revisionOwner: "puck_history_store",
    revisionFingerprint: requiredHashV1(
      record.revisionFingerprint,
      "effectiveFactsHostReceipt.revisionFingerprint"
    ),
    snapshotFingerprint: requiredHashV1(
      record.snapshotFingerprint,
      "effectiveFactsHostReceipt.snapshotFingerprint"
    ),
    reservationHash: requiredHashV1(
      record.reservationHash,
      "effectiveFactsHostReceipt.reservationHash"
    ),
    hostBindingHash: requiredHashV1(
      record.hostBindingHash,
      "effectiveFactsHostReceipt.hostBindingHash"
    ),
    observedAt,
    boundAt,
    expiresAt,
    budget,
  };
  const expectedHostBindingHash = hashEffectiveFactsHostBindingV1({
    identity,
    routePath: receipt.routePath,
    captureProfile: receipt.captureProfile,
    revisionFingerprint: receipt.revisionFingerprint,
    snapshotFingerprint: receipt.snapshotFingerprint,
    reservationHash: receipt.reservationHash,
    observedAt,
    boundAt,
    expiresAt,
    budget,
  });
  if (receipt.hostBindingHash !== expectedHostBindingHash) {
    throw new EffectiveFactsTurnRegistryErrorV1(
      "effective_facts_host_receipt_binding_mismatch",
      "Host Receipt binding hash differs from its canonical material."
    );
  }
  return receipt;
};

export class EffectiveFactsTurnRegistryV1
  implements EffectiveFactsTurnRegistrarV1, RunBoundEffectiveFactsReadPortV1
{
  private readonly byRequestId = new Map<string, PendingBindingV1 | CommittedBindingV1>();
  private readonly requestIdByRunId = new Map<string, string>();
  private readonly requestIdBySnapshotFingerprint = new Map<string, string>();
  private retainedByteCount = 0;

  constructor(
    private readonly clock: () => number = Date.now,
    private readonly ttlMs = EFFECTIVE_FACTS_TURN_REGISTRY_V1.ttlMs,
    private readonly limits = {
      maxBindings: EFFECTIVE_FACTS_TURN_REGISTRY_V1.maxBindings,
      maxRetainedBytes: EFFECTIVE_FACTS_TURN_REGISTRY_V1.maxRetainedBytes,
    }
  ) {
    if (
      !Number.isSafeInteger(ttlMs) ||
      ttlMs < 1 ||
      ttlMs > EFFECTIVE_FACTS_TURN_REGISTRY_V1.ttlMs ||
      !Number.isSafeInteger(limits.maxBindings) ||
      limits.maxBindings < 1 ||
      limits.maxBindings > EFFECTIVE_FACTS_TURN_REGISTRY_V1.maxBindings ||
      !Number.isSafeInteger(limits.maxRetainedBytes) ||
      limits.maxRetainedBytes < 1 ||
      limits.maxRetainedBytes > EFFECTIVE_FACTS_TURN_REGISTRY_V1.maxRetainedBytes
    ) {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_registry_limit_invalid",
        "Registry limits exceed the frozen H1-2 ceilings."
      );
    }
  }

  private deleteRequest(requestId: string) {
    const current = this.byRequestId.get(requestId);
    if (!current) return;
    this.byRequestId.delete(requestId);
    this.retainedByteCount -= current.retainedBytes;
    if (current.state === "committed") {
      this.requestIdByRunId.delete(current.identity.runId);
    }
    if (
      this.requestIdBySnapshotFingerprint.get(
        current.prepared.snapshotFingerprint
      ) === requestId
    ) {
      this.requestIdBySnapshotFingerprint.delete(
        current.prepared.snapshotFingerprint
      );
    }
  }

  private prune() {
    const now = this.clock();
    for (const [requestId, binding] of this.byRequestId) {
      const expiresAt =
        binding.state === "pending"
          ? binding.expiresAtEpoch
          : Date.parse(binding.receipt.expiresAt);
      if (expiresAt <= now) this.deleteRequest(requestId);
    }
  }

  prepare(input: {
    documentId: string;
    value: unknown;
  }): PreparedEffectiveFactsTurnSnapshotV1 {
    this.prune();
    requiredIdV1(input.documentId, "effectiveFactsHost.documentId");
    let snapshotByteLength: number;
    try {
      snapshotByteLength = retainedBytes(input.value);
    } catch {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_snapshot_json_invalid",
        "Effective Facts snapshot must be bounded JSON."
      );
    }
    if (snapshotByteLength > EFFECTIVE_FACTS_TURN_REGISTRY_V1.maxSnapshotBytes) {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_snapshot_budget_exceeded",
        "Effective Facts snapshot exceeds the H1-2 byte budget."
      );
    }
    const snapshot = decodeUxEffectiveFactsSnapshotV1(input.value);
    if (!admittedProfiles.has(snapshot.captureProfile)) {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_profile_not_installed",
        "Only the two exact H1-2 acceptance profiles are installed."
      );
    }
    const expectedDocumentId = expectedDocumentIdForRoute(snapshot.routePath);
    if (
      snapshot.documentId !== input.documentId ||
      input.documentId !== expectedDocumentId
    ) {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_document_route_mismatch",
        "Caller document, snapshot document, and controlled route do not agree."
      );
    }
    const now = this.clock();
    const observedAt = Date.parse(snapshot.observedAt);
    if (
      !Number.isFinite(observedAt) ||
      observedAt > now + 5_000 ||
      observedAt + this.ttlMs <= now
    ) {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_snapshot_expired",
        "Effective Facts snapshot is expired or unreasonably future-dated."
      );
    }
    const revisionFingerprint = hashCanonicalV1(snapshot.revision);
    const base = {
      documentId: snapshot.documentId,
      routePath: snapshot.routePath,
      captureProfile: snapshot.captureProfile as AdmittedProfileV1,
      mountId: snapshot.mountId,
      observedAt: snapshot.observedAt,
      snapshotByteLength,
      revisionFingerprint,
      snapshotFingerprint: snapshot.effectiveFactsFingerprint,
    };
    return {
      ...base,
      reservationHash: reservationHash(base),
      snapshot: structuredClone(snapshot),
    };
  }

  reserve(input: {
    requestId: string;
    prepared: PreparedEffectiveFactsTurnSnapshotV1;
  }): EffectiveFactsTurnReservationV1 {
    this.prune();
    requiredIdV1(input.requestId, "effectiveFactsHost.requestId");
    // Prepared values cross an API boundary in type space and must never be
    // treated as opaque merely because TypeScript marks them readonly. Re-run
    // strict snapshot decode and derive every Host-owned binding field before
    // accepting the reservation.
    let prepared: PreparedEffectiveFactsTurnSnapshotV1;
    try {
      requiredHashV1(
        input.prepared.reservationHash,
        "effectiveFactsHost.reservationHash"
      );
      prepared = this.prepare({
        documentId: input.prepared.documentId,
        value: input.prepared.snapshot,
      });
    } catch {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_prepared_binding_mismatch",
        "Prepared Effective Facts binding failed Host revalidation."
      );
    }
    if (hashCanonicalV1(prepared) !== hashCanonicalV1(input.prepared)) {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_prepared_binding_mismatch",
        "Prepared Effective Facts binding material was changed after Host derivation."
      );
    }
    const current = this.byRequestId.get(input.requestId);
    if (current) {
      if (current.prepared.reservationHash !== prepared.reservationHash) {
        throw new EffectiveFactsTurnRegistryErrorV1(
          "effective_facts_idempotency_conflict",
          "Request ID was reused with a different Effective Facts snapshot."
        );
      }
      return { requestId: input.requestId, reservationHash: prepared.reservationHash };
    }
    const existingSnapshotRequest = this.requestIdBySnapshotFingerprint.get(
      prepared.snapshotFingerprint
    );
    if (existingSnapshotRequest && existingSnapshotRequest !== input.requestId) {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_snapshot_replay_denied",
        "One Effective Facts snapshot cannot establish a second Turn reservation."
      );
    }
    if (this.byRequestId.size >= this.limits.maxBindings) {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_registry_capacity_exceeded",
        "Effective Facts registry reached its binding limit."
      );
    }
    const retainedPrepared = clonePrepared(prepared);
    const bytes = retainedBytes(retainedPrepared);
    if (this.retainedByteCount + bytes > this.limits.maxRetainedBytes) {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_registry_memory_exceeded",
        "Effective Facts registry reached its retained byte limit."
      );
    }
    this.byRequestId.set(input.requestId, {
      state: "pending",
      prepared: retainedPrepared,
      retainedBytes: bytes,
      expiresAtEpoch: Date.parse(retainedPrepared.observedAt) + this.ttlMs,
    });
    this.requestIdBySnapshotFingerprint.set(
      retainedPrepared.snapshotFingerprint,
      input.requestId
    );
    this.retainedByteCount += bytes;
    return {
      requestId: input.requestId,
      reservationHash: retainedPrepared.reservationHash,
    };
  }

  commit(input: {
    reservation: EffectiveFactsTurnReservationV1;
    identity: RunBoundCanvasReadIdentityV1;
  }): EffectiveFactsHostReceiptV1 {
    this.prune();
    try {
      assertIdentity(input.identity);
    } catch {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_identity_mismatch",
        "Host-owned Run identity is invalid."
      );
    }
    const current = this.byRequestId.get(input.reservation.requestId);
    if (
      !current ||
      current.prepared.reservationHash !== input.reservation.reservationHash
    ) {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_reservation_missing",
        "Effective Facts reservation is missing or differs."
      );
    }
    if (current.state === "committed") {
      if (identityHash(current.identity) !== identityHash(input.identity)) {
        throw new EffectiveFactsTurnRegistryErrorV1(
          "effective_facts_idempotency_conflict",
          "Request ID was reused with a different Run identity."
        );
      }
      return structuredClone(current.receipt);
    }
    if (
      current.prepared.documentId !== input.identity.documentId ||
      current.prepared.mountId !== input.identity.mountId ||
      this.requestIdByRunId.has(input.identity.runId)
    ) {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_identity_mismatch",
        "Prepared snapshot differs from the Host-owned Run identity."
      );
    }
    const boundAtEpoch = this.clock();
    const boundAt = new Date(boundAtEpoch).toISOString();
    const expiresAt = new Date(
      Math.min(
        Date.parse(current.prepared.observedAt) + this.ttlMs,
        boundAtEpoch + this.ttlMs
      )
    ).toISOString();
    const budget = {
      snapshotBytes: current.prepared.snapshotByteLength,
      maxSnapshotBytes: EFFECTIVE_FACTS_TURN_REGISTRY_V1.maxSnapshotBytes,
      maxReads: EFFECTIVE_FACTS_TURN_REGISTRY_V1.maxReadsPerRun,
      maxBindings: this.limits.maxBindings,
      maxRetainedBytes: this.limits.maxRetainedBytes,
    };
    const hostBindingHash = hashEffectiveFactsHostBindingV1({
      identity: input.identity,
      routePath: current.prepared.routePath,
      captureProfile: current.prepared.captureProfile,
      revisionFingerprint: current.prepared.revisionFingerprint,
      snapshotFingerprint: current.prepared.snapshotFingerprint,
      reservationHash: current.prepared.reservationHash,
      observedAt: current.prepared.observedAt,
      boundAt,
      expiresAt,
      budget,
    });
    const receipt: EffectiveFactsHostReceiptV1 = {
      contractVersion: EFFECTIVE_FACTS_TURN_REGISTRY_V1.hostReceiptVersion,
      requestId: input.reservation.requestId,
      workspaceId: input.identity.workspaceId,
      sessionId: input.identity.sessionId,
      documentId: input.identity.documentId,
      threadId: input.identity.threadId,
      turnId: input.identity.turnId,
      runId: input.identity.runId,
      routePath: current.prepared.routePath,
      captureProfile: current.prepared.captureProfile,
      mountId: input.identity.mountId,
      viewport: "desktop",
      providerId: current.prepared.snapshot.providerId,
      providerVersion: current.prepared.snapshot.providerVersion,
      providerBindingVersion:
        current.prepared.snapshot.providerBindingVersion,
      effectiveFactsSchemaVersion:
        current.prepared.snapshot.effectiveFactsSchemaVersion,
      capabilityFingerprint:
        current.prepared.snapshot.capabilityFingerprint,
      rawDataFingerprint: current.prepared.snapshot.rawDataFingerprint,
      historyIndex: current.prepared.snapshot.revision.historyIndex,
      historyLength: current.prepared.snapshot.revision.historyLength,
      historyEntryId: current.prepared.snapshot.revision.historyEntryId,
      historyFingerprint:
        current.prepared.snapshot.revision.historyFingerprint,
      historyDataFingerprint:
        current.prepared.snapshot.revision.dataFingerprint,
      revisionContractVersion:
        current.prepared.snapshot.revision.contractVersion,
      revisionOwner: current.prepared.snapshot.revision.owner,
      revisionFingerprint: current.prepared.revisionFingerprint,
      snapshotFingerprint: current.prepared.snapshotFingerprint,
      reservationHash: current.prepared.reservationHash,
      hostBindingHash,
      observedAt: current.prepared.observedAt,
      boundAt,
      expiresAt,
      budget,
    };
    this.byRequestId.set(input.reservation.requestId, {
      state: "committed",
      prepared: current.prepared,
      identity: structuredClone(input.identity),
      receipt,
      retainedBytes: current.retainedBytes,
      readCount: 0,
    });
    this.requestIdByRunId.set(input.identity.runId, input.reservation.requestId);
    return structuredClone(receipt);
  }

  abort(reservation: EffectiveFactsTurnReservationV1) {
    const current = this.byRequestId.get(reservation.requestId);
    if (!current) return;
    if (current.prepared.reservationHash !== reservation.reservationHash) {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_idempotency_conflict",
        "Effective Facts reservation differs."
      );
    }
    if (current.state === "pending") this.deleteRequest(reservation.requestId);
  }

  hasBoundSnapshot(input: { runId: string; reservationHash: string }) {
    this.prune();
    const requestId = this.requestIdByRunId.get(input.runId);
    const binding = requestId ? this.byRequestId.get(requestId) : undefined;
    return (
      binding?.state === "committed" &&
      binding.prepared.reservationHash === input.reservationHash
    );
  }

  private committedFor(identity: RunBoundCanvasReadIdentityV1) {
    this.prune();
    assertIdentity(identity);
    const requestId = this.requestIdByRunId.get(identity.runId);
    const binding = requestId ? this.byRequestId.get(requestId) : undefined;
    if (!binding || binding.state !== "committed") {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_turn_unavailable",
        "No Effective Facts snapshot is bound to this Run."
      );
    }
    if (identityHash(binding.identity) !== identityHash(identity)) {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_identity_mismatch",
        "Effective Facts snapshot is bound to a different Run identity."
      );
    }
    if (binding.readCount >= EFFECTIVE_FACTS_TURN_REGISTRY_V1.maxReadsPerRun) {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_read_budget_exceeded",
        "Effective Facts read budget is exhausted for this Run."
      );
    }
    const next = { ...binding, readCount: binding.readCount + 1 };
    this.byRequestId.set(requestId!, next);
    return next;
  }

  getBoundMountId(input: Omit<RunBoundCanvasReadIdentityV1, "mountId">) {
    this.prune();
    const requestId = this.requestIdByRunId.get(input.runId);
    const binding = requestId ? this.byRequestId.get(requestId) : undefined;
    if (!binding || binding.state !== "committed") {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_turn_unavailable",
        "No Effective Facts snapshot is bound to this Run."
      );
    }
    const expected = { ...input, mountId: binding.identity.mountId };
    if (identityHash(expected) !== identityHash(binding.identity)) {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_identity_mismatch",
        "Effective Facts snapshot is bound to a different Run identity."
      );
    }
    return binding.identity.mountId;
  }

  readSnapshot(identity: RunBoundCanvasReadIdentityV1) {
    return structuredClone(this.committedFor(identity).prepared.snapshot);
  }

  getHostReceipt(identity: RunBoundCanvasReadIdentityV1) {
    this.prune();
    assertIdentity(identity);
    const requestId = this.requestIdByRunId.get(identity.runId);
    const binding = requestId ? this.byRequestId.get(requestId) : undefined;
    if (
      !binding ||
      binding.state !== "committed" ||
      identityHash(binding.identity) !== identityHash(identity)
    ) {
      throw new EffectiveFactsTurnRegistryErrorV1(
        "effective_facts_identity_mismatch",
        "Host Receipt is unavailable for this Run identity."
      );
    }
    return structuredClone(binding.receipt);
  }

  getMetrics() {
    this.prune();
    return {
      bindings: this.byRequestId.size,
      pendingBindings: [...this.byRequestId.values()].filter(
        (binding) => binding.state === "pending"
      ).length,
      committedBindings: this.requestIdByRunId.size,
      retainedBytes: this.retainedByteCount,
    } as const;
  }
}
