import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
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
  UX_EFFECTIVE_FACTS_READ_V1,
  type UxEffectiveFactsCaptureProfileV1,
} from "./effective-facts-read-contract";

export const EFFECTIVE_FACTS_CAPTURE_GRANT_V1 = Object.freeze({
  contractVersion: "effective-facts-capture-grant-v1",
  receiptVersion: "effective-facts-capture-grant-receipt-v1",
  ttlMs: 60_000,
  maxClockSkewMs: 5_000,
  maxActiveGrants: 128,
  maxTokenBytes: 8_192,
  maxUses: 1,
  minimumSecretBytes: 32,
  audience: "landing-page-harness-h1-effective-facts",
  purpose: "capture_and_one_turn_read_only",
  authority: "client_attested_grant_bound_snapshot",
} as const);

export const EFFECTIVE_FACTS_CAPTURE_TARGETS_V1 = Object.freeze({
  "path--container-acceptance": Object.freeze({
    routePath: "/container-acceptance",
    captureProfile: "h1-container-layout-r1",
  }),
  "path--atomic-acceptance": Object.freeze({
    routePath: "/atomic-acceptance",
    captureProfile: "h1-seven-atomic-r1",
  }),
} as const satisfies Readonly<
  Record<
    string,
    Readonly<{
      routePath: string;
      captureProfile: UxEffectiveFactsCaptureProfileV1;
    }>
  >
>);

type CaptureTargetDocumentIdV1 = keyof typeof EFFECTIVE_FACTS_CAPTURE_TARGETS_V1;
type CaptureTargetV1 =
  (typeof EFFECTIVE_FACTS_CAPTURE_TARGETS_V1)[CaptureTargetDocumentIdV1];

export type EffectiveFactsAuthenticatedPrincipalV1 = Readonly<{
  subjectId: string;
  tenantId: string;
  sessionBindingId: string;
  authenticationMethod: string;
  authenticatedAt: string;
}>;

export type EffectiveFactsDocumentAclDecisionV1 =
  | Readonly<{
      allowed: true;
      policyId: string;
      policyRevision: string;
      authorizationDecisionId: string;
    }>
  | Readonly<{
      allowed: false;
      reasonCode: string;
    }>;

export interface EffectiveFactsDocumentAclPortV1 {
  authorize(input: {
    principal: EffectiveFactsAuthenticatedPrincipalV1;
    tenantId: string;
    workspaceId: string;
    sessionId: string;
    sessionBindingId: string;
    documentId: CaptureTargetDocumentIdV1;
    routePath: CaptureTargetV1["routePath"];
    captureProfile: CaptureTargetV1["captureProfile"];
    mountId: string;
  }): Promise<EffectiveFactsDocumentAclDecisionV1>;
}

export type EffectiveFactsCaptureGrantClaimsV1 = Readonly<{
  contractVersion: typeof EFFECTIVE_FACTS_CAPTURE_GRANT_V1.contractVersion;
  grantId: string;
  nonce: string;
  issuerKeyId: string;
  audience: typeof EFFECTIVE_FACTS_CAPTURE_GRANT_V1.audience;
  purpose: typeof EFFECTIVE_FACTS_CAPTURE_GRANT_V1.purpose;
  subjectId: string;
  tenantId: string;
  workspaceId: string;
  sessionId: string;
  sessionBindingId: string;
  documentId: CaptureTargetDocumentIdV1;
  routePath: CaptureTargetV1["routePath"];
  captureProfile: CaptureTargetV1["captureProfile"];
  providerBindingVersion: typeof UX_EFFECTIVE_FACTS_READ_V1.providerBindingVersion;
  capabilityFingerprint: string;
  mountId: string;
  policyId: string;
  policyRevision: string;
  authorizationDecisionId: string;
  issuedAt: string;
  notBefore: string;
  expiresAt: string;
  maxUses: 1;
}>;

export type EffectiveFactsCaptureGrantIssueV1 = Readonly<{
  token: string;
  claims: EffectiveFactsCaptureGrantClaimsV1;
}>;

export type EffectiveFactsCaptureGrantReservationV1 = Readonly<{
  grantId: string;
  reservationId: string;
  requestId: string;
  requestBindingHash: string;
  claimsHash: string;
  tokenHash: string;
}>;

export type EffectiveFactsCaptureGrantReceiptV1 = Readonly<{
  contractVersion: typeof EFFECTIVE_FACTS_CAPTURE_GRANT_V1.receiptVersion;
  authority: typeof EFFECTIVE_FACTS_CAPTURE_GRANT_V1.authority;
  grantId: string;
  issuerKeyId: string;
  requestId: string;
  requestBindingHash: string;
  subjectId: string;
  tenantId: string;
  workspaceId: string;
  sessionId: string;
  documentId: CaptureTargetDocumentIdV1;
  routePath: CaptureTargetV1["routePath"];
  captureProfile: CaptureTargetV1["captureProfile"];
  policyId: string;
  policyRevision: string;
  authorizationDecisionId: string;
  threadId: string;
  turnId: string;
  runId: string;
  mountId: string;
  snapshotFingerprint: string;
  revisionFingerprint: string;
  hostReservationHash: string;
  grantClaimsHash: string;
  grantTokenHash: string;
  grantExpiresAt: string;
  consumedAt: string;
}>;

export class EffectiveFactsCaptureGrantErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "EffectiveFactsCaptureGrantErrorV1";
  }
}

type GrantStateV1 =
  | Readonly<{
      state: "issued";
      claims: EffectiveFactsCaptureGrantClaimsV1;
      claimsHash: string;
      tokenHash: string;
    }>
  | Readonly<{
      state: "reserved";
      claims: EffectiveFactsCaptureGrantClaimsV1;
      claimsHash: string;
      tokenHash: string;
      reservationId: string;
      requestId: string;
      requestBindingHash: string;
    }>
  | Readonly<{
      state: "consumed";
      claims: EffectiveFactsCaptureGrantClaimsV1;
      claimsHash: string;
      tokenHash: string;
      reservationId: string;
      requestId: string;
      requestBindingHash: string;
      receipt: EffectiveFactsCaptureGrantReceiptV1;
    }>;

const sha = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

const encodePayload = (value: unknown) =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const decodePayload = (value: string) => {
  try {
    const bytes = Buffer.from(value, "base64url");
    if (!bytes.length || bytes.byteLength > EFFECTIVE_FACTS_CAPTURE_GRANT_V1.maxTokenBytes) {
      throw new Error("payload_size_invalid");
    }
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new EffectiveFactsCaptureGrantErrorV1(
      "capture_grant_token_invalid",
      "Capture grant token payload is invalid."
    );
  }
};

const targetForDocument = (documentId: string) => {
  if (!Object.hasOwn(EFFECTIVE_FACTS_CAPTURE_TARGETS_V1, documentId)) {
    throw new EffectiveFactsCaptureGrantErrorV1(
      "capture_grant_target_denied",
      "Document is outside the installed Effective Facts target set."
    );
  }
  return EFFECTIVE_FACTS_CAPTURE_TARGETS_V1[
    documentId as CaptureTargetDocumentIdV1
  ];
};

export const decodeEffectiveFactsCaptureGrantReceiptV1 = (
  value: unknown
): EffectiveFactsCaptureGrantReceiptV1 => {
  const record = strictRecordV1(
    value,
    [
      "contractVersion",
      "authority",
      "grantId",
      "issuerKeyId",
      "requestId",
      "requestBindingHash",
      "subjectId",
      "tenantId",
      "workspaceId",
      "sessionId",
      "documentId",
      "routePath",
      "captureProfile",
      "policyId",
      "policyRevision",
      "authorizationDecisionId",
      "threadId",
      "turnId",
      "runId",
      "mountId",
      "snapshotFingerprint",
      "revisionFingerprint",
      "hostReservationHash",
      "grantClaimsHash",
      "grantTokenHash",
      "grantExpiresAt",
      "consumedAt",
    ],
    "effectiveFactsCaptureGrantReceipt"
  );
  if (
    record.contractVersion !== EFFECTIVE_FACTS_CAPTURE_GRANT_V1.receiptVersion ||
    record.authority !== EFFECTIVE_FACTS_CAPTURE_GRANT_V1.authority
  ) {
    throw new EffectiveFactsCaptureGrantErrorV1(
      "capture_grant_receipt_contract_mismatch",
      "Capture Grant Receipt contract identity differs."
    );
  }
  const documentId = requiredIdV1(
    record.documentId,
    "effectiveFactsCaptureGrantReceipt.documentId"
  );
  const target = targetForDocument(documentId);
  const routePath = requiredStringV1(
    record.routePath,
    "effectiveFactsCaptureGrantReceipt.routePath",
    160
  );
  const captureProfile = requiredStringV1(
    record.captureProfile,
    "effectiveFactsCaptureGrantReceipt.captureProfile",
    80
  );
  if (
    routePath !== target.routePath ||
    captureProfile !== target.captureProfile
  ) {
    throw new EffectiveFactsCaptureGrantErrorV1(
      "capture_grant_receipt_target_mismatch",
      "Capture Grant Receipt document, route, and profile do not agree."
    );
  }
  const grantExpiresAt = requiredTimestampV1(
    record.grantExpiresAt,
    "effectiveFactsCaptureGrantReceipt.grantExpiresAt"
  );
  const consumedAt = requiredTimestampV1(
    record.consumedAt,
    "effectiveFactsCaptureGrantReceipt.consumedAt"
  );
  if (Date.parse(consumedAt) > Date.parse(grantExpiresAt)) {
    throw new EffectiveFactsCaptureGrantErrorV1(
      "capture_grant_receipt_timing_invalid",
      "Capture Grant Receipt was consumed after its Grant expiry."
    );
  }
  return {
    contractVersion: EFFECTIVE_FACTS_CAPTURE_GRANT_V1.receiptVersion,
    authority: EFFECTIVE_FACTS_CAPTURE_GRANT_V1.authority,
    grantId: requiredIdV1(
      record.grantId,
      "effectiveFactsCaptureGrantReceipt.grantId"
    ),
    issuerKeyId: requiredIdV1(
      record.issuerKeyId,
      "effectiveFactsCaptureGrantReceipt.issuerKeyId"
    ),
    requestId: requiredIdV1(
      record.requestId,
      "effectiveFactsCaptureGrantReceipt.requestId"
    ),
    requestBindingHash: requiredHashV1(
      record.requestBindingHash,
      "effectiveFactsCaptureGrantReceipt.requestBindingHash"
    ),
    subjectId: requiredIdV1(
      record.subjectId,
      "effectiveFactsCaptureGrantReceipt.subjectId"
    ),
    tenantId: requiredIdV1(
      record.tenantId,
      "effectiveFactsCaptureGrantReceipt.tenantId"
    ),
    workspaceId: requiredIdV1(
      record.workspaceId,
      "effectiveFactsCaptureGrantReceipt.workspaceId"
    ),
    sessionId: requiredIdV1(
      record.sessionId,
      "effectiveFactsCaptureGrantReceipt.sessionId"
    ),
    documentId: documentId as CaptureTargetDocumentIdV1,
    routePath: routePath as CaptureTargetV1["routePath"],
    captureProfile: captureProfile as CaptureTargetV1["captureProfile"],
    policyId: requiredIdV1(
      record.policyId,
      "effectiveFactsCaptureGrantReceipt.policyId"
    ),
    policyRevision: requiredIdV1(
      record.policyRevision,
      "effectiveFactsCaptureGrantReceipt.policyRevision"
    ),
    authorizationDecisionId: requiredIdV1(
      record.authorizationDecisionId,
      "effectiveFactsCaptureGrantReceipt.authorizationDecisionId"
    ),
    threadId: requiredIdV1(
      record.threadId,
      "effectiveFactsCaptureGrantReceipt.threadId"
    ),
    turnId: requiredIdV1(
      record.turnId,
      "effectiveFactsCaptureGrantReceipt.turnId"
    ),
    runId: requiredIdV1(
      record.runId,
      "effectiveFactsCaptureGrantReceipt.runId"
    ),
    mountId: requiredRuntimeMountIdV1(
      record.mountId,
      "effectiveFactsCaptureGrantReceipt.mountId"
    ),
    snapshotFingerprint: requiredHashV1(
      record.snapshotFingerprint,
      "effectiveFactsCaptureGrantReceipt.snapshotFingerprint"
    ),
    revisionFingerprint: requiredHashV1(
      record.revisionFingerprint,
      "effectiveFactsCaptureGrantReceipt.revisionFingerprint"
    ),
    hostReservationHash: requiredHashV1(
      record.hostReservationHash,
      "effectiveFactsCaptureGrantReceipt.hostReservationHash"
    ),
    grantClaimsHash: requiredHashV1(
      record.grantClaimsHash,
      "effectiveFactsCaptureGrantReceipt.grantClaimsHash"
    ),
    grantTokenHash: requiredHashV1(
      record.grantTokenHash,
      "effectiveFactsCaptureGrantReceipt.grantTokenHash"
    ),
    grantExpiresAt,
    consumedAt,
  };
};

const decodeClaims = (value: unknown): EffectiveFactsCaptureGrantClaimsV1 => {
  const record = strictRecordV1(
    value,
    [
      "contractVersion",
      "grantId",
      "nonce",
      "issuerKeyId",
      "audience",
      "purpose",
      "subjectId",
      "tenantId",
      "workspaceId",
      "sessionId",
      "sessionBindingId",
      "documentId",
      "routePath",
      "captureProfile",
      "providerBindingVersion",
      "capabilityFingerprint",
      "mountId",
      "policyId",
      "policyRevision",
      "authorizationDecisionId",
      "issuedAt",
      "notBefore",
      "expiresAt",
      "maxUses",
    ],
    "effectiveFactsCaptureGrant"
  );
  if (
    record.contractVersion !== EFFECTIVE_FACTS_CAPTURE_GRANT_V1.contractVersion ||
    record.providerBindingVersion !==
      UX_EFFECTIVE_FACTS_READ_V1.providerBindingVersion ||
    record.audience !== EFFECTIVE_FACTS_CAPTURE_GRANT_V1.audience ||
    record.purpose !== EFFECTIVE_FACTS_CAPTURE_GRANT_V1.purpose ||
    record.maxUses !== EFFECTIVE_FACTS_CAPTURE_GRANT_V1.maxUses
  ) {
    throw new EffectiveFactsCaptureGrantErrorV1(
      "capture_grant_contract_mismatch",
      "Capture grant contract identity differs."
    );
  }
  const documentId = requiredIdV1(
    record.documentId,
    "effectiveFactsCaptureGrant.documentId"
  );
  const target = targetForDocument(documentId);
  const routePath = requiredStringV1(
    record.routePath,
    "effectiveFactsCaptureGrant.routePath",
    160
  );
  const captureProfile = requiredStringV1(
    record.captureProfile,
    "effectiveFactsCaptureGrant.captureProfile",
    80
  );
  if (
    routePath !== target.routePath ||
    captureProfile !== target.captureProfile
  ) {
    throw new EffectiveFactsCaptureGrantErrorV1(
      "capture_grant_target_mismatch",
      "Capture grant document, route, and profile do not agree."
    );
  }
  const capabilityFingerprint = requiredHashV1(
    record.capabilityFingerprint,
    "effectiveFactsCaptureGrant.capabilityFingerprint"
  );
  if (
    capabilityFingerprint !== UX_EFFECTIVE_FACTS_CAPABILITY_FINGERPRINT_V1
  ) {
    throw new EffectiveFactsCaptureGrantErrorV1(
      "capture_grant_capability_mismatch",
      "Capture grant capability fingerprint differs."
    );
  }
  return {
    contractVersion: EFFECTIVE_FACTS_CAPTURE_GRANT_V1.contractVersion,
    grantId: requiredIdV1(record.grantId, "effectiveFactsCaptureGrant.grantId"),
    nonce: requiredIdV1(record.nonce, "effectiveFactsCaptureGrant.nonce"),
    issuerKeyId: requiredIdV1(
      record.issuerKeyId,
      "effectiveFactsCaptureGrant.issuerKeyId"
    ),
    audience: EFFECTIVE_FACTS_CAPTURE_GRANT_V1.audience,
    purpose: EFFECTIVE_FACTS_CAPTURE_GRANT_V1.purpose,
    subjectId: requiredIdV1(
      record.subjectId,
      "effectiveFactsCaptureGrant.subjectId"
    ),
    tenantId: requiredIdV1(
      record.tenantId,
      "effectiveFactsCaptureGrant.tenantId"
    ),
    workspaceId: requiredIdV1(
      record.workspaceId,
      "effectiveFactsCaptureGrant.workspaceId"
    ),
    sessionId: requiredIdV1(
      record.sessionId,
      "effectiveFactsCaptureGrant.sessionId"
    ),
    sessionBindingId: requiredIdV1(
      record.sessionBindingId,
      "effectiveFactsCaptureGrant.sessionBindingId"
    ),
    documentId: documentId as CaptureTargetDocumentIdV1,
    routePath: routePath as CaptureTargetV1["routePath"],
    captureProfile: captureProfile as CaptureTargetV1["captureProfile"],
    providerBindingVersion: UX_EFFECTIVE_FACTS_READ_V1.providerBindingVersion,
    capabilityFingerprint,
    mountId: requiredRuntimeMountIdV1(
      record.mountId,
      "effectiveFactsCaptureGrant.mountId"
    ),
    policyId: requiredIdV1(
      record.policyId,
      "effectiveFactsCaptureGrant.policyId"
    ),
    policyRevision: requiredIdV1(
      record.policyRevision,
      "effectiveFactsCaptureGrant.policyRevision"
    ),
    authorizationDecisionId: requiredIdV1(
      record.authorizationDecisionId,
      "effectiveFactsCaptureGrant.authorizationDecisionId"
    ),
    issuedAt: requiredTimestampV1(
      record.issuedAt,
      "effectiveFactsCaptureGrant.issuedAt"
    ),
    notBefore: requiredTimestampV1(
      record.notBefore,
      "effectiveFactsCaptureGrant.notBefore"
    ),
    expiresAt: requiredTimestampV1(
      record.expiresAt,
      "effectiveFactsCaptureGrant.expiresAt"
    ),
    maxUses: 1,
  };
};

const validatePrincipal = (value: EffectiveFactsAuthenticatedPrincipalV1) => {
  const subjectId = requiredIdV1(value.subjectId, "principal.subjectId");
  const tenantId = requiredIdV1(value.tenantId, "principal.tenantId");
  const sessionBindingId = requiredIdV1(
    value.sessionBindingId,
    "principal.sessionBindingId"
  );
  const authenticationMethod = requiredIdV1(
    value.authenticationMethod,
    "principal.authenticationMethod"
  );
  const authenticatedAt = requiredTimestampV1(
    value.authenticatedAt,
    "principal.authenticatedAt"
  );
  return {
    subjectId,
    tenantId,
    sessionBindingId,
    authenticationMethod,
    authenticatedAt,
  };
};

export class EffectiveFactsCaptureGrantServiceV1 {
  private readonly secret: string;
  private readonly grants = new Map<string, GrantStateV1>();

  constructor(
    secret: string | Uint8Array,
    private readonly acl: EffectiveFactsDocumentAclPortV1,
    private readonly clock: () => number = Date.now,
    private readonly issuerKeyId = "h1-local-candidate-key-v1"
  ) {
    const secretBytes =
      typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
    this.secret = Buffer.from(secretBytes).toString("base64url");
    if (secretBytes.byteLength < EFFECTIVE_FACTS_CAPTURE_GRANT_V1.minimumSecretBytes) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_secret_invalid",
        "Capture grant secret must contain at least 32 bytes."
      );
    }
    requiredIdV1(this.issuerKeyId, "captureGrant.issuerKeyId");
  }

  private prune() {
    const now = this.clock();
    for (const [grantId, grant] of this.grants) {
      if (Date.parse(grant.claims.expiresAt) <= now) this.grants.delete(grantId);
    }
  }

  private sign(payload: string) {
    return createHmac("sha256", this.secret)
      .update(payload, "utf8")
      .digest("base64url");
  }

  private verifyToken(token: string) {
    if (
      !token ||
      Buffer.byteLength(token, "utf8") > EFFECTIVE_FACTS_CAPTURE_GRANT_V1.maxTokenBytes
    ) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_token_invalid",
        "Capture grant token is invalid."
      );
    }
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_token_invalid",
        "Capture grant token is malformed."
      );
    }
    const expected = new TextEncoder().encode(this.sign(parts[0]));
    const actual = new TextEncoder().encode(parts[1]);
    if (expected.byteLength !== actual.byteLength || !timingSafeEqual(expected, actual)) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_signature_invalid",
        "Capture grant signature is invalid."
      );
    }
    const claims = decodeClaims(decodePayload(parts[0]));
    const now = this.clock();
    const issuedAt = Date.parse(claims.issuedAt);
    const notBefore = Date.parse(claims.notBefore);
    const expiresAt = Date.parse(claims.expiresAt);
    if (
      issuedAt > now + EFFECTIVE_FACTS_CAPTURE_GRANT_V1.maxClockSkewMs ||
      notBefore > now + EFFECTIVE_FACTS_CAPTURE_GRANT_V1.maxClockSkewMs ||
      notBefore !== issuedAt ||
      expiresAt <= now ||
      expiresAt - issuedAt !== EFFECTIVE_FACTS_CAPTURE_GRANT_V1.ttlMs
    ) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_expired",
        "Capture grant is expired or has invalid timing."
      );
    }
    return { claims, tokenHash: sha(token), claimsHash: hashCanonicalV1(claims) };
  }

  async issue(input: {
    principal: EffectiveFactsAuthenticatedPrincipalV1;
    workspaceId: string;
    sessionId: string;
    documentId: string;
    mountId: string;
  }): Promise<EffectiveFactsCaptureGrantIssueV1> {
    this.prune();
    const principal = validatePrincipal(input.principal);
    const workspaceId = requiredIdV1(input.workspaceId, "captureGrant.workspaceId");
    const sessionId = requiredIdV1(input.sessionId, "captureGrant.sessionId");
    const documentId = requiredIdV1(input.documentId, "captureGrant.documentId");
    const mountId = requiredRuntimeMountIdV1(
      input.mountId,
      "captureGrant.mountId"
    );
    const target = targetForDocument(documentId);
    if (this.grants.size >= EFFECTIVE_FACTS_CAPTURE_GRANT_V1.maxActiveGrants) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_capacity_exceeded",
        "Capture grant service reached its active grant limit."
      );
    }
    const decision = await this.acl.authorize({
      principal,
      tenantId: principal.tenantId,
      workspaceId,
      sessionId,
      sessionBindingId: principal.sessionBindingId,
      documentId: documentId as CaptureTargetDocumentIdV1,
      routePath: target.routePath,
      captureProfile: target.captureProfile,
      mountId,
    });
    if (!decision.allowed) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_acl_denied",
        `Capture grant denied: ${decision.reasonCode}.`
      );
    }
    const issuedAtEpoch = this.clock();
    const claims: EffectiveFactsCaptureGrantClaimsV1 = {
      contractVersion: EFFECTIVE_FACTS_CAPTURE_GRANT_V1.contractVersion,
      grantId: `grant-${randomUUID()}`,
      nonce: `nonce-${randomBytes(24).toString("hex")}`,
      issuerKeyId: this.issuerKeyId,
      audience: EFFECTIVE_FACTS_CAPTURE_GRANT_V1.audience,
      purpose: EFFECTIVE_FACTS_CAPTURE_GRANT_V1.purpose,
      subjectId: principal.subjectId,
      tenantId: principal.tenantId,
      workspaceId,
      sessionId,
      sessionBindingId: principal.sessionBindingId,
      documentId: documentId as CaptureTargetDocumentIdV1,
      routePath: target.routePath,
      captureProfile: target.captureProfile,
      providerBindingVersion: UX_EFFECTIVE_FACTS_READ_V1.providerBindingVersion,
      capabilityFingerprint: UX_EFFECTIVE_FACTS_CAPABILITY_FINGERPRINT_V1,
      mountId,
      policyId: requiredIdV1(decision.policyId, "captureGrant.policyId"),
      policyRevision: requiredIdV1(
        decision.policyRevision,
        "captureGrant.policyRevision"
      ),
      authorizationDecisionId: requiredIdV1(
        decision.authorizationDecisionId,
        "captureGrant.authorizationDecisionId"
      ),
      issuedAt: new Date(issuedAtEpoch).toISOString(),
      notBefore: new Date(issuedAtEpoch).toISOString(),
      expiresAt: new Date(
        issuedAtEpoch + EFFECTIVE_FACTS_CAPTURE_GRANT_V1.ttlMs
      ).toISOString(),
      maxUses: 1,
    };
    const payload = encodePayload(claims);
    const token = `${payload}.${this.sign(payload)}`;
    const state: GrantStateV1 = {
      state: "issued",
      claims,
      claimsHash: hashCanonicalV1(claims),
      tokenHash: sha(token),
    };
    this.grants.set(claims.grantId, state);
    return { token, claims: structuredClone(claims) };
  }

  async reserve(input: {
    token: string;
    principal: EffectiveFactsAuthenticatedPrincipalV1;
    requestId: string;
    workspaceId: string;
    sessionId: string;
    documentId: string;
    mountId: string;
    snapshotFingerprint: string;
    revisionFingerprint: string;
    hostReservationHash: string;
  }): Promise<EffectiveFactsCaptureGrantReservationV1> {
    this.prune();
    const principal = validatePrincipal(input.principal);
    const requestId = requiredIdV1(input.requestId, "captureGrant.requestId");
    const verified = this.verifyToken(input.token);
    const snapshotFingerprint = requiredHashV1(
      input.snapshotFingerprint,
      "captureGrant.snapshotFingerprint"
    );
    const revisionFingerprint = requiredHashV1(
      input.revisionFingerprint,
      "captureGrant.revisionFingerprint"
    );
    const hostReservationHash = requiredHashV1(
      input.hostReservationHash,
      "captureGrant.hostReservationHash"
    );
    if (
      verified.claims.subjectId !== principal.subjectId ||
      verified.claims.tenantId !== principal.tenantId ||
      verified.claims.sessionBindingId !== principal.sessionBindingId ||
      verified.claims.workspaceId !== input.workspaceId ||
      verified.claims.sessionId !== input.sessionId ||
      verified.claims.documentId !== input.documentId ||
      verified.claims.mountId !== input.mountId
    ) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_scope_mismatch",
        "Capture grant differs from the authenticated request scope."
      );
    }
    const state = this.grants.get(verified.claims.grantId);
    if (
      !state ||
      state.claimsHash !== verified.claimsHash ||
      state.tokenHash !== verified.tokenHash
    ) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_not_issued",
        "Capture grant is not active in this Host process."
      );
    }
    const requestBindingHash = hashCanonicalV1({
      grantId: state.claims.grantId,
      requestId,
      subjectId: principal.subjectId,
      tenantId: principal.tenantId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      sessionBindingId: principal.sessionBindingId,
      documentId: input.documentId,
      mountId: input.mountId,
      snapshotFingerprint,
      revisionFingerprint,
      hostReservationHash,
    });
    if (state.state === "reserved") {
      if (
        state.requestId === requestId &&
        state.requestBindingHash === requestBindingHash
      ) {
        return {
          grantId: state.claims.grantId,
          reservationId: state.reservationId,
          requestId: state.requestId,
          requestBindingHash: state.requestBindingHash,
          claimsHash: state.claimsHash,
          tokenHash: state.tokenHash,
        };
      }
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_replay_denied",
        "Capture grant is reserved for a different Turn request."
      );
    }
    if (state.state === "consumed") {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_replay_denied",
        "Capture grant has already been consumed."
      );
    }
    const decision = await this.acl.authorize({
      principal,
      tenantId: principal.tenantId,
      workspaceId: state.claims.workspaceId,
      sessionId: state.claims.sessionId,
      sessionBindingId: principal.sessionBindingId,
      documentId: state.claims.documentId,
      routePath: state.claims.routePath,
      captureProfile: state.claims.captureProfile,
      mountId: state.claims.mountId,
    });
    if (
      !decision.allowed ||
      decision.policyId !== state.claims.policyId ||
      decision.policyRevision !== state.claims.policyRevision
    ) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_acl_changed",
        "Document authorization changed before grant reservation."
      );
    }
    // ACL may be asynchronous. Re-read the authoritative one-time state after
    // the await so concurrent reserve attempts cannot both transition a stale
    // `issued` object.
    const latest = this.grants.get(state.claims.grantId);
    if (
      !latest ||
      latest.claimsHash !== state.claimsHash ||
      latest.tokenHash !== state.tokenHash
    ) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_not_issued",
        "Capture grant changed while authorization was being checked."
      );
    }
    if (Date.parse(latest.claims.expiresAt) <= this.clock()) {
      this.grants.delete(latest.claims.grantId);
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_expired",
        "Capture grant expired while authorization was being checked."
      );
    }
    if (latest.state === "reserved") {
      if (
        latest.requestId === requestId &&
        latest.requestBindingHash === requestBindingHash
      ) {
        return {
          grantId: latest.claims.grantId,
          reservationId: latest.reservationId,
          requestId: latest.requestId,
          requestBindingHash: latest.requestBindingHash,
          claimsHash: latest.claimsHash,
          tokenHash: latest.tokenHash,
        };
      }
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_replay_denied",
        "Capture grant was concurrently reserved for a different Turn."
      );
    }
    if (latest.state === "consumed") {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_replay_denied",
        "Capture grant was consumed while authorization was being checked."
      );
    }
    const reservationId = `grant-reservation-${randomUUID()}`;
    this.grants.set(latest.claims.grantId, {
      ...latest,
      state: "reserved",
      reservationId,
      requestId,
      requestBindingHash,
    });
    return {
      grantId: latest.claims.grantId,
      reservationId,
      requestId,
      requestBindingHash,
      claimsHash: latest.claimsHash,
      tokenHash: latest.tokenHash,
    };
  }

  async commit(input: {
    reservation: EffectiveFactsCaptureGrantReservationV1;
    principal: EffectiveFactsAuthenticatedPrincipalV1;
    identity: RunBoundCanvasReadIdentityV1;
    snapshotFingerprint: string;
    revisionFingerprint: string;
    hostReservationHash: string;
  }): Promise<EffectiveFactsCaptureGrantReceiptV1> {
    this.prune();
    const principal = validatePrincipal(input.principal);
    const state = this.grants.get(input.reservation.grantId);
    const commitBindingHash = hashCanonicalV1({
      grantId: input.reservation.grantId,
      requestId: input.reservation.requestId,
      subjectId: principal.subjectId,
      tenantId: principal.tenantId,
      workspaceId: input.identity.workspaceId,
      sessionId: input.identity.sessionId,
      sessionBindingId: principal.sessionBindingId,
      documentId: input.identity.documentId,
      mountId: input.identity.mountId,
      snapshotFingerprint: input.snapshotFingerprint,
      revisionFingerprint: input.revisionFingerprint,
      hostReservationHash: input.hostReservationHash,
    });
    if (
      state?.state === "consumed" &&
      state.reservationId === input.reservation.reservationId &&
      state.requestId === input.reservation.requestId &&
      state.requestBindingHash === commitBindingHash &&
      state.requestBindingHash === input.reservation.requestBindingHash
    ) {
      return structuredClone(state.receipt);
    }
    if (
      !state ||
      state.state !== "reserved" ||
      state.reservationId !== input.reservation.reservationId ||
      state.requestId !== input.reservation.requestId ||
      state.requestBindingHash !== input.reservation.requestBindingHash ||
      state.requestBindingHash !== commitBindingHash ||
      state.claimsHash !== input.reservation.claimsHash ||
      state.tokenHash !== input.reservation.tokenHash
    ) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_reservation_invalid",
        "Capture grant reservation is missing or differs."
      );
    }
    if (
      state.claims.subjectId !== principal.subjectId ||
      state.claims.tenantId !== principal.tenantId ||
      state.claims.sessionBindingId !== principal.sessionBindingId ||
      state.claims.workspaceId !== input.identity.workspaceId ||
      state.claims.sessionId !== input.identity.sessionId ||
      state.claims.documentId !== input.identity.documentId
    ) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_identity_mismatch",
        "Capture grant differs from the Host-owned Run identity."
      );
    }
    if (state.claims.mountId !== input.identity.mountId) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_identity_mismatch",
        "Capture grant differs from the current editor mount."
      );
    }
    const decision = await this.acl.authorize({
      principal,
      tenantId: principal.tenantId,
      workspaceId: state.claims.workspaceId,
      sessionId: state.claims.sessionId,
      sessionBindingId: principal.sessionBindingId,
      documentId: state.claims.documentId,
      routePath: state.claims.routePath,
      captureProfile: state.claims.captureProfile,
      mountId: state.claims.mountId,
    });
    if (
      !decision.allowed ||
      decision.policyId !== state.claims.policyId ||
      decision.policyRevision !== state.claims.policyRevision
    ) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_acl_changed",
        "Document authorization changed before grant consumption."
      );
    }
    // Commit authorization is asynchronous too. Re-read the one-time state so
    // concurrent idempotent commits return the single winning receipt instead
    // of minting two receipts with different decision/timestamp material.
    const latest = this.grants.get(state.claims.grantId);
    if (
      latest?.state === "consumed" &&
      latest.reservationId === input.reservation.reservationId &&
      latest.requestId === input.reservation.requestId &&
      latest.requestBindingHash === commitBindingHash &&
      latest.requestBindingHash === input.reservation.requestBindingHash
    ) {
      return structuredClone(latest.receipt);
    }
    if (latest && Date.parse(latest.claims.expiresAt) <= this.clock()) {
      this.grants.delete(latest.claims.grantId);
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_expired",
        "Capture grant expired while commit authorization was being checked."
      );
    }
    if (
      !latest ||
      latest.state !== "reserved" ||
      latest.reservationId !== state.reservationId ||
      latest.requestId !== state.requestId ||
      latest.requestBindingHash !== state.requestBindingHash ||
      latest.claimsHash !== state.claimsHash ||
      latest.tokenHash !== state.tokenHash
    ) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_reservation_invalid",
        "Capture grant changed while commit authorization was being checked."
      );
    }
    requiredIdV1(input.identity.threadId, "captureGrant.identity.threadId");
    requiredIdV1(input.identity.turnId, "captureGrant.identity.turnId");
    requiredIdV1(input.identity.runId, "captureGrant.identity.runId");
    requiredRuntimeMountIdV1(
      input.identity.mountId,
      "captureGrant.identity.mountId"
    );
    const receipt: EffectiveFactsCaptureGrantReceiptV1 = {
      contractVersion: EFFECTIVE_FACTS_CAPTURE_GRANT_V1.receiptVersion,
      authority: EFFECTIVE_FACTS_CAPTURE_GRANT_V1.authority,
      grantId: latest.claims.grantId,
      issuerKeyId: latest.claims.issuerKeyId,
      requestId: latest.requestId,
      requestBindingHash: latest.requestBindingHash,
      subjectId: latest.claims.subjectId,
      tenantId: latest.claims.tenantId,
      workspaceId: latest.claims.workspaceId,
      sessionId: latest.claims.sessionId,
      documentId: latest.claims.documentId,
      routePath: latest.claims.routePath,
      captureProfile: latest.claims.captureProfile,
      policyId: latest.claims.policyId,
      policyRevision: latest.claims.policyRevision,
      authorizationDecisionId: decision.authorizationDecisionId,
      threadId: input.identity.threadId,
      turnId: input.identity.turnId,
      runId: input.identity.runId,
      mountId: input.identity.mountId,
      snapshotFingerprint: requiredHashV1(
        input.snapshotFingerprint,
        "captureGrant.snapshotFingerprint"
      ),
      revisionFingerprint: requiredHashV1(
        input.revisionFingerprint,
        "captureGrant.revisionFingerprint"
      ),
      hostReservationHash: requiredHashV1(
        input.hostReservationHash,
        "captureGrant.hostReservationHash"
      ),
      grantClaimsHash: latest.claimsHash,
      grantTokenHash: latest.tokenHash,
      grantExpiresAt: latest.claims.expiresAt,
      consumedAt: new Date(this.clock()).toISOString(),
    };
    this.grants.set(latest.claims.grantId, {
      ...latest,
      state: "consumed",
      receipt,
    });
    return structuredClone(receipt);
  }

  /**
   * Rebuilds only the one pending, non-bearer reservation that was already
   * accepted into the durable H1 admission Store. The caller must source both
   * values from that decoded Store record; this method never accepts or
   * persists the original signed token and commit() still reauthorizes ACL.
   */
  restoreReservedFromDurableAdmission(input: {
    reservation: EffectiveFactsCaptureGrantReservationV1;
    claims: EffectiveFactsCaptureGrantClaimsV1;
    principal: EffectiveFactsAuthenticatedPrincipalV1;
    snapshotFingerprint: string;
    revisionFingerprint: string;
    hostReservationHash: string;
  }): EffectiveFactsCaptureGrantReservationV1 {
    this.prune();
    const claims = decodeClaims(input.claims);
    const principal = validatePrincipal(input.principal);
    const reservation = input.reservation;
    const claimsHash = hashCanonicalV1(claims);
    const requestBindingHash = hashCanonicalV1({
      grantId: claims.grantId,
      requestId: reservation.requestId,
      subjectId: principal.subjectId,
      tenantId: principal.tenantId,
      workspaceId: claims.workspaceId,
      sessionId: claims.sessionId,
      sessionBindingId: principal.sessionBindingId,
      documentId: claims.documentId,
      mountId: claims.mountId,
      snapshotFingerprint: requiredHashV1(
        input.snapshotFingerprint,
        "captureGrant.snapshotFingerprint"
      ),
      revisionFingerprint: requiredHashV1(
        input.revisionFingerprint,
        "captureGrant.revisionFingerprint"
      ),
      hostReservationHash: requiredHashV1(
        input.hostReservationHash,
        "captureGrant.hostReservationHash"
      ),
    });
    if (
      claims.subjectId !== principal.subjectId ||
      claims.tenantId !== principal.tenantId ||
      claims.sessionBindingId !== principal.sessionBindingId ||
      reservation.grantId !== claims.grantId ||
      reservation.claimsHash !== claimsHash ||
      reservation.requestBindingHash !== requestBindingHash ||
      Date.parse(claims.expiresAt) <= this.clock()
    ) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_durable_reservation_invalid",
        "Durable Capture Grant reservation differs from its accepted claims or has expired."
      );
    }
    const current = this.grants.get(claims.grantId);
    if (current) {
      if (
        current.state !== "reserved" ||
        current.reservationId !== reservation.reservationId ||
        current.requestId !== reservation.requestId ||
        current.requestBindingHash !== reservation.requestBindingHash ||
        current.claimsHash !== reservation.claimsHash ||
        current.tokenHash !== reservation.tokenHash
      ) {
        throw new EffectiveFactsCaptureGrantErrorV1(
          "capture_grant_durable_reservation_conflict",
          "Process-local Capture Grant state differs from the durable admission."
        );
      }
      return structuredClone(reservation);
    }
    this.grants.set(claims.grantId, {
      state: "reserved",
      claims,
      claimsHash,
      tokenHash: requiredHashV1(
        reservation.tokenHash,
        "captureGrant.tokenHash"
      ),
      reservationId: requiredIdV1(
        reservation.reservationId,
        "captureGrant.reservationId"
      ),
      requestId: requiredIdV1(
        reservation.requestId,
        "captureGrant.requestId"
      ),
      requestBindingHash,
    });
    return structuredClone(reservation);
  }

  /** Server-side admission bridge only. The signed token and mutable Grant
   * state remain private; callers receive the exact claims already bound to
   * this reservation so the durable Store can consume its nonce atomically. */
  getReservedClaims(
    reservation: EffectiveFactsCaptureGrantReservationV1
  ): EffectiveFactsCaptureGrantClaimsV1 {
    this.prune();
    const state = this.grants.get(reservation.grantId);
    if (
      !state ||
      state.state !== "reserved" ||
      state.reservationId !== reservation.reservationId ||
      state.requestId !== reservation.requestId ||
      state.requestBindingHash !== reservation.requestBindingHash ||
      state.claimsHash !== reservation.claimsHash ||
      state.tokenHash !== reservation.tokenHash
    ) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_reservation_invalid",
        "Capture grant reservation is missing or differs."
      );
    }
    return structuredClone(state.claims);
  }

  abort(reservation: EffectiveFactsCaptureGrantReservationV1) {
    const state = this.grants.get(reservation.grantId);
    if (!state) return;
    if (
      state.state !== "reserved" ||
      state.reservationId !== reservation.reservationId ||
      state.requestId !== reservation.requestId ||
      state.requestBindingHash !== reservation.requestBindingHash ||
      state.claimsHash !== reservation.claimsHash ||
      state.tokenHash !== reservation.tokenHash
    ) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_reservation_invalid",
        "Capture grant reservation differs."
      );
    }
    this.grants.set(state.claims.grantId, {
      state: "issued",
      claims: state.claims,
      claimsHash: state.claimsHash,
      tokenHash: state.tokenHash,
    });
  }

  async getReceipt(input: {
    principal: EffectiveFactsAuthenticatedPrincipalV1;
    identity: RunBoundCanvasReadIdentityV1;
    grantId: string;
  }) {
    this.prune();
    const principal = validatePrincipal(input.principal);
    const state = this.grants.get(input.grantId);
    if (
      !state ||
      state.state !== "consumed" ||
      state.claims.subjectId !== principal.subjectId ||
      state.claims.tenantId !== principal.tenantId ||
      state.claims.sessionBindingId !== principal.sessionBindingId ||
      state.receipt.workspaceId !== input.identity.workspaceId ||
      state.receipt.sessionId !== input.identity.sessionId ||
      state.receipt.documentId !== input.identity.documentId ||
      state.receipt.threadId !== input.identity.threadId ||
      state.receipt.turnId !== input.identity.turnId ||
      state.receipt.runId !== input.identity.runId ||
      state.receipt.mountId !== input.identity.mountId
    ) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_receipt_unavailable",
        "Capture grant receipt is unavailable for this identity."
      );
    }
    const decision = await this.acl.authorize({
      principal,
      tenantId: principal.tenantId,
      workspaceId: state.claims.workspaceId,
      sessionId: state.claims.sessionId,
      sessionBindingId: principal.sessionBindingId,
      documentId: state.claims.documentId,
      routePath: state.claims.routePath,
      captureProfile: state.claims.captureProfile,
      mountId: state.claims.mountId,
    });
    if (
      !decision.allowed ||
      decision.policyId !== state.claims.policyId ||
      decision.policyRevision !== state.claims.policyRevision
    ) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_acl_changed",
        "Document authorization changed before receipt read."
      );
    }
    const latest = this.grants.get(input.grantId);
    if (latest && Date.parse(latest.claims.expiresAt) <= this.clock()) {
      this.grants.delete(latest.claims.grantId);
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_receipt_unavailable",
        "Capture grant expired while receipt authorization was being checked."
      );
    }
    if (
      !latest ||
      latest.state !== "consumed" ||
      latest.claimsHash !== state.claimsHash ||
      latest.tokenHash !== state.tokenHash ||
      latest.receipt.requestBindingHash !== state.receipt.requestBindingHash
    ) {
      throw new EffectiveFactsCaptureGrantErrorV1(
        "capture_grant_receipt_unavailable",
        "Capture grant receipt changed while authorization was being checked."
      );
    }
    return structuredClone(latest.receipt);
  }

  getMetrics() {
    this.prune();
    return {
      activeGrants: this.grants.size,
      issued: [...this.grants.values()].filter((item) => item.state === "issued")
        .length,
      reserved: [...this.grants.values()].filter(
        (item) => item.state === "reserved"
      ).length,
      consumed: [...this.grants.values()].filter(
        (item) => item.state === "consumed"
      ).length,
    } as const;
  }
}
