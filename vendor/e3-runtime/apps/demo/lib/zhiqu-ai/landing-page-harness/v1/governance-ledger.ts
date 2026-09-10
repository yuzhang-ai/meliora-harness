import {
  LANDING_PAGE_GOVERNANCE_V1,
  CLAIM_GATE_REJECTION_CODES_V1,
  TURN_DELIVERY_OUTCOMES_V1,
  decodeGoalContractV1,
  type ClaimGateRejectionCodeV1,
  type GoalContractV1,
  type TurnDeliveryOutcomeV1,
} from "./governance-contracts";
import {
  StrictJsonErrorV1,
  hashCanonicalJsonV1,
  requiredHashV1,
  requiredIdV1,
  requiredModelIdentityV1,
  requiredTimestampV1,
  strictRecordV1,
} from "./strict-json";

export const LANDING_PAGE_GOVERNANCE_FACTS_V1 = Object.freeze({
  goalBinding: "landing-page-run-goal-binding-v1",
  terminalAdmission: "landing-page-terminal-admission-record-v1",
  canonicalDelivery: "landing-page-canonical-delivery-v1",
  runFingerprint: "landing-page-run-fingerprint-v1",
  runFingerprintV2: "landing-page-run-fingerprint-v2",
  migration: "landing-page-conversation-store-migration-v2",
});
export const CANONICAL_DELIVERY_TEMPLATE_IDS_V1 = Object.freeze([
  "terminal-fulfilled-v1", "terminal-fulfilled-with-limitations-v1",
  "terminal-advisory-only-v1", "terminal-awaiting-user-v1",
  "terminal-blocked-capability-v1", "terminal-blocked-policy-v1",
  "terminal-recoverable-failure-v1", "capability-unavailable-degraded-v1",
  "repeated-tool-failure-degraded-v1",
] as const);
export type CanonicalDeliveryTemplateIdV1 = (typeof CANONICAL_DELIVERY_TEMPLATE_IDS_V1)[number];

export type RunGoalBindingV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_GOVERNANCE_FACTS_V1.goalBinding;
  runGoalBindingId: string; runId: string; goal: GoalContractV1; goalHash: string;
  source: Readonly<{ threadId: string; triggerMessageId: string }>;
  bindingStage: "terminal_admission_only";
  boundBy: Readonly<{ terminalProposalId: string; toolCallId: string }>;
  boundAt: string; supersedesBindingId: null;
}>;
export type RunFingerprintV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_GOVERNANCE_FACTS_V1.runFingerprint;
  runFingerprintId: string; runId: string; runtimeContractVersion: string;
  runtimeBuildRef: string; modelIdentity: string; promptManifestHash: string;
  capabilitySnapshotHash: string; toolDescriptorFingerprint: string;
  toolDescriptorIdentities?: readonly Readonly<{ toolId: string; version: string }>[];
  terminalDescriptorFacts?: readonly Readonly<{
    toolId: string;
    version: string;
    effect: "runtime_state" | "read_only" | "capability_read";
  }>[];
  contextSchemaVersion: string; publicProjectionContractVersion: string;
  fingerprintHash: string; createdAt: string;
}>;
export type RunFingerprintV2 = Readonly<
  Omit<RunFingerprintV1, "contractVersion"> & {
    contractVersion: typeof LANDING_PAGE_GOVERNANCE_FACTS_V1.runFingerprintV2;
    catalogBindingId: string;
    catalogBindingHash: string;
    catalogProfileId: string;
    catalogEpoch: number;
    catalogHash: string;
    eventEnvelopeVersion: string;
  }
>;
export type RunFingerprintRecordV1 = RunFingerprintV1 | RunFingerprintV2;
export type TerminalAdmissionRecordV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_GOVERNANCE_FACTS_V1.terminalAdmission;
  terminalAdmissionId: string; runId: string; terminalProposalId: string;
  terminalToolCallId: string; terminalArgumentsHash: string;
  runGoalBindingId: string; goalHash: string; proposedOutcome: TurnDeliveryOutcomeV1;
  claimGateContractVersion: typeof LANDING_PAGE_GOVERNANCE_V1.claimGateAssessment;
  claimGateAssessmentHash: string; decision: "admitted" | "rejected";
  rejectionCodes: readonly ClaimGateRejectionCodeV1[];
  evidenceReceiptCallIds: readonly string[]; toolDescriptorFingerprint: string;
  runFingerprintId: string; runFingerprintHash: string; admittedAt: string;
}>;
export type CanonicalDeliveryV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_GOVERNANCE_FACTS_V1.canonicalDelivery;
  canonicalDeliveryId: string; runId: string; terminalAdmissionId: string | null;
  runGoalBindingId: string | null;
  kind: "admitted_terminal_proposal" | "capability_unavailable_degraded" | "repeated_tool_failure_degraded";
  deliveryTemplateId: CanonicalDeliveryTemplateIdV1; finalOutputHash: string;
  messageId: string; evidenceReceiptCallIds: readonly string[];
  runFingerprintId: string; runFingerprintHash: string; createdAt: string;
}>;
export type ConversationStoreMigrationRecordV2 = Readonly<{
  contractVersion: typeof LANDING_PAGE_GOVERNANCE_FACTS_V1.migration;
  migrationId: "conversation-store-v1-to-v2";
  sourceVersion: "landing-page-conversation-store-state-v1";
  targetVersion: "landing-page-conversation-store-state-v2";
  sourcePayloadHash: string; migratedAt: string;
}>;

const version = (value: unknown, expected: string, path: string) => {
  if (value !== expected) throw new StrictJsonErrorV1("contract_version_mismatch", path, `Expected ${expected}.`);
};
const nullableId = (value: unknown, path: string) => value === null ? null : requiredIdV1(value, path);
const ids = (value: unknown, path: string) => {
  if (!Array.isArray(value) || value.length > 64) throw new StrictJsonErrorV1("invalid_array", path, "Expected a bounded ID array.");
  const result = value.map((item, index) => requiredIdV1(item, `${path}[${index}]`));
  if (new Set(result).size !== result.length) throw new StrictJsonErrorV1("duplicate_identity", path, "IDs must be unique.");
  return result;
};

export const decodeRunGoalBindingV1 = (value: unknown): RunGoalBindingV1 => {
  const record = strictRecordV1(value, ["contractVersion", "runGoalBindingId", "runId", "goal", "goalHash", "source", "bindingStage", "boundBy", "boundAt", "supersedesBindingId"], "runGoalBinding");
  version(record.contractVersion, LANDING_PAGE_GOVERNANCE_FACTS_V1.goalBinding, "runGoalBinding.contractVersion");
  requiredIdV1(record.runGoalBindingId, "runGoalBinding.runGoalBindingId"); requiredIdV1(record.runId, "runGoalBinding.runId");
  const goal = decodeGoalContractV1(record.goal); requiredHashV1(record.goalHash, "runGoalBinding.goalHash");
  if (record.goalHash !== hashCanonicalJsonV1(goal)) throw new StrictJsonErrorV1("hash_mismatch", "runGoalBinding.goalHash", "Goal hash differs.");
  const source = strictRecordV1(record.source, ["threadId", "triggerMessageId"], "runGoalBinding.source");
  requiredIdV1(source.threadId, "runGoalBinding.source.threadId"); requiredIdV1(source.triggerMessageId, "runGoalBinding.source.triggerMessageId");
  if (record.bindingStage !== "terminal_admission_only") throw new StrictJsonErrorV1("invalid_enum", "runGoalBinding.bindingStage", "Binding cannot claim pre-execution authorization.");
  const boundBy = strictRecordV1(record.boundBy, ["terminalProposalId", "toolCallId"], "runGoalBinding.boundBy");
  requiredIdV1(boundBy.terminalProposalId, "runGoalBinding.boundBy.terminalProposalId"); requiredIdV1(boundBy.toolCallId, "runGoalBinding.boundBy.toolCallId");
  requiredTimestampV1(record.boundAt, "runGoalBinding.boundAt");
  if (record.supersedesBindingId !== null) throw new StrictJsonErrorV1("invalid_state_tuple", "runGoalBinding.supersedesBindingId", "Run-local Goal amendment is unsupported.");
  return structuredClone({ ...record, goal, source, boundBy }) as RunGoalBindingV1;
};

export const decodeRunFingerprintV1 = (value: unknown): RunFingerprintV1 => {
  const hasDescriptorIdentities = Boolean(
    value &&
      typeof value === "object" &&
      Object.prototype.hasOwnProperty.call(value, "toolDescriptorIdentities")
  );
  const hasTerminalDescriptorFacts = Boolean(
    value &&
      typeof value === "object" &&
      Object.prototype.hasOwnProperty.call(value, "terminalDescriptorFacts")
  );
  const record = strictRecordV1(value, ["contractVersion", "runFingerprintId", "runId", "runtimeContractVersion", "runtimeBuildRef", "modelIdentity", "promptManifestHash", "capabilitySnapshotHash", "toolDescriptorFingerprint", ...(hasDescriptorIdentities ? ["toolDescriptorIdentities"] : []), ...(hasTerminalDescriptorFacts ? ["terminalDescriptorFacts"] : []), "contextSchemaVersion", "publicProjectionContractVersion", "fingerprintHash", "createdAt"], "runFingerprint");
  version(record.contractVersion, LANDING_PAGE_GOVERNANCE_FACTS_V1.runFingerprint, "runFingerprint.contractVersion");
  for (const field of ["runFingerprintId", "runId", "runtimeContractVersion", "runtimeBuildRef", "contextSchemaVersion", "publicProjectionContractVersion"] as const) requiredIdV1(record[field], `runFingerprint.${field}`);
  requiredModelIdentityV1(record.modelIdentity, "runFingerprint.modelIdentity");
  for (const field of ["promptManifestHash", "capabilitySnapshotHash", "toolDescriptorFingerprint", "fingerprintHash"] as const) requiredHashV1(record[field], `runFingerprint.${field}`);
  let toolDescriptorIdentities: readonly Readonly<{ toolId: string; version: string }>[] | undefined;
  if (hasDescriptorIdentities) {
    if (!Array.isArray(record.toolDescriptorIdentities) || record.toolDescriptorIdentities.length > 64)
      throw new StrictJsonErrorV1("invalid_array", "runFingerprint.toolDescriptorIdentities", "Expected a bounded descriptor identity array.");
    toolDescriptorIdentities = record.toolDescriptorIdentities.map((value, index) => {
      const identity = strictRecordV1(value, ["toolId", "version"], `runFingerprint.toolDescriptorIdentities[${index}]`);
      return {
        toolId: requiredIdV1(identity.toolId, `runFingerprint.toolDescriptorIdentities[${index}].toolId`),
        version: requiredIdV1(identity.version, `runFingerprint.toolDescriptorIdentities[${index}].version`),
      };
    });
    const keys = toolDescriptorIdentities.map(({ toolId, version }) => `${toolId}\u0000${version}`);
    if (new Set(keys).size !== keys.length)
      throw new StrictJsonErrorV1("duplicate_identity", "runFingerprint.toolDescriptorIdentities", "Descriptor identities must be unique.");
  }
  let terminalDescriptorFacts: readonly Readonly<{
    toolId: string;
    version: string;
    effect: "runtime_state" | "read_only" | "capability_read";
  }>[] | undefined;
  if (hasTerminalDescriptorFacts) {
    if (!Array.isArray(record.terminalDescriptorFacts) || record.terminalDescriptorFacts.length > 64)
      throw new StrictJsonErrorV1("invalid_array", "runFingerprint.terminalDescriptorFacts", "Expected a bounded terminal descriptor fact array.");
    terminalDescriptorFacts = record.terminalDescriptorFacts.map((value, index) => {
      const fact = strictRecordV1(value, ["toolId", "version", "effect"], `runFingerprint.terminalDescriptorFacts[${index}]`);
      if (!["runtime_state", "read_only", "capability_read"].includes(String(fact.effect)))
        throw new StrictJsonErrorV1("invalid_enum", `runFingerprint.terminalDescriptorFacts[${index}].effect`, "Unknown Tool effect.");
      return {
        toolId: requiredIdV1(fact.toolId, `runFingerprint.terminalDescriptorFacts[${index}].toolId`),
        version: requiredIdV1(fact.version, `runFingerprint.terminalDescriptorFacts[${index}].version`),
        effect: fact.effect as "runtime_state" | "read_only" | "capability_read",
      };
    });
    const keys = terminalDescriptorFacts.map(({ toolId, version }) => `${toolId}\u0000${version}`);
    if (new Set(keys).size !== keys.length)
      throw new StrictJsonErrorV1("duplicate_identity", "runFingerprint.terminalDescriptorFacts", "Terminal descriptor facts must be unique.");
    const sortedKeys = [...keys].sort((left, right) => left.localeCompare(right));
    if (keys.some((key, index) => key !== sortedKeys[index]))
      throw new StrictJsonErrorV1("invalid_order", "runFingerprint.terminalDescriptorFacts", "Terminal descriptor facts must use canonical order.");
    if (!toolDescriptorIdentities || hashCanonicalJsonV1(terminalDescriptorFacts.map(({ toolId, version }) => ({ toolId, version }))) !== hashCanonicalJsonV1(toolDescriptorIdentities))
      throw new StrictJsonErrorV1("identity_mismatch", "runFingerprint.terminalDescriptorFacts", "Terminal descriptor facts must match the frozen descriptor identities.");
  }
  requiredTimestampV1(record.createdAt, "runFingerprint.createdAt");
  const { fingerprintHash, ...hashInput } = record;
  if (fingerprintHash !== hashCanonicalJsonV1(hashInput)) throw new StrictJsonErrorV1("hash_mismatch", "runFingerprint.fingerprintHash", "Fingerprint hash differs.");
  return structuredClone({
    ...record,
    ...(toolDescriptorIdentities ? { toolDescriptorIdentities } : {}),
    ...(terminalDescriptorFacts ? { terminalDescriptorFacts } : {}),
  }) as RunFingerprintV1;
};

export const decodeRunFingerprintV2 = (value: unknown): RunFingerprintV2 => {
  const hasDescriptorIdentities = Boolean(
    value &&
      typeof value === "object" &&
      Object.prototype.hasOwnProperty.call(value, "toolDescriptorIdentities")
  );
  const hasTerminalDescriptorFacts = Boolean(
    value &&
      typeof value === "object" &&
      Object.prototype.hasOwnProperty.call(value, "terminalDescriptorFacts")
  );
  const record = strictRecordV1(
    value,
    [
      "contractVersion",
      "runFingerprintId",
      "runId",
      "runtimeContractVersion",
      "runtimeBuildRef",
      "modelIdentity",
      "promptManifestHash",
      "capabilitySnapshotHash",
      "toolDescriptorFingerprint",
      ...(hasDescriptorIdentities ? ["toolDescriptorIdentities"] : []),
      ...(hasTerminalDescriptorFacts ? ["terminalDescriptorFacts"] : []),
      "contextSchemaVersion",
      "publicProjectionContractVersion",
      "catalogBindingId",
      "catalogBindingHash",
      "catalogProfileId",
      "catalogEpoch",
      "catalogHash",
      "eventEnvelopeVersion",
      "fingerprintHash",
      "createdAt",
    ],
    "runFingerprint"
  );
  version(
    record.contractVersion,
    LANDING_PAGE_GOVERNANCE_FACTS_V1.runFingerprintV2,
    "runFingerprint.contractVersion"
  );
  for (const field of [
    "catalogBindingId",
    "catalogProfileId",
    "eventEnvelopeVersion",
  ] as const) {
    requiredIdV1(record[field], `runFingerprint.${field}`);
  }
  for (const field of ["catalogBindingHash", "catalogHash"] as const) {
    requiredHashV1(record[field], `runFingerprint.${field}`);
  }
  if (!Number.isSafeInteger(record.catalogEpoch) || Number(record.catalogEpoch) < 1) {
    throw new StrictJsonErrorV1(
      "invalid_number",
      "runFingerprint.catalogEpoch",
      "Catalog epoch must be a positive safe integer."
    );
  }
  const {
    catalogBindingId,
    catalogBindingHash,
    catalogProfileId,
    catalogEpoch,
    catalogHash,
    eventEnvelopeVersion,
    fingerprintHash,
    ...common
  } = record;
  const v1Input = {
    ...common,
    contractVersion: LANDING_PAGE_GOVERNANCE_FACTS_V1.runFingerprint,
  };
  const decodedV1 = decodeRunFingerprintV1({
    ...v1Input,
    fingerprintHash: hashCanonicalJsonV1(v1Input),
  });
  const { fingerprintHash: _ignored, ...hashInput } = record;
  if (fingerprintHash !== hashCanonicalJsonV1(hashInput)) {
    throw new StrictJsonErrorV1(
      "hash_mismatch",
      "runFingerprint.fingerprintHash",
      "Fingerprint hash differs."
    );
  }
  return structuredClone({
    ...decodedV1,
    contractVersion: LANDING_PAGE_GOVERNANCE_FACTS_V1.runFingerprintV2,
    catalogBindingId,
    catalogBindingHash,
    catalogProfileId,
    catalogEpoch,
    catalogHash,
    eventEnvelopeVersion,
    fingerprintHash,
  }) as RunFingerprintV2;
};

export const decodeRunFingerprintRecordV1 = (
  value: unknown
): RunFingerprintRecordV1 => {
  const contractVersion =
    value && typeof value === "object" && "contractVersion" in value
      ? (value as { contractVersion?: unknown }).contractVersion
      : undefined;
  return contractVersion === LANDING_PAGE_GOVERNANCE_FACTS_V1.runFingerprintV2
    ? decodeRunFingerprintV2(value)
    : decodeRunFingerprintV1(value);
};

export const decodeTerminalAdmissionRecordV1 = (value: unknown): TerminalAdmissionRecordV1 => {
  const record = strictRecordV1(value, ["contractVersion", "terminalAdmissionId", "runId", "terminalProposalId", "terminalToolCallId", "terminalArgumentsHash", "runGoalBindingId", "goalHash", "proposedOutcome", "claimGateContractVersion", "claimGateAssessmentHash", "decision", "rejectionCodes", "evidenceReceiptCallIds", "toolDescriptorFingerprint", "runFingerprintId", "runFingerprintHash", "admittedAt"], "terminalAdmission");
  version(record.contractVersion, LANDING_PAGE_GOVERNANCE_FACTS_V1.terminalAdmission, "terminalAdmission.contractVersion");
  for (const field of ["terminalAdmissionId", "runId", "terminalProposalId", "terminalToolCallId", "runGoalBindingId", "runFingerprintId"] as const) requiredIdV1(record[field], `terminalAdmission.${field}`);
  for (const field of ["terminalArgumentsHash", "goalHash", "claimGateAssessmentHash", "toolDescriptorFingerprint", "runFingerprintHash"] as const) requiredHashV1(record[field], `terminalAdmission.${field}`);
  if (!TURN_DELIVERY_OUTCOMES_V1.includes(record.proposedOutcome as TurnDeliveryOutcomeV1)) throw new StrictJsonErrorV1("invalid_enum", "terminalAdmission.proposedOutcome", "Invalid outcome.");
  version(record.claimGateContractVersion, LANDING_PAGE_GOVERNANCE_V1.claimGateAssessment, "terminalAdmission.claimGateContractVersion");
  if (record.decision !== "admitted" && record.decision !== "rejected") throw new StrictJsonErrorV1("invalid_enum", "terminalAdmission.decision", "Invalid decision.");
  const rejectionCodes = ids(record.rejectionCodes, "terminalAdmission.rejectionCodes") as readonly ClaimGateRejectionCodeV1[];
  if (rejectionCodes.some((code) => !CLAIM_GATE_REJECTION_CODES_V1.includes(code))) throw new StrictJsonErrorV1("invalid_enum", "terminalAdmission.rejectionCodes", "Unknown claim-gate rejection code.");
  if ((record.decision === "admitted" && rejectionCodes.length) || (record.decision === "rejected" && !rejectionCodes.length)) throw new StrictJsonErrorV1("invalid_state_tuple", "terminalAdmission.rejectionCodes", "Decision and rejection codes disagree.");
  const evidenceReceiptCallIds = ids(record.evidenceReceiptCallIds, "terminalAdmission.evidenceReceiptCallIds");
  requiredTimestampV1(record.admittedAt, "terminalAdmission.admittedAt");
  return structuredClone({ ...record, rejectionCodes, evidenceReceiptCallIds }) as unknown as TerminalAdmissionRecordV1;
};

export const decodeCanonicalDeliveryV1 = (value: unknown): CanonicalDeliveryV1 => {
  const record = strictRecordV1(value, ["contractVersion", "canonicalDeliveryId", "runId", "terminalAdmissionId", "runGoalBindingId", "kind", "deliveryTemplateId", "finalOutputHash", "messageId", "evidenceReceiptCallIds", "runFingerprintId", "runFingerprintHash", "createdAt"], "canonicalDelivery");
  version(record.contractVersion, LANDING_PAGE_GOVERNANCE_FACTS_V1.canonicalDelivery, "canonicalDelivery.contractVersion");
  for (const field of ["canonicalDeliveryId", "runId", "messageId", "runFingerprintId"] as const) requiredIdV1(record[field], `canonicalDelivery.${field}`);
  nullableId(record.terminalAdmissionId, "canonicalDelivery.terminalAdmissionId"); nullableId(record.runGoalBindingId, "canonicalDelivery.runGoalBindingId");
  if (!["admitted_terminal_proposal", "capability_unavailable_degraded", "repeated_tool_failure_degraded"].includes(String(record.kind))) throw new StrictJsonErrorV1("invalid_enum", "canonicalDelivery.kind", "Invalid delivery kind.");
  if (!CANONICAL_DELIVERY_TEMPLATE_IDS_V1.includes(record.deliveryTemplateId as CanonicalDeliveryTemplateIdV1)) throw new StrictJsonErrorV1("invalid_enum", "canonicalDelivery.deliveryTemplateId", "Unknown template.");
  requiredHashV1(record.finalOutputHash, "canonicalDelivery.finalOutputHash"); requiredHashV1(record.runFingerprintHash, "canonicalDelivery.runFingerprintHash");
  const evidenceReceiptCallIds = ids(record.evidenceReceiptCallIds, "canonicalDelivery.evidenceReceiptCallIds"); requiredTimestampV1(record.createdAt, "canonicalDelivery.createdAt");
  const terminal = record.kind === "admitted_terminal_proposal";
  if (terminal !== (record.terminalAdmissionId !== null && record.runGoalBindingId !== null)) throw new StrictJsonErrorV1("invalid_state_tuple", "canonicalDelivery", "Only admitted terminal delivery references terminal facts.");
  return structuredClone({ ...record, evidenceReceiptCallIds }) as unknown as CanonicalDeliveryV1;
};

export const decodeConversationStoreMigrationRecordV2 = (value: unknown): ConversationStoreMigrationRecordV2 => {
  const record = strictRecordV1(value, ["contractVersion", "migrationId", "sourceVersion", "targetVersion", "sourcePayloadHash", "migratedAt"], "migration");
  version(record.contractVersion, LANDING_PAGE_GOVERNANCE_FACTS_V1.migration, "migration.contractVersion");
  if (record.migrationId !== "conversation-store-v1-to-v2" || record.sourceVersion !== "landing-page-conversation-store-state-v1" || record.targetVersion !== "landing-page-conversation-store-state-v2") throw new StrictJsonErrorV1("invalid_state_tuple", "migration", "Unsupported Store migration.");
  requiredHashV1(record.sourcePayloadHash, "migration.sourcePayloadHash"); requiredTimestampV1(record.migratedAt, "migration.migratedAt");
  return structuredClone(record) as ConversationStoreMigrationRecordV2;
};
