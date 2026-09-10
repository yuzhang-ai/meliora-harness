import { randomUUID } from "node:crypto";
import type { EffectiveFactsAuthenticatedPrincipalV1 } from "../../editor-canvas/v1/effective-facts-capture-grant";
import type { DecodedR2SelectionC0TurnObservationV1 } from "./r2-selection-c0-turn-observation";
import {
  assertR2SelectionC0TurnObservationMatchesRequestV1,
  decodeR2SelectionC0TurnObservationV1,
} from "./r2-selection-c0-turn-observation";
import { decodeCreateTurnInputV1 } from "./contracts";
import type {
  R2SelectionC0MainStoreReservationV1,
  ReserveR2SelectionC0TurnV1,
} from "./r2-selection-c0-b3-store-contract";
import {
  hashCanonicalJsonV1,
  requiredHashV1,
  requiredIdV1,
  requiredRuntimeMountIdV1,
  requiredStringV1,
  requiredTimestampV1,
  strictRecordV1,
} from "./strict-json";

export const R2_SELECTION_C0_HOST_AUTHORITY_V1 = Object.freeze({
  receiptVersion: "formal-r3-r2-selection-c0-host-receipt-v1",
  aclDecisionVersion: "formal-r3-r2-selection-c0-acl-decision-v1",
  maximumTtlMs: 60_000,
  minimumTtlMs: 5_000,
  snapshotTtlMs: 60_000,
  maximumFutureSkewMs: 2_000,
} as const);

export type R2SelectionC0AclInputV1 = Readonly<{
  principal: EffectiveFactsAuthenticatedPrincipalV1;
  workspaceId: string;
  sessionId: string;
  documentId: string;
  mountId: string;
  routePath: string;
}>;

export type R2SelectionC0AclDecisionV1 = Readonly<{
  contractVersion: typeof R2_SELECTION_C0_HOST_AUTHORITY_V1.aclDecisionVersion;
  allowed: true;
  policyId: string;
  policyRevision: string;
  decisionHash: string;
}> | Readonly<{
  contractVersion: typeof R2_SELECTION_C0_HOST_AUTHORITY_V1.aclDecisionVersion;
  allowed: false;
  reasonCode: string;
  decisionHash: string;
}>;

export interface R2SelectionC0AclPortV1 {
  authorize(input: R2SelectionC0AclInputV1): Promise<R2SelectionC0AclDecisionV1>;
}

export interface R2SelectionC0LocalAclAdminPortV1 {
  admit(input: R2SelectionC0AclInputV1): void;
  revoke(input: R2SelectionC0AclInputV1): void;
}

export type R2SelectionC0B3AdmissionStorePortV1 = Readonly<{
  reserveR2SelectionC0TurnV1(
    input: ReserveR2SelectionC0TurnV1
  ): R2SelectionC0MainStoreReservationV1;
  getR2SelectionC0AdmissionByRequestIdV1(
    requestId: string
  ): R2SelectionC0MainStoreReservationV1 | null;
}>;

export type E1LocalSelectionReadAdmissionStorePortV1 = Readonly<{
  reserveE1LocalSelectionReadTurnV1(
    input: ReserveR2SelectionC0TurnV1
  ): R2SelectionC0MainStoreReservationV1;
  getR2SelectionC0AdmissionByRequestIdV1(
    requestId: string
  ): R2SelectionC0MainStoreReservationV1 | null;
}>;

const r2SelectionC0AclReservationLeaseBrandV1: unique symbol = Symbol(
  "formal-r3-r2-selection-c0-acl-reservation-lease-v1"
);
const trustedR2SelectionC0AclReservationLeasesV1 = new WeakSet<object>();

export type R2SelectionC0AclReservationLeaseV1 = Readonly<{
  [r2SelectionC0AclReservationLeaseBrandV1]: true;
  scopeHash: string;
  decision: Extract<R2SelectionC0AclDecisionV1, Readonly<{ allowed: true }>>;
}>;

const issueR2SelectionC0AclReservationLeaseV1 = async (input: Readonly<{
  acl: R2SelectionC0AclPortV1;
  scope: R2SelectionC0AclInputV1;
}>): Promise<R2SelectionC0AclReservationLeaseV1> => {
  const decision = await input.acl.authorize(input.scope);
  if (!decision.allowed) {
    throw new R2SelectionC0HostAuthorityErrorV1(
      decision.reasonCode,
      "R2 exact document ACL denied reservation authority."
    );
  }
  const lease = Object.freeze({
    [r2SelectionC0AclReservationLeaseBrandV1]: true as const,
    scopeHash: hashCanonicalJsonV1(input.scope),
    decision,
  });
  trustedR2SelectionC0AclReservationLeasesV1.add(lease);
  return lease;
};

/** The only public B3-A admission front door. The ACL lease issuer stays
 * module-private, so direct Store callers cannot mint durable authority. */
export class R2SelectionC0B3AdmissionServiceV1 {
  constructor(
    private readonly store: R2SelectionC0B3AdmissionStorePortV1,
    private readonly acl: R2SelectionC0AclPortV1,
    private readonly localAclAdmin: R2SelectionC0LocalAclAdminPortV1 | null = null
  ) {}

  async submit(input: Readonly<{
    value: unknown;
    rawBodyHash: string;
    principal: EffectiveFactsAuthenticatedPrincipalV1;
    autoAdmitLocalMount?: boolean;
  }>) {
    const body = decodeCreateTurnInputV1(input.value);
    if (
      !body.requestId ||
      !body.envelopeId ||
      !body.workspaceId ||
      !body.sessionId ||
      !body.documentId
    ) throw new Error("r2_admission_identity_missing");
    if (body.threadId) throw new Error("r2_admission_fresh_thread_required");
    const observation = assertR2SelectionC0TurnObservationMatchesRequestV1(
      decodeR2SelectionC0TurnObservationV1(body.canvasObservation),
      {
        requestId: body.requestId,
        envelopeId: body.envelopeId,
        workspaceId: body.workspaceId,
        sessionId: body.sessionId,
        documentId: body.documentId,
      }
    );
    const aclInput: R2SelectionC0AclInputV1 = {
      principal: input.principal,
      workspaceId: body.workspaceId,
      sessionId: body.sessionId,
      documentId: body.documentId,
      mountId: observation.hostObservation.mountId,
      routePath: observation.hostObservation.routePath,
    };
    if (input.autoAdmitLocalMount) {
      if (!this.localAclAdmin) throw new Error("r2_local_acl_not_installed");
      this.localAclAdmin.admit(aclInput);
    }
    const aclLease = await issueR2SelectionC0AclReservationLeaseV1({
      acl: this.acl,
      scope: aclInput,
    });
    return this.store.reserveR2SelectionC0TurnV1({
      requestId: body.requestId,
      envelopeId: body.envelopeId,
      requestBodyHash: requiredHashV1(
        input.rawBodyHash,
        "r2B3Admission.rawBodyHash"
      ),
      workspaceId: body.workspaceId,
      sessionId: body.sessionId,
      documentId: body.documentId,
      message: body.message,
      principal: input.principal,
      aclLease,
      observation,
    });
  }

  reconcile(input: Readonly<{
    requestId: string;
    envelopeId: string;
    requestBodyHash: string;
    principal: EffectiveFactsAuthenticatedPrincipalV1;
  }>) {
    const current = this.store.getR2SelectionC0AdmissionByRequestIdV1(
      input.requestId
    );
    if (!current) return null;
    if (
      current.envelopeId !== input.envelopeId ||
      current.requestBodyHash !== input.requestBodyHash ||
      current.admission.principalHash !== hashCanonicalJsonV1(input.principal)
    ) throw new Error("r2_admission_reconcile_conflict");
    return current;
  }
}

/** E1 owns a distinct admission lane while deliberately reusing the frozen
 * R2 selection-read mechanics. The lane is selected by this explicit class,
 * never by a process-wide environment alias. */
export class E1LocalSelectionReadAdmissionServiceV1 {
  constructor(
    private readonly store: E1LocalSelectionReadAdmissionStorePortV1,
    private readonly acl: R2SelectionC0AclPortV1,
    private readonly localAclAdmin: R2SelectionC0LocalAclAdminPortV1 | null = null
  ) {}

  async submit(input: Readonly<{
    value: unknown;
    rawBodyHash: string;
    principal: EffectiveFactsAuthenticatedPrincipalV1;
    autoAdmitLocalMount?: boolean;
  }>) {
    const body = decodeCreateTurnInputV1(input.value);
    if (
      !body.requestId || !body.envelopeId || !body.workspaceId ||
      !body.sessionId || !body.documentId
    ) throw new Error("e1_admission_identity_missing");
    const observation = assertR2SelectionC0TurnObservationMatchesRequestV1(
      decodeR2SelectionC0TurnObservationV1(body.canvasObservation),
      {
        requestId: body.requestId,
        envelopeId: body.envelopeId,
        workspaceId: body.workspaceId,
        sessionId: body.sessionId,
        documentId: body.documentId,
        ...(body.threadId ? { threadId: body.threadId } : {}),
      }
    );
    const aclInput: R2SelectionC0AclInputV1 = {
      principal: input.principal,
      workspaceId: body.workspaceId,
      sessionId: body.sessionId,
      documentId: body.documentId,
      mountId: observation.hostObservation.mountId,
      routePath: observation.hostObservation.routePath,
    };
    if (input.autoAdmitLocalMount) {
      if (!this.localAclAdmin) throw new Error("e1_local_acl_not_installed");
      this.localAclAdmin.admit(aclInput);
    }
    const aclLease = await issueR2SelectionC0AclReservationLeaseV1({
      acl: this.acl,
      scope: aclInput,
    });
    return this.store.reserveE1LocalSelectionReadTurnV1({
      requestId: body.requestId,
      envelopeId: body.envelopeId,
      requestBodyHash: requiredHashV1(input.rawBodyHash, "e1Admission.rawBodyHash"),
      workspaceId: body.workspaceId,
      sessionId: body.sessionId,
      documentId: body.documentId,
      ...(body.threadId ? { threadId: body.threadId } : {}),
      message: body.message,
      principal: input.principal,
      aclLease,
      observation,
    });
  }

  reconcile(input: Readonly<{
    requestId: string;
    envelopeId: string;
    requestBodyHash: string;
    principal: EffectiveFactsAuthenticatedPrincipalV1;
  }>) {
    const current = this.store.getR2SelectionC0AdmissionByRequestIdV1(input.requestId);
    if (!current) return null;
    if (
      current.admission.runtimeAuthorityKind !==
        "e1-local-selection-read-admission-v1" ||
      current.envelopeId !== input.envelopeId ||
      current.requestBodyHash !== input.requestBodyHash ||
      current.admission.principalHash !== hashCanonicalJsonV1(input.principal)
    ) throw new Error("e1_admission_reconcile_conflict");
    return current;
  }
}

const consumeR2SelectionC0AclReservationLeaseV1 = (
  lease: R2SelectionC0AclReservationLeaseV1,
  scope: R2SelectionC0AclInputV1
) => {
  if (
    (typeof lease !== "object" && typeof lease !== "function") ||
    lease === null ||
    !trustedR2SelectionC0AclReservationLeasesV1.has(lease) ||
    lease.scopeHash !== hashCanonicalJsonV1(scope) ||
    !lease.decision.allowed
  ) {
    throw new R2SelectionC0HostAuthorityErrorV1(
      "r2_acl_reservation_lease_invalid",
      "R2 ACL reservation lease is untrusted, spent, or bound to another exact scope."
    );
  }
  trustedR2SelectionC0AclReservationLeasesV1.delete(lease);
  return lease.decision;
};

/** Local B1 acceptance authority. The route may admit only the exact mount it
 * just decoded from the pinned loopback Host observation. This is deliberately
 * not a production identity provider. */
export class LocalIsolatedR2SelectionC0AclV1
  implements R2SelectionC0AclPortV1
{
  private readonly scopes = new Set<string>();
  private revision = 1;

  admit(input: R2SelectionC0AclInputV1) {
    this.scopes.add(hashCanonicalJsonV1(input));
  }

  revoke(input: R2SelectionC0AclInputV1) {
    this.scopes.delete(hashCanonicalJsonV1(input));
    this.revision += 1;
  }

  async authorize(input: R2SelectionC0AclInputV1) {
    const scopeHash = hashCanonicalJsonV1(input);
    return this.scopes.has(scopeHash)
      ? createR2SelectionC0AclDecisionV1({
          allowed: true,
          policyId: "r2-local-isolated-exact-acl",
          policyRevision: `r${this.revision}`,
          scopeHash,
        })
      : createR2SelectionC0AclDecisionV1({
          allowed: false,
          reasonCode: "r2_exact_acl_denied",
          scopeHash,
        });
  }

  issueR2SelectionC0LocalExecutionAssertionV1(input: Readonly<{
    scope: R2SelectionC0AclInputV1;
    decision: Extract<R2SelectionC0AclDecisionV1, Readonly<{ allowed: true }>>;
  }>) {
    const scopeHash = hashCanonicalJsonV1(input.scope);
    const issuedDecision = createR2SelectionC0AclDecisionV1({
      allowed: true,
      policyId: "r2-local-isolated-exact-acl",
      policyRevision: `r${this.revision}`,
      scopeHash,
    });
    if (!issuedDecision.allowed) throw new Error("r2_local_acl_internal_error");
    if (
      !this.scopes.has(scopeHash) ||
      issuedDecision.decisionHash !== input.decision.decisionHash ||
      issuedDecision.policyRevision !== input.decision.policyRevision
    ) {
      throw new R2SelectionC0HostAuthorityErrorV1(
        "r2_exact_acl_denied",
        "R2 local ACL denied execution assertion issuance."
      );
    }
    const expectedDecisionHash = input.decision.decisionHash;
    const expectedRevision = input.decision.policyRevision;
    return Object.freeze({
      assertCurrent: () => {
        const current = this.scopes.has(scopeHash)
          ? createR2SelectionC0AclDecisionV1({
              allowed: true,
              policyId: "r2-local-isolated-exact-acl",
              policyRevision: `r${this.revision}`,
              scopeHash,
            })
          : null;
        if (
          !current ||
          !current.allowed ||
          current.decisionHash !== expectedDecisionHash ||
          current.policyRevision !== expectedRevision
        ) {
          throw new R2SelectionC0HostAuthorityErrorV1(
            "r2_execution_acl_changed",
            "R2 local ACL changed before the fenced execution write."
          );
        }
      },
    });
  }
}

export type R2SelectionC0HostReceiptV1 = Readonly<{
  contractVersion: typeof R2_SELECTION_C0_HOST_AUTHORITY_V1.receiptVersion;
  receiptId: string;
  principalHash: string;
  aclScopeHash: string;
  aclDecisionHash: string;
  requestId: string;
  envelopeId: string;
  workspaceId: string;
  sessionId: string;
  documentId: string;
  mountId: string;
  routePath: string;
  threadId: string;
  turnId: string;
  runId: string;
  observationHash: string;
  selectionHash: string;
  requestBodyHash: string;
  queryHash: string;
  issuedAt: string;
  expiresAt: string;
  receiptHash: string;
}>;

export class R2SelectionC0HostAuthorityErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "R2SelectionC0HostAuthorityErrorV1";
  }
}

const receiptMaterial = (
  receipt: Omit<R2SelectionC0HostReceiptV1, "receiptHash">
) => receipt;

type R2SelectionC0HostReceiptMaterialInputV1 = Readonly<{
  principal: EffectiveFactsAuthenticatedPrincipalV1;
  observation: DecodedR2SelectionC0TurnObservationV1;
  requestId: string;
  envelopeId: string;
  workspaceId: string;
  sessionId: string;
  documentId: string;
  threadId: string;
  turnId: string;
  runId: string;
  requestBodyHash: string;
  queryHash: string;
  issuedAt: string;
  ttlMs: number;
}>;

const validateR2SelectionC0HostReceiptMaterialV1 = (
  input: R2SelectionC0HostReceiptMaterialInputV1
) => {
  if (
    !Number.isInteger(input.ttlMs) ||
    input.ttlMs < R2_SELECTION_C0_HOST_AUTHORITY_V1.minimumTtlMs ||
    input.ttlMs > R2_SELECTION_C0_HOST_AUTHORITY_V1.maximumTtlMs
  ) {
    throw new R2SelectionC0HostAuthorityErrorV1(
      "r2_host_receipt_ttl_invalid",
      "R2 Host receipt TTL is outside the frozen bound."
    );
  }
  const issuedAt = requiredTimestampV1(input.issuedAt, "r2HostReceipt.issuedAt");
  const issuedAtEpoch = Date.parse(issuedAt);
  const capturedAt = requiredTimestampV1(
    input.observation.hostObservation.capturedAt,
    "r2HostReceipt.capturedAt"
  );
  const capturedAtEpoch = Date.parse(capturedAt);
  if (
    capturedAtEpoch >
    issuedAtEpoch + R2_SELECTION_C0_HOST_AUTHORITY_V1.maximumFutureSkewMs
  ) {
    throw new R2SelectionC0HostAuthorityErrorV1(
      "r2_host_observation_future",
      "R2 Host observation is ahead of the trusted server clock."
    );
  }
  const snapshotExpiresAt =
    capturedAtEpoch + R2_SELECTION_C0_HOST_AUTHORITY_V1.snapshotTtlMs;
  if (snapshotExpiresAt <= issuedAtEpoch) {
    throw new R2SelectionC0HostAuthorityErrorV1(
      "r2_host_observation_stale",
      "R2 Host observation freshness window has expired."
    );
  }
  return { issuedAt, issuedAtEpoch, snapshotExpiresAt } as const;
};

/** Synchronous receipt constructor for an ACL decision obtained immediately
 * before a main Store transaction. The caller must persist this receipt in the
 * same transaction as the generated Thread/Turn/Run identities. */
export const createAuthorizedR2SelectionC0HostReceiptV1 = (
  input: R2SelectionC0HostReceiptMaterialInputV1 &
    Readonly<{ aclLease: R2SelectionC0AclReservationLeaseV1 }>
): R2SelectionC0HostReceiptV1 => {
  const { issuedAt, issuedAtEpoch, snapshotExpiresAt } =
    validateR2SelectionC0HostReceiptMaterialV1(input);
  const aclDecision = consumeR2SelectionC0AclReservationLeaseV1(
    input.aclLease,
    {
      principal: input.principal,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      documentId: input.documentId,
      mountId: input.observation.hostObservation.mountId,
      routePath: input.observation.hostObservation.routePath,
    }
  );
  const material = {
    contractVersion: R2_SELECTION_C0_HOST_AUTHORITY_V1.receiptVersion,
    receiptId: `r2-host-receipt-${randomUUID()}`,
    principalHash: hashCanonicalJsonV1(input.principal),
    aclScopeHash: hashCanonicalJsonV1({
      principal: input.principal,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      documentId: input.documentId,
      mountId: input.observation.hostObservation.mountId,
      routePath: input.observation.hostObservation.routePath,
    }),
    aclDecisionHash: requiredHashV1(
      aclDecision.decisionHash,
      "r2HostReceipt.aclDecisionHash"
    ),
    requestId: requiredIdV1(input.requestId, "r2HostReceipt.requestId"),
    envelopeId: requiredIdV1(input.envelopeId, "r2HostReceipt.envelopeId"),
    workspaceId: requiredIdV1(input.workspaceId, "r2HostReceipt.workspaceId"),
    sessionId: requiredIdV1(input.sessionId, "r2HostReceipt.sessionId"),
    documentId: requiredIdV1(input.documentId, "r2HostReceipt.documentId"),
    mountId: requiredRuntimeMountIdV1(
      input.observation.hostObservation.mountId,
      "r2HostReceipt.mountId"
    ),
    routePath: input.observation.hostObservation.routePath,
    threadId: requiredIdV1(input.threadId, "r2HostReceipt.threadId"),
    turnId: requiredIdV1(input.turnId, "r2HostReceipt.turnId"),
    runId: requiredIdV1(input.runId, "r2HostReceipt.runId"),
    observationHash: hashCanonicalJsonV1(input.observation),
    selectionHash: hashCanonicalJsonV1({
      selectedNodeRefs: input.observation.hostObservation.selectedNodeRefs,
      pointer: input.observation.hostObservation.pointer,
      readbackHash: input.observation.hostObservation.readbackHash,
    }),
    requestBodyHash: requiredHashV1(
      input.requestBodyHash,
      "r2HostReceipt.requestBodyHash"
    ),
    queryHash: requiredHashV1(input.queryHash, "r2HostReceipt.queryHash"),
    issuedAt,
    expiresAt: new Date(
      Math.min(snapshotExpiresAt, issuedAtEpoch + input.ttlMs)
    ).toISOString(),
  } as const;
  return Object.freeze({
    ...material,
    receiptHash: hashCanonicalJsonV1(receiptMaterial(material)),
  });
};

export const issueR2SelectionC0HostReceiptV1 = async (
  input: R2SelectionC0HostReceiptMaterialInputV1 &
    Readonly<{ acl: R2SelectionC0AclPortV1 }>
): Promise<R2SelectionC0HostReceiptV1> => {
  validateR2SelectionC0HostReceiptMaterialV1(input);
  const scope = {
    principal: input.principal,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    documentId: input.documentId,
    mountId: input.observation.hostObservation.mountId,
    routePath: input.observation.hostObservation.routePath,
  } as const;
  const aclLease = await issueR2SelectionC0AclReservationLeaseV1({
    acl: input.acl,
    scope,
  });
  return createAuthorizedR2SelectionC0HostReceiptV1({
    ...input,
    aclLease,
  });
};

export const decodeR2SelectionC0HostReceiptV1 = (
  value: unknown
): R2SelectionC0HostReceiptV1 => {
  const record = strictRecordV1(
    value,
    [
      "contractVersion", "receiptId", "principalHash", "aclScopeHash", "aclDecisionHash",
      "requestId", "envelopeId", "workspaceId", "sessionId", "documentId",
      "mountId", "routePath", "threadId", "turnId", "runId", "observationHash",
      "selectionHash", "requestBodyHash", "queryHash", "issuedAt", "expiresAt",
      "receiptHash",
    ],
    "r2HostReceipt"
  );
  if (record.contractVersion !== R2_SELECTION_C0_HOST_AUTHORITY_V1.receiptVersion) {
    throw new R2SelectionC0HostAuthorityErrorV1(
      "r2_host_receipt_version_invalid",
      "R2 Host receipt version is invalid."
    );
  }
  const base = {
    contractVersion: R2_SELECTION_C0_HOST_AUTHORITY_V1.receiptVersion,
    receiptId: requiredIdV1(record.receiptId, "r2HostReceipt.receiptId"),
    principalHash: requiredHashV1(record.principalHash, "r2HostReceipt.principalHash"),
    aclScopeHash: requiredHashV1(record.aclScopeHash, "r2HostReceipt.aclScopeHash"),
    aclDecisionHash: requiredHashV1(record.aclDecisionHash, "r2HostReceipt.aclDecisionHash"),
    requestId: requiredIdV1(record.requestId, "r2HostReceipt.requestId"),
    envelopeId: requiredIdV1(record.envelopeId, "r2HostReceipt.envelopeId"),
    workspaceId: requiredIdV1(record.workspaceId, "r2HostReceipt.workspaceId"),
    sessionId: requiredIdV1(record.sessionId, "r2HostReceipt.sessionId"),
    documentId: requiredIdV1(record.documentId, "r2HostReceipt.documentId"),
    mountId: requiredRuntimeMountIdV1(record.mountId, "r2HostReceipt.mountId"),
    routePath: requiredStringV1(record.routePath, "r2HostReceipt.routePath", 240),
    threadId: requiredIdV1(record.threadId, "r2HostReceipt.threadId"),
    turnId: requiredIdV1(record.turnId, "r2HostReceipt.turnId"),
    runId: requiredIdV1(record.runId, "r2HostReceipt.runId"),
    observationHash: requiredHashV1(record.observationHash, "r2HostReceipt.observationHash"),
    selectionHash: requiredHashV1(record.selectionHash, "r2HostReceipt.selectionHash"),
    requestBodyHash: requiredHashV1(record.requestBodyHash, "r2HostReceipt.requestBodyHash"),
    queryHash: requiredHashV1(record.queryHash, "r2HostReceipt.queryHash"),
    issuedAt: requiredTimestampV1(record.issuedAt, "r2HostReceipt.issuedAt"),
    expiresAt: requiredTimestampV1(record.expiresAt, "r2HostReceipt.expiresAt"),
  } as const;
  if (Date.parse(base.expiresAt) <= Date.parse(base.issuedAt)) {
    throw new R2SelectionC0HostAuthorityErrorV1(
      "r2_host_receipt_ttl_invalid",
      "R2 Host receipt expiry is invalid."
    );
  }
  const receiptHash = requiredHashV1(record.receiptHash, "r2HostReceipt.receiptHash");
  if (receiptHash !== hashCanonicalJsonV1(base)) {
    throw new R2SelectionC0HostAuthorityErrorV1(
      "r2_host_receipt_hash_mismatch",
      "R2 Host receipt was modified."
    );
  }
  return Object.freeze({ ...base, receiptHash });
};

export const createR2SelectionC0AclDecisionV1 = (
  input: Readonly<
    | { allowed: true; policyId: string; policyRevision: string; scopeHash: string }
    | { allowed: false; reasonCode: string; scopeHash: string }
  >
): R2SelectionC0AclDecisionV1 => {
  const base = input.allowed
    ? {
        contractVersion: R2_SELECTION_C0_HOST_AUTHORITY_V1.aclDecisionVersion,
        allowed: true as const,
        policyId: requiredIdV1(input.policyId, "r2Acl.policyId"),
        policyRevision: requiredIdV1(input.policyRevision, "r2Acl.policyRevision"),
        scopeHash: requiredHashV1(input.scopeHash, "r2Acl.scopeHash"),
      }
    : {
        contractVersion: R2_SELECTION_C0_HOST_AUTHORITY_V1.aclDecisionVersion,
        allowed: false as const,
        reasonCode: requiredIdV1(input.reasonCode, "r2Acl.reasonCode"),
        scopeHash: requiredHashV1(input.scopeHash, "r2Acl.scopeHash"),
      };
  const { scopeHash, ...publicMaterial } = base;
  return Object.freeze({
    ...publicMaterial,
    decisionHash: hashCanonicalJsonV1(base),
  });
};
