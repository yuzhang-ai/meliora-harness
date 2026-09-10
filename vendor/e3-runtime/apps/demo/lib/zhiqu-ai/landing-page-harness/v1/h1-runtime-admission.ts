import type {
  EffectiveFactsAuthenticatedPrincipalV1,
  EffectiveFactsCaptureGrantClaimsV1,
  EffectiveFactsCaptureGrantReceiptV1,
  EffectiveFactsCaptureGrantReservationV1,
  EffectiveFactsDocumentAclDecisionV1,
} from "../../editor-canvas/v1/effective-facts-capture-grant";
import {
  decodeEffectiveFactsCaptureGrantReceiptV1,
  EFFECTIVE_FACTS_CAPTURE_GRANT_V1,
  EFFECTIVE_FACTS_CAPTURE_TARGETS_V1,
} from "../../editor-canvas/v1/effective-facts-capture-grant";
import type { EffectiveFactsHostReceiptV1 } from "../../editor-canvas/v1/effective-facts-turn-registry";
import {
  decodeEffectiveFactsHostReceiptV1,
  EFFECTIVE_FACTS_TURN_REGISTRY_V1,
} from "../../editor-canvas/v1/effective-facts-turn-registry";
import {
  UX_EFFECTIVE_FACTS_CAPABILITY_FINGERPRINT_V1,
  decodeUxEffectiveFactsSnapshotV1,
  type UxEffectiveFactsSnapshotV1,
} from "../../editor-canvas/v1/effective-facts-read-contract";
import type {
  CompiledToolCatalogV1,
  ExecutionAdmissionV1,
  ExecutionFingerprintMaterialV1,
  PolicyRegistrySnapshotV1,
  PromptCompositionManifestV1,
  RunContextManifestV1,
  SkillActivationReceiptV1,
  SkillCatalogV1,
  SkillResolutionPlanV1,
} from "./authority-fabric-contracts";
import { decodeExecutionAdmissionV1, decodeExecutionFingerprintMaterialV1, decodePromptCompositionManifestV1, decodeRunContextManifestV1 } from "./authority-prompt-composition";
import { decodeSkillActivationReceiptV1 } from "./authority-skill-lifecycle";
import { decodeSkillCatalogV1, decodeSkillResolutionPlanV1, hashAvailableCapabilitySetV1 } from "./authority-skill-compiler";
import { decodeCompiledToolCatalogV1, decodePolicyRegistrySnapshotV1 } from "./authority-tool-compiler";
import { EFFECTIVE_FACTS_CANVAS_INSPECT_V1 } from "./effective-facts-canvas-inspect";
import {
  decodeH1RuntimeCapabilityAdmissionBindingV1,
  type H1RuntimeCapabilityAdmissionBindingV1,
} from "./h1-runtime-capability-admission";
import { h1RuntimeExecutionExpiresAtV1 } from "./h1-runtime-limits";
import {
  hashCanonicalJsonV1,
  hashUtf8V1,
  requiredHashV1,
  requiredIdV1,
  requiredRuntimeMountIdV1,
  requiredStringV1,
  requiredTimestampV1,
} from "./strict-json";

export const H1_RUNTIME_ADMISSION_V1 = Object.freeze({
  seedContractVersion: "formal-r3-h1-runtime-admission-seed-v1",
  recordContractVersion: "formal-r3-h1-runtime-admission-record-v1",
  materialContractVersion: "formal-r3-h1-runtime-authority-material-v1",
  toolAdmissionContractVersion: "formal-r3-h1-runtime-tool-admission-v1",
  actorCallBindingContractVersion: "formal-r3-h1-actor-call-binding-v1",
  claimCeiling: "restricted_h1_dev_runtime_candidate",
  maxReads: 8,
  b2RestrictedProfileMaxReads: 1,
  maxSystemPromptBytes: 65_536,
} as const);

const maximumReadsForCapabilityAdmissionV1 = (
  binding: H1RuntimeCapabilityAdmissionBindingV1
) =>
  binding.claimCeiling === "restricted_profile_canvas_read_go"
    ? H1_RUNTIME_ADMISSION_V1.b2RestrictedProfileMaxReads
    : H1_RUNTIME_ADMISSION_V1.maxReads;

export type H1RuntimeToolAdmissionV1 = Readonly<{
  contractVersion: typeof H1_RUNTIME_ADMISSION_V1.toolAdmissionContractVersion;
  runId: string;
  principalHash: string;
  toolCatalogHash: string;
  toolDefinitionHash: string;
  executorBindingHash: string;
  admittedEffect: "private_read";
  issuedAt: string;
  expiresAt: string;
  admissionHash: string;
}>;

export type H1ActorCallBindingV1 = Readonly<{
  contractVersion: typeof H1_RUNTIME_ADMISSION_V1.actorCallBindingContractVersion;
  runId: string;
  turnId: string;
  threadId: string;
  actorCallId: string;
  sequence: number;
  runRevision: number;
  eventHeadHash: string;
  contextManifest: RunContextManifestV1;
  systemPromptHash: string;
  toolDescriptorHash: string;
  actorRequestHash: string;
  sourceReceiptHashes: readonly string[];
  createdAt: string;
  bindingHash: string;
}>;

type AllowedAclDecisionV1 = Extract<
  EffectiveFactsDocumentAclDecisionV1,
  Readonly<{ allowed: true }>
>;

export type H1RuntimeAdmissionSeedV1 = Readonly<{
  contractVersion: typeof H1_RUNTIME_ADMISSION_V1.seedContractVersion;
  capabilityAdmission: H1RuntimeCapabilityAdmissionBindingV1;
  principal: EffectiveFactsAuthenticatedPrincipalV1;
  principalHash: string;
  aclDecision: AllowedAclDecisionV1;
  aclSnapshotHash: string;
  grantClaims: EffectiveFactsCaptureGrantClaimsV1;
  grantReservation: EffectiveFactsCaptureGrantReservationV1;
  observationBindingHash: string;
  snapshot: UxEffectiveFactsSnapshotV1;
  seedHash: string;
}>;

export type H1RuntimeAuthorityMaterialV1 = Readonly<{
  contractVersion: typeof H1_RUNTIME_ADMISSION_V1.materialContractVersion;
  policyRegistry: PolicyRegistrySnapshotV1;
  compiledToolCatalog: CompiledToolCatalogV1;
  skillCatalog: SkillCatalogV1;
  skillResolutionPlan: SkillResolutionPlanV1;
  skillActivationReceipt: SkillActivationReceiptV1 | null;
  runToolAdmission: H1RuntimeToolAdmissionV1;
  contextManifest: RunContextManifestV1;
  executionAdmission: ExecutionAdmissionV1;
  promptCompositionManifest: PromptCompositionManifestV1;
  executionFingerprint: ExecutionFingerprintMaterialV1;
  systemPrompt: string;
  systemPromptHash: string;
  materialHash: string;
}>;

type H1RuntimeAdmissionIdentityV1 = Readonly<{
  contractVersion: typeof H1_RUNTIME_ADMISSION_V1.recordContractVersion;
  requestId: string;
  workspaceId: string;
  sessionId: string;
  documentId: string;
  threadId: string;
  turnId: string;
  runId: string;
  claimCeiling: typeof H1_RUNTIME_ADMISSION_V1.claimCeiling;
  seed: H1RuntimeAdmissionSeedV1;
  createdAt: string;
}>;

export type H1RuntimeAdmissionPendingV1 = H1RuntimeAdmissionIdentityV1 &
  Readonly<{
    status: "pending";
    recordHash: string;
  }>;

export type H1RuntimeAdmissionActiveV1 = H1RuntimeAdmissionIdentityV1 &
  Readonly<{
    status: "active";
    grantReceipt: EffectiveFactsCaptureGrantReceiptV1;
    hostReceipt: EffectiveFactsHostReceiptV1;
    authority: H1RuntimeAuthorityMaterialV1;
    actorCallBindings: readonly H1ActorCallBindingV1[];
    readBudget: Readonly<{ consumed: number; maximum: number }>;
    activatedAt: string;
    recordHash: string;
  }>;

export type H1RuntimeAdmissionRejectedV1 = H1RuntimeAdmissionIdentityV1 &
  Readonly<{
    status: "rejected";
    rejectionCode: string;
    rejectedAt: string;
    recordHash: string;
  }>;

export type H1RuntimeAdmissionRecordV1 =
  | H1RuntimeAdmissionPendingV1
  | H1RuntimeAdmissionActiveV1
  | H1RuntimeAdmissionRejectedV1;

export class H1RuntimeAdmissionErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "H1RuntimeAdmissionErrorV1";
  }
}

const assertPlainRecord = (value: unknown, label: string) => {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_admission_invalid",
      `${label} must be a plain object.`
    );
  }
  return value as Record<string, unknown>;
};

const assertExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string
) => {
  const expected = new Set(keys);
  if (
    Object.keys(value).length !== expected.size ||
    Object.keys(value).some((key) => !expected.has(key))
  ) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_admission_invalid",
      `${label} fields differ from the frozen contract.`
    );
  }
};

const safeRequired = <T>(operation: () => T, label: string): T => {
  try {
    return operation();
  } catch (error) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_admission_invalid",
      `${label}: ${error instanceof Error ? error.message : "invalid value"}`
    );
  }
};

const decodePrincipal = (value: unknown): EffectiveFactsAuthenticatedPrincipalV1 => {
  const input = assertPlainRecord(value, "principal");
  assertExactKeys(
    input,
    [
      "subjectId",
      "tenantId",
      "sessionBindingId",
      "authenticationMethod",
      "authenticatedAt",
    ],
    "principal"
  );
  return {
    subjectId: safeRequired(() => requiredIdV1(input.subjectId, "principal.subjectId"), "principal.subjectId"),
    tenantId: safeRequired(() => requiredIdV1(input.tenantId, "principal.tenantId"), "principal.tenantId"),
    sessionBindingId: safeRequired(() => requiredIdV1(input.sessionBindingId, "principal.sessionBindingId"), "principal.sessionBindingId"),
    authenticationMethod: safeRequired(() => requiredIdV1(input.authenticationMethod, "principal.authenticationMethod"), "principal.authenticationMethod"),
    authenticatedAt: safeRequired(() => requiredTimestampV1(input.authenticatedAt, "principal.authenticatedAt"), "principal.authenticatedAt"),
  };
};

const decodeAllowedAcl = (value: unknown): AllowedAclDecisionV1 => {
  const input = assertPlainRecord(value, "aclDecision");
  assertExactKeys(
    input,
    ["allowed", "policyId", "policyRevision", "authorizationDecisionId"],
    "aclDecision"
  );
  if (input.allowed !== true) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_acl_denied",
      "Only a Host-authorized ACL decision may enter H1 admission."
    );
  }
  return {
    allowed: true,
    policyId: safeRequired(() => requiredIdV1(input.policyId, "aclDecision.policyId"), "aclDecision.policyId"),
    policyRevision: safeRequired(() => requiredIdV1(input.policyRevision, "aclDecision.policyRevision"), "aclDecision.policyRevision"),
    authorizationDecisionId: safeRequired(() => requiredIdV1(input.authorizationDecisionId, "aclDecision.authorizationDecisionId"), "aclDecision.authorizationDecisionId"),
  };
};

const decodeGrantClaims = (value: unknown): EffectiveFactsCaptureGrantClaimsV1 => {
  const input = assertPlainRecord(value, "grantClaims");
  const requiredKeys = [
    "contractVersion", "grantId", "nonce", "issuerKeyId", "audience", "purpose",
    "subjectId", "tenantId", "workspaceId", "sessionId", "sessionBindingId",
    "documentId", "routePath", "captureProfile", "providerBindingVersion",
    "capabilityFingerprint", "mountId", "policyId", "policyRevision",
    "authorizationDecisionId", "issuedAt", "notBefore", "expiresAt", "maxUses",
  ] as const;
  assertExactKeys(input, requiredKeys, "grantClaims");
  const documentId = safeRequired(() => requiredIdV1(input.documentId, "grantClaims.documentId"), "grantClaims.documentId");
  const target = Object.hasOwn(EFFECTIVE_FACTS_CAPTURE_TARGETS_V1, documentId)
    ? EFFECTIVE_FACTS_CAPTURE_TARGETS_V1[
        documentId as keyof typeof EFFECTIVE_FACTS_CAPTURE_TARGETS_V1
      ]
    : null;
  if (
    input.contractVersion !== EFFECTIVE_FACTS_CAPTURE_GRANT_V1.contractVersion ||
    input.audience !== EFFECTIVE_FACTS_CAPTURE_GRANT_V1.audience ||
    input.purpose !== EFFECTIVE_FACTS_CAPTURE_GRANT_V1.purpose ||
    input.maxUses !== 1 ||
    input.capabilityFingerprint !== UX_EFFECTIVE_FACTS_CAPABILITY_FINGERPRINT_V1 ||
    !target ||
    input.routePath !== target.routePath ||
    input.captureProfile !== target.captureProfile
  ) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_grant_contract_mismatch",
      "Capture Grant claims differ from the exact installed H1 target."
    );
  }
  return structuredClone(input) as unknown as EffectiveFactsCaptureGrantClaimsV1;
};

const decodeGrantReservation = (
  value: unknown
): EffectiveFactsCaptureGrantReservationV1 => {
  const input = assertPlainRecord(value, "grantReservation");
  assertExactKeys(
    input,
    [
      "grantId",
      "reservationId",
      "requestId",
      "requestBindingHash",
      "claimsHash",
      "tokenHash",
    ],
    "grantReservation"
  );
  return {
    grantId: safeRequired(() => requiredIdV1(input.grantId, "grantReservation.grantId"), "grantReservation.grantId"),
    reservationId: safeRequired(() => requiredIdV1(input.reservationId, "grantReservation.reservationId"), "grantReservation.reservationId"),
    requestId: safeRequired(() => requiredIdV1(input.requestId, "grantReservation.requestId"), "grantReservation.requestId"),
    requestBindingHash: safeRequired(() => requiredHashV1(input.requestBindingHash, "grantReservation.requestBindingHash"), "grantReservation.requestBindingHash"),
    claimsHash: safeRequired(() => requiredHashV1(input.claimsHash, "grantReservation.claimsHash"), "grantReservation.claimsHash"),
    tokenHash: safeRequired(() => requiredHashV1(input.tokenHash, "grantReservation.tokenHash"), "grantReservation.tokenHash"),
  };
};

const seedMaterial = (
  value: Omit<H1RuntimeAdmissionSeedV1, "seedHash">
) => value;

export const createH1RuntimeAdmissionSeedV1 = (
  input: Omit<H1RuntimeAdmissionSeedV1, "contractVersion" | "seedHash">
): H1RuntimeAdmissionSeedV1 => {
  const principal = decodePrincipal(input.principal);
  const capabilityAdmission = decodeH1RuntimeCapabilityAdmissionBindingV1(
    input.capabilityAdmission
  );
  const aclDecision = decodeAllowedAcl(input.aclDecision);
  const grantClaims = decodeGrantClaims(input.grantClaims);
  const grantReservation = decodeGrantReservation(input.grantReservation);
  const snapshot = decodeUxEffectiveFactsSnapshotV1(input.snapshot);
  const principalHash = safeRequired(() => requiredHashV1(input.principalHash, "h1Admission.principalHash"), "h1Admission.principalHash");
  const aclSnapshotHash = safeRequired(() => requiredHashV1(input.aclSnapshotHash, "h1Admission.aclSnapshotHash"), "h1Admission.aclSnapshotHash");
  const observationBindingHash = safeRequired(() => requiredHashV1(input.observationBindingHash, "h1Admission.observationBindingHash"), "h1Admission.observationBindingHash");
  if (
    principalHash !== hashCanonicalJsonV1(principal) ||
    aclSnapshotHash !== hashCanonicalJsonV1(aclDecision) ||
    grantReservation.claimsHash !== hashCanonicalJsonV1(grantClaims) ||
    grantReservation.grantId !== grantClaims.grantId ||
    grantReservation.requestId.length < 1 ||
    grantClaims.subjectId !== principal.subjectId ||
    grantClaims.tenantId !== principal.tenantId ||
    grantClaims.sessionBindingId !== principal.sessionBindingId ||
    grantClaims.policyId !== aclDecision.policyId ||
    grantClaims.policyRevision !== aclDecision.policyRevision ||
    grantClaims.authorizationDecisionId !== aclDecision.authorizationDecisionId ||
    grantClaims.documentId !== snapshot.documentId ||
    grantClaims.routePath !== snapshot.routePath ||
    grantClaims.captureProfile !== snapshot.captureProfile ||
    grantClaims.mountId !== snapshot.mountId ||
    grantClaims.capabilityFingerprint !== snapshot.capabilityFingerprint
  ) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_seed_closure_mismatch",
      "H1 principal, ACL, Grant, observation, and snapshot do not form one authority closure."
    );
  }
  const material = seedMaterial({
    contractVersion: H1_RUNTIME_ADMISSION_V1.seedContractVersion,
    capabilityAdmission,
    principal,
    principalHash,
    aclDecision,
    aclSnapshotHash,
    grantClaims,
    grantReservation,
    observationBindingHash,
    snapshot,
  });
  return { ...material, seedHash: hashCanonicalJsonV1(material) };
};

export const decodeH1RuntimeAdmissionSeedV1 = (
  value: unknown
): H1RuntimeAdmissionSeedV1 => {
  const input = assertPlainRecord(value, "h1AdmissionSeed");
  assertExactKeys(
    input,
    [
      "contractVersion", "principal", "principalHash", "aclDecision",
      "capabilityAdmission", "aclSnapshotHash", "grantClaims", "grantReservation",
      "observationBindingHash", "snapshot", "seedHash",
    ],
    "h1AdmissionSeed"
  );
  if (input.contractVersion !== H1_RUNTIME_ADMISSION_V1.seedContractVersion) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_admission_version_mismatch",
      "H1 admission seed version differs."
    );
  }
  const decoded = createH1RuntimeAdmissionSeedV1({
    capabilityAdmission:
      input.capabilityAdmission as H1RuntimeCapabilityAdmissionBindingV1,
    principal: input.principal as EffectiveFactsAuthenticatedPrincipalV1,
    principalHash: input.principalHash as string,
    aclDecision: input.aclDecision as AllowedAclDecisionV1,
    aclSnapshotHash: input.aclSnapshotHash as string,
    grantClaims: input.grantClaims as EffectiveFactsCaptureGrantClaimsV1,
    grantReservation: input.grantReservation as EffectiveFactsCaptureGrantReservationV1,
    observationBindingHash: input.observationBindingHash as string,
    snapshot: input.snapshot as UxEffectiveFactsSnapshotV1,
  });
  if (decoded.seedHash !== input.seedHash) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_seed_hash_mismatch",
      "H1 admission seed hash differs."
    );
  }
  return decoded;
};

const materialWithoutHash = (
  value: Omit<H1RuntimeAuthorityMaterialV1, "materialHash">
) => value;

const toolAdmissionWithoutHash = (
  value: Omit<H1RuntimeToolAdmissionV1, "admissionHash">
) => value;

export const createH1RuntimeToolAdmissionV1 = (input: Readonly<{
  runId: string;
  principalHash: string;
  toolCatalog: CompiledToolCatalogV1;
  issuedAt: string;
  expiresAt: string;
}>): H1RuntimeToolAdmissionV1 => {
  const toolCatalog = decodeCompiledToolCatalogV1(input.toolCatalog);
  const h1Tools = toolCatalog.tools.filter(
    (tool) =>
      tool.definition.toolId === EFFECTIVE_FACTS_CANVAS_INSPECT_V1.toolId &&
      tool.definition.toolVersion ===
        EFFECTIVE_FACTS_CANVAS_INSPECT_V1.toolVersion &&
      tool.definition.effect === "private_read"
  );
  const hostControls = toolCatalog.tools.filter(
    (tool) =>
      (tool.definition.toolId === "inspect_ux_capability" &&
        tool.definition.toolVersion === "1.0.0" &&
        tool.definition.effect === "private_read") ||
      (tool.definition.toolId === "submit_turn_outcome" &&
        tool.definition.toolVersion === "h1-terminal-control-v1" &&
        tool.definition.effect === "presentation_state")
  );
  if (
    toolCatalog.tools.length !== 3 ||
    h1Tools.length !== 1 ||
    hostControls.length !== 2
  ) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_tool_admission_catalog_invalid",
      "H1 admits exactly one compiled Canvas read and two compiled Host controls."
    );
  }
  const issuedAt = safeRequired(
    () => requiredTimestampV1(input.issuedAt, "h1ToolAdmission.issuedAt"),
    "h1ToolAdmission.issuedAt"
  );
  const expiresAt = safeRequired(
    () => requiredTimestampV1(input.expiresAt, "h1ToolAdmission.expiresAt"),
    "h1ToolAdmission.expiresAt"
  );
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_tool_admission_timing_invalid",
      "B1 Tool Admission must expire after it is issued."
    );
  }
  const tool = h1Tools[0]!;
  const material = toolAdmissionWithoutHash({
    contractVersion: H1_RUNTIME_ADMISSION_V1.toolAdmissionContractVersion,
    runId: safeRequired(
      () => requiredIdV1(input.runId, "h1ToolAdmission.runId"),
      "h1ToolAdmission.runId"
    ),
    principalHash: safeRequired(
      () => requiredHashV1(input.principalHash, "h1ToolAdmission.principalHash"),
      "h1ToolAdmission.principalHash"
    ),
    toolCatalogHash: toolCatalog.catalogHash,
    toolDefinitionHash: tool.definitionHash,
    executorBindingHash: tool.executorBinding.bindingHash,
    admittedEffect: "private_read",
    issuedAt,
    expiresAt,
  });
  return { ...material, admissionHash: hashCanonicalJsonV1(material) };
};

export const decodeH1RuntimeToolAdmissionV1 = (
  value: unknown
): H1RuntimeToolAdmissionV1 => {
  const input = assertPlainRecord(value, "h1ToolAdmission");
  assertExactKeys(
    input,
    [
      "contractVersion",
      "runId",
      "principalHash",
      "toolCatalogHash",
      "toolDefinitionHash",
      "executorBindingHash",
      "admittedEffect",
      "issuedAt",
      "expiresAt",
      "admissionHash",
    ],
    "h1ToolAdmission"
  );
  if (
    input.contractVersion !==
      H1_RUNTIME_ADMISSION_V1.toolAdmissionContractVersion ||
    input.admittedEffect !== "private_read"
  ) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_tool_admission_contract_mismatch",
      "B1 Tool Admission contract identity differs."
    );
  }
  const material = toolAdmissionWithoutHash({
    contractVersion: H1_RUNTIME_ADMISSION_V1.toolAdmissionContractVersion,
    runId: safeRequired(
      () => requiredIdV1(input.runId, "h1ToolAdmission.runId"),
      "h1ToolAdmission.runId"
    ),
    principalHash: safeRequired(
      () => requiredHashV1(input.principalHash, "h1ToolAdmission.principalHash"),
      "h1ToolAdmission.principalHash"
    ),
    toolCatalogHash: safeRequired(
      () => requiredHashV1(input.toolCatalogHash, "h1ToolAdmission.toolCatalogHash"),
      "h1ToolAdmission.toolCatalogHash"
    ),
    toolDefinitionHash: safeRequired(
      () => requiredHashV1(input.toolDefinitionHash, "h1ToolAdmission.toolDefinitionHash"),
      "h1ToolAdmission.toolDefinitionHash"
    ),
    executorBindingHash: safeRequired(
      () => requiredHashV1(input.executorBindingHash, "h1ToolAdmission.executorBindingHash"),
      "h1ToolAdmission.executorBindingHash"
    ),
    admittedEffect: "private_read",
    issuedAt: safeRequired(
      () => requiredTimestampV1(input.issuedAt, "h1ToolAdmission.issuedAt"),
      "h1ToolAdmission.issuedAt"
    ),
    expiresAt: safeRequired(
      () => requiredTimestampV1(input.expiresAt, "h1ToolAdmission.expiresAt"),
      "h1ToolAdmission.expiresAt"
    ),
  });
  if (
    Date.parse(material.expiresAt) <= Date.parse(material.issuedAt) ||
    safeRequired(
      () => requiredHashV1(input.admissionHash, "h1ToolAdmission.admissionHash"),
      "h1ToolAdmission.admissionHash"
    ) !== hashCanonicalJsonV1(material)
  ) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_tool_admission_hash_mismatch",
      "B1 Tool Admission hash or timing differs."
    );
  }
  return { ...material, admissionHash: String(input.admissionHash) };
};

const actorCallBindingWithoutHash = (
  value: Omit<H1ActorCallBindingV1, "bindingHash">
) => value;

export const createH1ActorCallBindingV1 = (input: Readonly<{
  runId: string;
  turnId: string;
  threadId: string;
  actorCallId: string;
  sequence: number;
  runRevision: number;
  eventHeadHash: string;
  contextManifest: RunContextManifestV1;
  systemPromptHash: string;
  toolDescriptorHash: string;
  actorRequestHash: string;
  sourceReceiptHashes: readonly string[];
  createdAt: string;
}>): H1ActorCallBindingV1 => {
  const contextManifest = decodeRunContextManifestV1(input.contextManifest);
  if (
    !Number.isSafeInteger(input.sequence) ||
    input.sequence < 1 ||
    input.sequence > 32 ||
    !Number.isSafeInteger(input.runRevision) ||
    input.runRevision < 1
  ) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_actor_call_sequence_invalid",
      "H1 Actor call sequence or Run revision is invalid."
    );
  }
  const runId = safeRequired(
    () => requiredIdV1(input.runId, "h1ActorCall.runId"),
    "h1ActorCall.runId"
  );
  const turnId = safeRequired(
    () => requiredIdV1(input.turnId, "h1ActorCall.turnId"),
    "h1ActorCall.turnId"
  );
  if (contextManifest.runId !== runId || contextManifest.turnId !== turnId) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_actor_call_context_mismatch",
      "H1 Actor call Context Manifest belongs to another Run or Turn."
    );
  }
  if (
    !Array.isArray(input.sourceReceiptHashes) ||
    input.sourceReceiptHashes.length > 16 ||
    new Set(input.sourceReceiptHashes).size !== input.sourceReceiptHashes.length
  ) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_actor_call_receipt_set_invalid",
      "H1 Actor call source Receipt hashes are invalid."
    );
  }
  const sourceReceiptHashes = input.sourceReceiptHashes.map((hash, index) =>
    safeRequired(
      () => requiredHashV1(hash, `h1ActorCall.sourceReceiptHashes[${index}]`),
      `h1ActorCall.sourceReceiptHashes[${index}]`
    )
  );
  const material = actorCallBindingWithoutHash({
    contractVersion: H1_RUNTIME_ADMISSION_V1.actorCallBindingContractVersion,
    runId,
    turnId,
    threadId: safeRequired(
      () => requiredIdV1(input.threadId, "h1ActorCall.threadId"),
      "h1ActorCall.threadId"
    ),
    actorCallId: safeRequired(
      () => requiredIdV1(input.actorCallId, "h1ActorCall.actorCallId"),
      "h1ActorCall.actorCallId"
    ),
    sequence: input.sequence,
    runRevision: input.runRevision,
    eventHeadHash: safeRequired(
      () => requiredHashV1(input.eventHeadHash, "h1ActorCall.eventHeadHash", true),
      "h1ActorCall.eventHeadHash"
    ),
    contextManifest,
    systemPromptHash: safeRequired(
      () => requiredHashV1(input.systemPromptHash, "h1ActorCall.systemPromptHash"),
      "h1ActorCall.systemPromptHash"
    ),
    toolDescriptorHash: safeRequired(
      () => requiredHashV1(input.toolDescriptorHash, "h1ActorCall.toolDescriptorHash"),
      "h1ActorCall.toolDescriptorHash"
    ),
    actorRequestHash: safeRequired(
      () => requiredHashV1(input.actorRequestHash, "h1ActorCall.actorRequestHash"),
      "h1ActorCall.actorRequestHash"
    ),
    sourceReceiptHashes,
    createdAt: safeRequired(
      () => requiredTimestampV1(input.createdAt, "h1ActorCall.createdAt"),
      "h1ActorCall.createdAt"
    ),
  });
  return { ...material, bindingHash: hashCanonicalJsonV1(material) };
};

export const decodeH1ActorCallBindingV1 = (
  value: unknown
): H1ActorCallBindingV1 => {
  const input = assertPlainRecord(value, "h1ActorCall");
  assertExactKeys(
    input,
    [
      "contractVersion",
      "runId",
      "turnId",
      "threadId",
      "actorCallId",
      "sequence",
      "runRevision",
      "eventHeadHash",
      "contextManifest",
      "systemPromptHash",
      "toolDescriptorHash",
      "actorRequestHash",
      "sourceReceiptHashes",
      "createdAt",
      "bindingHash",
    ],
    "h1ActorCall"
  );
  if (
    input.contractVersion !==
      H1_RUNTIME_ADMISSION_V1.actorCallBindingContractVersion
  ) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_actor_call_contract_mismatch",
      "H1 Actor call binding contract identity differs."
    );
  }
  const decoded = createH1ActorCallBindingV1({
    runId: input.runId as string,
    turnId: input.turnId as string,
    threadId: input.threadId as string,
    actorCallId: input.actorCallId as string,
    sequence: input.sequence as number,
    runRevision: input.runRevision as number,
    eventHeadHash: input.eventHeadHash as string,
    contextManifest: input.contextManifest as RunContextManifestV1,
    systemPromptHash: input.systemPromptHash as string,
    toolDescriptorHash: input.toolDescriptorHash as string,
    actorRequestHash: input.actorRequestHash as string,
    sourceReceiptHashes: input.sourceReceiptHashes as readonly string[],
    createdAt: input.createdAt as string,
  });
  if (decoded.bindingHash !== input.bindingHash) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_actor_call_binding_hash_mismatch",
      "H1 Actor call binding hash differs."
    );
  }
  return decoded;
};

export const appendH1ActorCallBindingV1 = (
  record: H1RuntimeAdmissionActiveV1,
  value: H1ActorCallBindingV1
): H1RuntimeAdmissionActiveV1 => {
  const current = decodeH1RuntimeAdmissionRecordV1(record);
  if (current.status !== "active") {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_admission_not_active",
      "H1 Actor call requires an active Runtime Admission."
    );
  }
  const binding = decodeH1ActorCallBindingV1(value);
  if (
    binding.runId !== current.runId ||
    binding.turnId !== current.turnId ||
    binding.threadId !== current.threadId ||
    binding.sequence !== current.actorCallBindings.length + 1 ||
    current.actorCallBindings.some(
      (item) =>
        item.actorCallId === binding.actorCallId ||
        item.bindingHash === binding.bindingHash
    ) ||
    binding.systemPromptHash !== current.authority.systemPromptHash ||
    Date.parse(binding.createdAt) < Date.parse(current.activatedAt) ||
    Date.parse(binding.createdAt) >=
      Math.min(
        Date.parse(current.hostReceipt.expiresAt),
        Date.parse(current.authority.executionAdmission.expiresAt)
      )
  ) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_actor_call_binding_closure_mismatch",
      "H1 Actor call binding differs from its active Run authority."
    );
  }
  const next = {
    ...current,
    actorCallBindings: [...current.actorCallBindings, binding],
  };
  const { recordHash: _oldHash, ...withoutOldHash } = next;
  return { ...withoutOldHash, recordHash: recordHash(withoutOldHash) };
};

export const createH1RuntimeAuthorityMaterialV1 = (
  input: Omit<
    H1RuntimeAuthorityMaterialV1,
    "contractVersion" | "materialHash"
  >
): H1RuntimeAuthorityMaterialV1 => {
  const policyRegistry = decodePolicyRegistrySnapshotV1(input.policyRegistry);
  const compiledToolCatalog = decodeCompiledToolCatalogV1(input.compiledToolCatalog);
  const skillCatalog = decodeSkillCatalogV1(input.skillCatalog);
  const skillResolutionPlan = decodeSkillResolutionPlanV1(input.skillResolutionPlan);
  const skillActivationReceipt = input.skillActivationReceipt === null
    ? null
    : decodeSkillActivationReceiptV1(input.skillActivationReceipt);
  const runToolAdmission = decodeH1RuntimeToolAdmissionV1(
    input.runToolAdmission
  );
  const contextManifest = decodeRunContextManifestV1(input.contextManifest);
  const executionAdmission = decodeExecutionAdmissionV1(input.executionAdmission);
  const promptCompositionManifest = decodePromptCompositionManifestV1(input.promptCompositionManifest);
  const executionFingerprint = decodeExecutionFingerprintMaterialV1(input.executionFingerprint);
  const systemPrompt = safeRequired(
    () => requiredStringV1(input.systemPrompt, "h1Authority.systemPrompt", H1_RUNTIME_ADMISSION_V1.maxSystemPromptBytes),
    "h1Authority.systemPrompt"
  );
  const systemPromptHash = safeRequired(() => requiredHashV1(input.systemPromptHash, "h1Authority.systemPromptHash"), "h1Authority.systemPromptHash");
  const h1Tools = compiledToolCatalog.tools.filter(
    (item) => item.definition.toolId === EFFECTIVE_FACTS_CANVAS_INSPECT_V1.toolId
  );
  const hostControls = compiledToolCatalog.tools.filter(
    (item) =>
      (item.definition.toolId === "inspect_ux_capability" &&
        item.definition.toolVersion === "1.0.0" &&
        item.definition.effect === "private_read") ||
      (item.definition.toolId === "submit_turn_outcome" &&
        item.definition.toolVersion === "h1-terminal-control-v1" &&
        item.definition.effect === "presentation_state")
  );
  const runId = executionFingerprint.runId;
  const actorCallId = executionFingerprint.actorCallId;
  const skillClosureValid = skillActivationReceipt
    ? skillResolutionPlan.orderedClosures.length === 1 &&
      skillResolutionPlan.closureBudgetReservations.length === 1 &&
      skillActivationReceipt.runId === runId &&
      skillActivationReceipt.resolutionPlanHash === skillResolutionPlan.planHash &&
      skillActivationReceipt.resolvedClosureHash ===
        skillResolutionPlan.orderedClosures[0]?.closureHash &&
      skillActivationReceipt.status === "active"
    : skillResolutionPlan.orderedClosures.length === 0 &&
      skillResolutionPlan.closureBudgetReservations.length === 0;
  const activeClosureHashes = skillActivationReceipt
    ? [skillActivationReceipt.resolvedClosureHash]
    : [];
  const activeReceiptHashes = skillActivationReceipt
    ? [skillActivationReceipt.receiptHash]
    : [];
  const admittedEffects = skillActivationReceipt ? ["private_read"] : [];
  const exactHashes = (left: readonly string[], right: readonly string[]) =>
    left.length === right.length &&
    left.every((value, index) => value === right[index]);
  if (
    compiledToolCatalog.policyRegistrySnapshotHash !== policyRegistry.snapshotHash ||
    compiledToolCatalog.tools.length !== 3 ||
    h1Tools.length !== 1 ||
    hostControls.length !== 2 ||
    h1Tools[0]?.definition.toolVersion !== EFFECTIVE_FACTS_CANVAS_INSPECT_V1.toolVersion ||
    h1Tools[0]?.definition.effect !== "private_read" ||
    skillResolutionPlan.runId !== runId ||
    skillResolutionPlan.toolCatalogHash !== compiledToolCatalog.catalogHash ||
    skillResolutionPlan.skillCatalogHash !== skillCatalog.catalogHash ||
    !skillClosureValid ||
    skillResolutionPlan.unavailable.length !== 0 ||
    runToolAdmission.runId !== runId ||
    runToolAdmission.principalHash !== executionAdmission.principalHash ||
    runToolAdmission.toolCatalogHash !== compiledToolCatalog.catalogHash ||
    runToolAdmission.toolDefinitionHash !== h1Tools[0]?.definitionHash ||
    runToolAdmission.executorBindingHash !==
      h1Tools[0]?.executorBinding.bindingHash ||
    runToolAdmission.issuedAt !== executionAdmission.issuedAt ||
    runToolAdmission.expiresAt !== executionAdmission.expiresAt ||
    contextManifest.runId !== runId ||
    executionAdmission.runId !== runId ||
    executionAdmission.actorCallId !== actorCallId ||
    executionAdmission.resolutionPlanHash !== skillResolutionPlan.planHash ||
    executionAdmission.toolCatalogHash !== compiledToolCatalog.catalogHash ||
    executionAdmission.skillCatalogHash !== skillCatalog.catalogHash ||
    !exactHashes(
      executionAdmission.activeSkillClosureHashes,
      activeClosureHashes
    ) ||
    !exactHashes(
      executionAdmission.activeSkillActivationReceiptHashes,
      activeReceiptHashes
    ) ||
    !exactHashes(executionAdmission.admittedEffects, admittedEffects) ||
    promptCompositionManifest.runId !== runId ||
    promptCompositionManifest.actorCallId !== actorCallId ||
    promptCompositionManifest.contextManifestHash !== contextManifest.manifestHash ||
    promptCompositionManifest.executionAdmissionHash !== executionAdmission.admissionHash ||
    promptCompositionManifest.resolutionPlanHash !== skillResolutionPlan.planHash ||
    promptCompositionManifest.toolCatalogHash !== compiledToolCatalog.catalogHash ||
    promptCompositionManifest.skillCatalogHash !== skillCatalog.catalogHash ||
    !exactHashes(
      promptCompositionManifest.activeSkillClosureHashes,
      activeClosureHashes
    ) ||
    !exactHashes(
      promptCompositionManifest.activeSkillActivationReceiptHashes,
      activeReceiptHashes
    ) ||
    executionFingerprint.resolutionPlanHash !== skillResolutionPlan.planHash ||
    executionFingerprint.contextManifestHash !== contextManifest.manifestHash ||
    executionFingerprint.toolCatalogHash !== compiledToolCatalog.catalogHash ||
    executionFingerprint.skillCatalogHash !== skillCatalog.catalogHash ||
    !exactHashes(
      executionFingerprint.activeSkillClosureHashes,
      activeClosureHashes
    ) ||
    !exactHashes(
      executionFingerprint.activeSkillActivationReceiptHashes,
      activeReceiptHashes
    ) ||
    executionFingerprint.promptCompositionManifestHash !== promptCompositionManifest.manifestHash ||
    systemPromptHash !== hashUtf8V1(systemPrompt) ||
    promptCompositionManifest.composedPromptHash !== systemPromptHash
  ) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_authority_material_mismatch",
      "Compiled Catalog, Skill, Prompt, Context, Admission, and Fingerprint do not form one Run closure."
    );
  }
  const material = materialWithoutHash({
    contractVersion: H1_RUNTIME_ADMISSION_V1.materialContractVersion,
    policyRegistry,
    compiledToolCatalog,
    skillCatalog,
    skillResolutionPlan,
    skillActivationReceipt,
    runToolAdmission,
    contextManifest,
    executionAdmission,
    promptCompositionManifest,
    executionFingerprint,
    systemPrompt,
    systemPromptHash,
  });
  return { ...material, materialHash: hashCanonicalJsonV1(material) };
};

export const decodeH1RuntimeAuthorityMaterialV1 = (
  value: unknown
): H1RuntimeAuthorityMaterialV1 => {
  const input = assertPlainRecord(value, "h1AuthorityMaterial");
  assertExactKeys(
    input,
    [
      "contractVersion", "policyRegistry", "compiledToolCatalog", "skillCatalog",
      "skillResolutionPlan", "skillActivationReceipt", "runToolAdmission", "contextManifest",
      "executionAdmission", "promptCompositionManifest", "executionFingerprint",
      "systemPrompt", "systemPromptHash", "materialHash",
    ],
    "h1AuthorityMaterial"
  );
  if (input.contractVersion !== H1_RUNTIME_ADMISSION_V1.materialContractVersion) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_admission_version_mismatch",
      "H1 authority material version differs."
    );
  }
  const decoded = createH1RuntimeAuthorityMaterialV1({
    policyRegistry: input.policyRegistry as PolicyRegistrySnapshotV1,
    compiledToolCatalog: input.compiledToolCatalog as CompiledToolCatalogV1,
    skillCatalog: input.skillCatalog as SkillCatalogV1,
    skillResolutionPlan: input.skillResolutionPlan as SkillResolutionPlanV1,
    skillActivationReceipt: input.skillActivationReceipt as SkillActivationReceiptV1 | null,
    runToolAdmission: input.runToolAdmission as H1RuntimeToolAdmissionV1,
    contextManifest: input.contextManifest as RunContextManifestV1,
    executionAdmission: input.executionAdmission as ExecutionAdmissionV1,
    promptCompositionManifest: input.promptCompositionManifest as PromptCompositionManifestV1,
    executionFingerprint: input.executionFingerprint as ExecutionFingerprintMaterialV1,
    systemPrompt: input.systemPrompt as string,
    systemPromptHash: input.systemPromptHash as string,
  });
  if (decoded.materialHash !== input.materialHash) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_authority_material_hash_mismatch",
      "H1 authority material hash differs."
    );
  }
  return decoded;
};

const recordHash = (value: Omit<H1RuntimeAdmissionRecordV1, "recordHash">) =>
  hashCanonicalJsonV1(value);

export const createH1RuntimePendingAdmissionV1 = (input: Readonly<{
  requestId: string;
  workspaceId: string;
  sessionId: string;
  documentId: string;
  threadId: string;
  turnId: string;
  runId: string;
  seed: H1RuntimeAdmissionSeedV1;
  createdAt: string;
}>): H1RuntimeAdmissionPendingV1 => {
  const seed = decodeH1RuntimeAdmissionSeedV1(input.seed);
  const identity = {
    contractVersion: H1_RUNTIME_ADMISSION_V1.recordContractVersion,
    requestId: safeRequired(() => requiredIdV1(input.requestId, "h1Admission.requestId"), "h1Admission.requestId"),
    workspaceId: safeRequired(() => requiredIdV1(input.workspaceId, "h1Admission.workspaceId"), "h1Admission.workspaceId"),
    sessionId: safeRequired(() => requiredIdV1(input.sessionId, "h1Admission.sessionId"), "h1Admission.sessionId"),
    documentId: safeRequired(() => requiredIdV1(input.documentId, "h1Admission.documentId"), "h1Admission.documentId"),
    threadId: safeRequired(() => requiredIdV1(input.threadId, "h1Admission.threadId"), "h1Admission.threadId"),
    turnId: safeRequired(() => requiredIdV1(input.turnId, "h1Admission.turnId"), "h1Admission.turnId"),
    runId: safeRequired(() => requiredIdV1(input.runId, "h1Admission.runId"), "h1Admission.runId"),
    claimCeiling: H1_RUNTIME_ADMISSION_V1.claimCeiling,
    seed,
    createdAt: safeRequired(() => requiredTimestampV1(input.createdAt, "h1Admission.createdAt"), "h1Admission.createdAt"),
  } as const;
  if (
    seed.grantReservation.requestId !== identity.requestId ||
    seed.grantClaims.workspaceId !== identity.workspaceId ||
    seed.grantClaims.sessionId !== identity.sessionId ||
    seed.grantClaims.documentId !== identity.documentId
  ) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_identity_mismatch",
      "Pending H1 admission differs from the reserved request scope."
    );
  }
  const value = { ...identity, status: "pending" as const };
  return { ...value, recordHash: recordHash(value) };
};

const assertReceiptClosure = (input: Readonly<{
  identity: H1RuntimeAdmissionIdentityV1;
  grantReceipt: EffectiveFactsCaptureGrantReceiptV1;
  hostReceipt: EffectiveFactsHostReceiptV1;
  authority: H1RuntimeAuthorityMaterialV1;
}>) => {
  const { identity, grantReceipt, hostReceipt, authority } = input;
  const seed = identity.seed;
  const expectedHostExpiresAt = new Date(
    Math.min(
      Date.parse(seed.snapshot.observedAt) +
        EFFECTIVE_FACTS_TURN_REGISTRY_V1.ttlMs,
      Date.parse(hostReceipt.boundAt) +
        EFFECTIVE_FACTS_TURN_REGISTRY_V1.ttlMs
    )
  ).toISOString();
  const expectedAuthorityExpiresAt = h1RuntimeExecutionExpiresAtV1({
    activatedAt: grantReceipt.consumedAt,
    hostExpiresAt: hostReceipt.expiresAt,
  });
  const identities = [
    [grantReceipt.requestId, identity.requestId],
    [grantReceipt.workspaceId, identity.workspaceId],
    [grantReceipt.sessionId, identity.sessionId],
    [grantReceipt.documentId, identity.documentId],
    [grantReceipt.threadId, identity.threadId],
    [grantReceipt.turnId, identity.turnId],
    [grantReceipt.runId, identity.runId],
    [hostReceipt.requestId, identity.requestId],
    [hostReceipt.workspaceId, identity.workspaceId],
    [hostReceipt.sessionId, identity.sessionId],
    [hostReceipt.documentId, identity.documentId],
    [hostReceipt.threadId, identity.threadId],
    [hostReceipt.turnId, identity.turnId],
    [hostReceipt.runId, identity.runId],
  ];
  if (
    identities.some(([actual, expected]) => actual !== expected) ||
    grantReceipt.contractVersion !== EFFECTIVE_FACTS_CAPTURE_GRANT_V1.receiptVersion ||
    grantReceipt.authority !== EFFECTIVE_FACTS_CAPTURE_GRANT_V1.authority ||
    grantReceipt.grantId !== seed.grantClaims.grantId ||
    grantReceipt.issuerKeyId !== seed.grantClaims.issuerKeyId ||
    grantReceipt.grantClaimsHash !== seed.grantReservation.claimsHash ||
    grantReceipt.grantTokenHash !== seed.grantReservation.tokenHash ||
    grantReceipt.requestBindingHash !== seed.grantReservation.requestBindingHash ||
    grantReceipt.subjectId !== seed.principal.subjectId ||
    grantReceipt.tenantId !== seed.principal.tenantId ||
    grantReceipt.policyId !== seed.aclDecision.policyId ||
    grantReceipt.policyRevision !== seed.aclDecision.policyRevision ||
    grantReceipt.authorizationDecisionId !==
      seed.aclDecision.authorizationDecisionId ||
    grantReceipt.routePath !== seed.grantClaims.routePath ||
    grantReceipt.captureProfile !== seed.grantClaims.captureProfile ||
    grantReceipt.grantExpiresAt !== seed.grantClaims.expiresAt ||
    grantReceipt.mountId !== seed.snapshot.mountId ||
    grantReceipt.snapshotFingerprint !== seed.snapshot.effectiveFactsFingerprint ||
    grantReceipt.revisionFingerprint !== hashCanonicalJsonV1(seed.snapshot.revision) ||
    hostReceipt.mountId !== seed.snapshot.mountId ||
    hostReceipt.contractVersion !==
      EFFECTIVE_FACTS_TURN_REGISTRY_V1.hostReceiptVersion ||
    hostReceipt.routePath !== seed.snapshot.routePath ||
    hostReceipt.captureProfile !== seed.snapshot.captureProfile ||
    hostReceipt.viewport !== seed.snapshot.viewport ||
    hostReceipt.providerId !== seed.snapshot.providerId ||
    hostReceipt.providerVersion !== seed.snapshot.providerVersion ||
    hostReceipt.providerBindingVersion !==
      seed.snapshot.providerBindingVersion ||
    hostReceipt.effectiveFactsSchemaVersion !==
      seed.snapshot.effectiveFactsSchemaVersion ||
    hostReceipt.capabilityFingerprint !==
      seed.snapshot.capabilityFingerprint ||
    hostReceipt.rawDataFingerprint !== seed.snapshot.rawDataFingerprint ||
    hostReceipt.historyIndex !== seed.snapshot.revision.historyIndex ||
    hostReceipt.historyLength !== seed.snapshot.revision.historyLength ||
    hostReceipt.historyEntryId !== seed.snapshot.revision.historyEntryId ||
    hostReceipt.historyFingerprint !==
      seed.snapshot.revision.historyFingerprint ||
    hostReceipt.historyDataFingerprint !==
      seed.snapshot.revision.dataFingerprint ||
    hostReceipt.revisionContractVersion !==
      seed.snapshot.revision.contractVersion ||
    hostReceipt.revisionOwner !== seed.snapshot.revision.owner ||
    hostReceipt.snapshotFingerprint !== seed.snapshot.effectiveFactsFingerprint ||
    hostReceipt.revisionFingerprint !== hashCanonicalJsonV1(seed.snapshot.revision) ||
    hostReceipt.reservationHash !== seed.observationBindingHash ||
    hostReceipt.observedAt !== seed.snapshot.observedAt ||
    hostReceipt.expiresAt !== expectedHostExpiresAt ||
    hostReceipt.budget.maxSnapshotBytes !==
      EFFECTIVE_FACTS_TURN_REGISTRY_V1.maxSnapshotBytes ||
    hostReceipt.budget.maxReads !==
      EFFECTIVE_FACTS_TURN_REGISTRY_V1.maxReadsPerRun ||
    grantReceipt.hostReservationHash !== seed.observationBindingHash ||
    authority.executionFingerprint.runId !== identity.runId ||
    authority.contextManifest.turnId !== identity.turnId ||
    authority.executionAdmission.principalHash !== seed.principalHash ||
    authority.executionAdmission.aclSnapshotHash !== seed.aclSnapshotHash ||
    authority.executionAdmission.issuedAt !== grantReceipt.consumedAt ||
    authority.executionAdmission.expiresAt !== expectedAuthorityExpiresAt ||
    authority.executionAdmission.uxCapabilitySnapshotHash !==
      hashAvailableCapabilitySetV1(["canvas.read.effective-facts.h1"])
  ) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_activation_closure_mismatch",
      "Grant, Host receipt, snapshot, and compiled Run authority are not one closure."
    );
  }
};

export const activateH1RuntimeAdmissionV1 = (input: Readonly<{
  pending: H1RuntimeAdmissionPendingV1;
  grantReceipt: EffectiveFactsCaptureGrantReceiptV1;
  hostReceipt: EffectiveFactsHostReceiptV1;
  authority: H1RuntimeAuthorityMaterialV1;
  activatedAt: string;
}>): H1RuntimeAdmissionActiveV1 => {
  const pending = decodeH1RuntimeAdmissionRecordV1(input.pending);
  if (pending.status !== "pending") {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_activation_state_invalid",
      "Only a pending H1 admission may be activated."
    );
  }
  const authority = decodeH1RuntimeAuthorityMaterialV1(input.authority);
  const grantReceipt = safeRequired(
    () => decodeEffectiveFactsCaptureGrantReceiptV1(input.grantReceipt),
    "h1Admission.grantReceipt"
  );
  const hostReceipt = safeRequired(
    () => decodeEffectiveFactsHostReceiptV1(input.hostReceipt),
    "h1Admission.hostReceipt"
  );
  assertReceiptClosure({
    identity: pending,
    grantReceipt,
    hostReceipt,
    authority,
  });
  const activatedAt = safeRequired(
    () => requiredTimestampV1(input.activatedAt, "h1Admission.activatedAt"),
    "h1Admission.activatedAt"
  );
  if (activatedAt !== grantReceipt.consumedAt) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_activation_closure_mismatch",
      "H1 activation timestamp differs from its consumed Grant Receipt."
    );
  }
  const value = {
    ...pending,
    status: "active" as const,
    grantReceipt,
    hostReceipt,
    authority,
    actorCallBindings: [],
    readBudget: {
      consumed: 0,
      maximum: Math.min(
        maximumReadsForCapabilityAdmissionV1(
          pending.seed.capabilityAdmission
        ),
        hostReceipt.budget.maxReads
      ),
    },
    activatedAt,
  };
  const { recordHash: _pendingHash, ...withoutOldHash } = value;
  return { ...withoutOldHash, recordHash: recordHash(withoutOldHash) };
};

export const rejectH1RuntimeAdmissionV1 = (input: Readonly<{
  pending: H1RuntimeAdmissionPendingV1;
  rejectionCode: string;
  rejectedAt: string;
}>): H1RuntimeAdmissionRejectedV1 => {
  const pending = decodeH1RuntimeAdmissionRecordV1(input.pending);
  if (pending.status !== "pending") {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_rejection_state_invalid",
      "Only a pending H1 admission may be rejected."
    );
  }
  const value = {
    ...pending,
    status: "rejected" as const,
    rejectionCode: safeRequired(() => requiredIdV1(input.rejectionCode, "h1Admission.rejectionCode"), "h1Admission.rejectionCode"),
    rejectedAt: safeRequired(() => requiredTimestampV1(input.rejectedAt, "h1Admission.rejectedAt"), "h1Admission.rejectedAt"),
  };
  const { recordHash: _pendingHash, ...withoutOldHash } = value;
  return { ...withoutOldHash, recordHash: recordHash(withoutOldHash) };
};

export const consumeH1RuntimeAdmissionReadV1 = (
  record: H1RuntimeAdmissionActiveV1,
  now: string
): H1RuntimeAdmissionActiveV1 => {
  const decoded = decodeH1RuntimeAdmissionRecordV1(record);
  if (decoded.status !== "active") {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_admission_not_active",
      "H1 Run authority is not active."
    );
  }
  const nowEpoch = Date.parse(
    safeRequired(() => requiredTimestampV1(now, "h1Admission.readAt"), "h1Admission.readAt")
  );
  if (
    Date.parse(decoded.hostReceipt.expiresAt) <= nowEpoch ||
    Date.parse(decoded.authority.executionAdmission.expiresAt) <= nowEpoch
  ) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_admission_expired",
      "H1 Run authority expired before the read."
    );
  }
  if (decoded.readBudget.consumed >= decoded.readBudget.maximum) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_read_budget_exceeded",
      "H1 Run authority read budget was exhausted."
    );
  }
  const value = {
    ...decoded,
    readBudget: {
      ...decoded.readBudget,
      consumed: decoded.readBudget.consumed + 1,
    },
  };
  const { recordHash: _oldHash, ...withoutOldHash } = value;
  return { ...withoutOldHash, recordHash: recordHash(withoutOldHash) };
};

export const decodeH1RuntimeAdmissionRecordV1 = (
  value: unknown
): H1RuntimeAdmissionRecordV1 => {
  const input = assertPlainRecord(value, "h1AdmissionRecord");
  const commonKeys = [
    "contractVersion", "requestId", "workspaceId", "sessionId", "documentId",
    "threadId", "turnId", "runId", "claimCeiling", "seed", "createdAt",
    "status", "recordHash",
  ];
  const status = input.status;
  const keys = status === "active"
    ? [...commonKeys, "grantReceipt", "hostReceipt", "authority", "actorCallBindings", "readBudget", "activatedAt"]
    : status === "rejected"
      ? [...commonKeys, "rejectionCode", "rejectedAt"]
      : commonKeys;
  assertExactKeys(input, keys, "h1AdmissionRecord");
  if (
    input.contractVersion !== H1_RUNTIME_ADMISSION_V1.recordContractVersion ||
    input.claimCeiling !== H1_RUNTIME_ADMISSION_V1.claimCeiling ||
    !["pending", "active", "rejected"].includes(String(status))
  ) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_admission_version_mismatch",
      "H1 admission record identity differs."
    );
  }
  const base = {
    contractVersion: H1_RUNTIME_ADMISSION_V1.recordContractVersion,
    requestId: safeRequired(() => requiredIdV1(input.requestId, "h1Admission.requestId"), "h1Admission.requestId"),
    workspaceId: safeRequired(() => requiredIdV1(input.workspaceId, "h1Admission.workspaceId"), "h1Admission.workspaceId"),
    sessionId: safeRequired(() => requiredIdV1(input.sessionId, "h1Admission.sessionId"), "h1Admission.sessionId"),
    documentId: safeRequired(() => requiredIdV1(input.documentId, "h1Admission.documentId"), "h1Admission.documentId"),
    threadId: safeRequired(() => requiredIdV1(input.threadId, "h1Admission.threadId"), "h1Admission.threadId"),
    turnId: safeRequired(() => requiredIdV1(input.turnId, "h1Admission.turnId"), "h1Admission.turnId"),
    runId: safeRequired(() => requiredIdV1(input.runId, "h1Admission.runId"), "h1Admission.runId"),
    claimCeiling: H1_RUNTIME_ADMISSION_V1.claimCeiling,
    seed: decodeH1RuntimeAdmissionSeedV1(input.seed),
    createdAt: safeRequired(() => requiredTimestampV1(input.createdAt, "h1Admission.createdAt"), "h1Admission.createdAt"),
  } as const;
  let decoded: H1RuntimeAdmissionRecordV1;
  if (status === "pending") {
    decoded = { ...base, status: "pending", recordHash: String(input.recordHash) };
  } else if (status === "rejected") {
    decoded = {
      ...base,
      status: "rejected",
      rejectionCode: safeRequired(() => requiredIdV1(input.rejectionCode, "h1Admission.rejectionCode"), "h1Admission.rejectionCode"),
      rejectedAt: safeRequired(() => requiredTimestampV1(input.rejectedAt, "h1Admission.rejectedAt"), "h1Admission.rejectedAt"),
      recordHash: String(input.recordHash),
    };
  } else {
    const readBudget = assertPlainRecord(input.readBudget, "h1Admission.readBudget");
    assertExactKeys(readBudget, ["consumed", "maximum"], "h1Admission.readBudget");
    if (
      !Number.isInteger(readBudget.consumed) ||
      !Number.isInteger(readBudget.maximum) ||
      Number(readBudget.consumed) < 0 ||
      Number(readBudget.maximum) < 1 ||
      Number(readBudget.consumed) > Number(readBudget.maximum) ||
      Number(readBudget.maximum) > H1_RUNTIME_ADMISSION_V1.maxReads
    ) {
      throw new H1RuntimeAdmissionErrorV1(
        "h1_runtime_read_budget_invalid",
        "H1 runtime read budget is invalid."
      );
    }
    const authority = decodeH1RuntimeAuthorityMaterialV1(input.authority);
    if (!Array.isArray(input.actorCallBindings)) {
      throw new H1RuntimeAdmissionErrorV1(
        "h1_actor_call_bindings_invalid",
        "Persisted H1 Actor call bindings must be an array."
      );
    }
    const actorCallBindings = input.actorCallBindings.map((binding) =>
      decodeH1ActorCallBindingV1(binding)
    );
    if (
      actorCallBindings.length > 32 ||
      actorCallBindings.some(
        (binding, index) =>
          binding.runId !== base.runId ||
          binding.turnId !== base.turnId ||
          binding.threadId !== base.threadId ||
          binding.sequence !== index + 1
      ) ||
      new Set(actorCallBindings.map((binding) => binding.actorCallId)).size !==
        actorCallBindings.length
    ) {
      throw new H1RuntimeAdmissionErrorV1(
        "h1_actor_call_bindings_invalid",
        "Persisted H1 Actor call bindings are not one ordered Run closure."
      );
    }
    const grantReceipt = safeRequired(
      () => decodeEffectiveFactsCaptureGrantReceiptV1(input.grantReceipt),
      "h1Admission.grantReceipt"
    );
    const hostReceipt = safeRequired(
      () => decodeEffectiveFactsHostReceiptV1(input.hostReceipt),
      "h1Admission.hostReceipt"
    );
    const active = {
      ...base,
      status: "active" as const,
      grantReceipt,
      hostReceipt,
      authority,
      actorCallBindings,
      readBudget: {
        consumed: Number(readBudget.consumed),
        maximum: Number(readBudget.maximum),
      },
      activatedAt: safeRequired(() => requiredTimestampV1(input.activatedAt, "h1Admission.activatedAt"), "h1Admission.activatedAt"),
      recordHash: String(input.recordHash),
    };
    assertReceiptClosure({
      identity: active,
      grantReceipt: active.grantReceipt,
      hostReceipt: active.hostReceipt,
      authority: active.authority,
    });
    if (
      active.activatedAt !== active.grantReceipt.consumedAt ||
      active.readBudget.maximum !==
        Math.min(
          maximumReadsForCapabilityAdmissionV1(
            active.seed.capabilityAdmission
          ),
          active.hostReceipt.budget.maxReads
        )
    ) {
      throw new H1RuntimeAdmissionErrorV1(
        "h1_runtime_activation_closure_mismatch",
        "Persisted H1 activation timing or read budget differs from its Receipts."
      );
    }
    decoded = active;
  }
  const { recordHash: suppliedHash, ...withoutHash } = decoded;
  safeRequired(() => requiredHashV1(suppliedHash, "h1Admission.recordHash"), "h1Admission.recordHash");
  if (recordHash(withoutHash) !== suppliedHash) {
    throw new H1RuntimeAdmissionErrorV1(
      "h1_runtime_admission_hash_mismatch",
      "H1 admission record hash differs."
    );
  }
  return structuredClone(decoded);
};

export const h1RuntimeGrantNonceHashV1 = (
  seed: H1RuntimeAdmissionSeedV1
) => hashUtf8V1(decodeH1RuntimeAdmissionSeedV1(seed).grantClaims.nonce);

export const h1RuntimeMountIdV1 = (seed: H1RuntimeAdmissionSeedV1) =>
  safeRequired(
    () => requiredRuntimeMountIdV1(seed.snapshot.mountId, "h1Admission.mountId"),
    "h1Admission.mountId"
  );
