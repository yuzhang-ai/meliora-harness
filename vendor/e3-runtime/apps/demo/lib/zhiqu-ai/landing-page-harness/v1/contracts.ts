import {
  assertPublicSafeStringV1,
  StrictJsonErrorV1,
  hashCanonicalJsonV1,
  hashUtf8V1,
  requiredHashV1,
  requiredIdV1,
  requiredModelIdentityV1,
  requiredStringV1,
  requiredTimestampV1,
  strictRecordV1,
} from "./strict-json";

export const LANDING_PAGE_HARNESS_V1 = Object.freeze({
  thread: "landing-page-conversation-thread-v1",
  message: "landing-page-conversation-message-v1",
  turn: "landing-page-agent-turn-v1",
  run: "landing-page-agent-run-v1",
  event: "landing-page-public-runtime-event-v1",
  toolReceipt: "landing-page-tool-invocation-receipt-v1",
  capability: "landing-page-runtime-capability-snapshot-v2",
  checkpoint: "landing-page-run-recovery-checkpoint-v1",
  resume: "landing-page-resume-run-input-v1",
  cursor: "landing-page-event-cursor-v1",
  governance: "landing-page-governance-contracts-v1",
  deliveryProvenance: "landing-page-host-delivery-provenance-v1",
});

export const LANDING_PAGE_HARNESS_LIMITS_V1 = Object.freeze({
  maxMessageCharacters: 20_000,
  maxCreateTurnRequestBytes: 2_100_000,
  maxThreadMessagesInContext: 80,
  maxActorContextBytes: 160_000,
  maxActorSystemContextBytes: 8_000,
  maxToolObservationContextBytes: 16_000,
  maxActorIterations: 6,
  maxToolCallsPerRun: 8,
  maxPlanSteps: 12,
  maxResourceRangeCharacters: 4_000,
  maxSteadyStatePublicEventsPerRun: 1_000,
  // Four slots above the steady-state ceiling let a legacy saturated Run
  // durably record terminal truth without widening normal execution.
  maxPublicEventsPerRun: 1_004,
});

export type AgentRunStatusV1 =
  | "queued"
  | "running"
  | "recovering"
  | "completed"
  | "awaiting_user"
  | "stopped_recoverable"
  | "recoverable_failed";

export const RUN_PUBLIC_ERROR_CODES_V1 = Object.freeze([
  "run_stopped",
  "runtime_interrupted",
  "tool_outcome_unknown",
  "model_provider_failed",
  "model_provider_timeout",
  "model_rate_limited",
  "model_output_invalid",
  "model_output_truncated",
  "model_output_filtered",
  "model_cancelled",
  "context_budget_exceeded",
  "context_build_failed",
  "actor_iteration_budget_exceeded",
  "tool_call_budget_exceeded",
  "runtime_internal_error",
] as const);
export type RunPublicErrorCodeV1 = (typeof RUN_PUBLIC_ERROR_CODES_V1)[number];

export type ConversationRoleV1 = "user" | "assistant" | "tool";

export type ToolCallV1 = Readonly<{
  callId: string;
  toolId: string;
  argumentsJson: string;
}>;

export type ConversationMessageV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_HARNESS_V1.message;
  messageId: string;
  workspaceId: string;
  sessionId: string;
  threadId: string;
  turnId: string;
  runId: string;
  sequence: number;
  role: ConversationRoleV1;
  content: string;
  toolCallId: string | null;
  toolCalls: readonly ToolCallV1[];
  createdAt: string;
}>;

export type PlanStepStatusV1 = "pending" | "in_progress" | "completed";

export type PlanStepV1 = Readonly<{
  stepId: string;
  description: string;
  status: PlanStepStatusV1;
}>;

export type ConversationThreadV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_HARNESS_V1.thread;
  threadId: string;
  workspaceId: string;
  sessionId: string;
  documentId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: readonly ConversationMessageV1[];
}>;

export type AgentTurnV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_HARNESS_V1.turn;
  turnId: string;
  workspaceId: string;
  sessionId: string;
  documentId: string;
  runId: string;
  threadId: string;
  triggerMessageId: string;
  deliveredAt: string | null;
  createdAt: string;
}>;

export type ToolInvocationStatusV1 =
  | "completed"
  | "unavailable"
  | "denied"
  | "schema_invalid"
  | "transport_unknown"
  | "failed";

export type ToolRetryDispositionV1 =
  | "do_not_retry"
  | "revise_input"
  | "retry_same_call_id";

export type ToolInvocationReceiptV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_HARNESS_V1.toolReceipt;
  receiptId: string;
  workspaceId: string;
  sessionId: string;
  threadId: string;
  turnId: string;
  runId: string;
  callId: string;
  toolId: string;
  toolVersion: string;
  argumentsHash: string;
  resultHash: string;
  resultRef: string;
  writeCertainty: "not_applicable";
  status: ToolInvocationStatusV1;
  retryDisposition: ToolRetryDispositionV1;
  observation: string;
  createdAt: string;
}>;

export type RuntimeEventCategoryV1 =
  | "run"
  | "assistant"
  | "plan"
  | "tool"
  | "capability"
  | "delivery";

export type PublicRuntimeEventV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_HARNESS_V1.event;
  eventId: string;
  workspaceId: string;
  sessionId: string;
  threadId: string;
  turnId: string;
  runId: string;
  sequence: number;
  category: RuntimeEventCategoryV1;
  state: string;
  callId: string | null;
  publicData: Readonly<Record<string, unknown>>;
  previousEventHash: string;
  eventHash: string;
  createdAt: string;
}>;

export type HostDeliveryProvenanceV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_HARNESS_V1.deliveryProvenance;
  kind:
    | "admitted_terminal_proposal"
    | "capability_unavailable_degraded"
    | "repeated_tool_failure_degraded";
  evidenceReceiptCallIds: readonly string[];
  terminalProposalArgumentsHash: string | null;
  toolDescriptorFingerprint: string;
}>;

export type AgentRunV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_HARNESS_V1.run;
  runId: string;
  workspaceId: string;
  sessionId: string;
  documentId: string;
  turnId: string;
  threadId: string;
  triggerMessageId: string;
  runRevision: number;
  recoveryCheckpointId: string | null;
  status: AgentRunStatusV1;
  plan: readonly PlanStepV1[];
  receipts: readonly ToolInvocationReceiptV1[];
  finalOutput: string | null;
  /** Missing on pre-governance records; all new Host deliveries persist it. */
  deliveryProvenance?: HostDeliveryProvenanceV1 | null;
  errorCode: RunPublicErrorCodeV1 | null;
  cancellationRequested: boolean;
  createdAt: string;
  updatedAt: string;
}>;

export type RunRecoveryCheckpointV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_HARNESS_V1.checkpoint;
  checkpointId: string;
  workspaceId: string;
  sessionId: string;
  documentId: string;
  threadId: string;
  turnId: string;
  runId: string;
  runRevision: number;
  status: "stopped_recoverable" | "recoverable_failed";
  eventHeadSequence: number;
  eventHeadHash: string;
  receiptIds: readonly string[];
  planHash: string;
  createdAt: string;
}>;

export type ResumeRunInputV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_HARNESS_V1.resume;
  runId: string;
  checkpointId: string;
  expectedRunRevision: number;
  idempotencyKey: string;
}>;

export type EventCursorV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_HARNESS_V1.cursor;
  runId: string;
  afterSequence: number;
  afterEventHash: string;
}>;

export type RuntimeCapabilitySnapshotV1 = Readonly<{
  contractVersion: typeof LANDING_PAGE_HARNESS_V1.capability;
  readResourceRange: Readonly<{
    state: "available";
    providerIdentity: "business-resource-registry-v1";
    observedAt: string;
  }>;
  updatePlan: Readonly<{
    state: "available";
    providerIdentity: "conversation-store-v1";
    observedAt: string;
  }>;
  canvasRead: Readonly<{
    state: "available_on_demand";
    readMode: "turn_bound_snapshot";
    providerIdentity: "canvas-studio-puck-turn-read-v1";
    observedAt: string;
  }>;
  canvasMutation:
    | Readonly<{ state: "absent"; reason: "canvas_provider_not_connected"; providerIdentity: null; observedAt: string }>
    | Readonly<{ state: "unavailable"; reason: "ux_provider_unavailable"; providerIdentity: null; observedAt: string }>
    | Readonly<{ state: "available"; reason: null; providerIdentity: string; observedAt: string }>;
}>;

export type ThreadSnapshotV1 = Readonly<{
  thread: ConversationThreadV1;
  runs: readonly AgentRunV1[];
  capabilities: RuntimeCapabilitySnapshotV1;
}>;

export type RunSnapshotV1 = Readonly<{
  run: AgentRunV1;
  thread: ConversationThreadV1;
  events: readonly PublicRuntimeEventV1[];
  capabilities: RuntimeCapabilitySnapshotV1;
}>;

export type CreateTurnInputV1 = Readonly<{
  message: string;
  requestId?: string;
  envelopeId?: string;
  workspaceId?: string;
  threadId?: string;
  sessionId?: string;
  documentId?: string;
  canvasObservation?: unknown;
}>;

export class LandingPageHarnessContractErrorV1 extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "LandingPageHarnessContractErrorV1";
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const readOptionalId = (value: unknown, field: string) => {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u.test(value)
  ) {
    throw new LandingPageHarnessContractErrorV1(
      "invalid_identity",
      `${field} is invalid.`
    );
  }
  return value;
};

export const decodeCreateTurnInputV1 = (
  value: unknown
): CreateTurnInputV1 => {
  if (!isPlainObject(value)) {
    throw new LandingPageHarnessContractErrorV1(
      "invalid_request",
      "Turn input must be a plain object."
    );
  }
  const allowed = new Set([
    "message",
    "requestId",
    "envelopeId",
    "workspaceId",
    "threadId",
    "sessionId",
    "documentId",
    "canvasObservation",
  ]);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      throw new LandingPageHarnessContractErrorV1(
        "unknown_field",
        `Turn input field ${String(key)} is not allowed.`
      );
    }
  }
  if (typeof value.message !== "string") {
    throw new LandingPageHarnessContractErrorV1(
      "invalid_message",
      "message must be a string."
    );
  }
  const message = value.message.trim();
  if (!message || message.length > LANDING_PAGE_HARNESS_LIMITS_V1.maxMessageCharacters) {
    throw new LandingPageHarnessContractErrorV1(
      "invalid_message",
      "message must contain 1-20000 characters."
    );
  }
  return {
    message,
    requestId: readOptionalId(value.requestId, "requestId"),
    envelopeId: readOptionalId(value.envelopeId, "envelopeId"),
    workspaceId: readOptionalId(value.workspaceId, "workspaceId"),
    threadId: readOptionalId(value.threadId, "threadId"),
    sessionId: readOptionalId(value.sessionId, "sessionId"),
    documentId: readOptionalId(value.documentId, "documentId"),
    canvasObservation: value.canvasObservation,
  };
};

export const createRuntimeCapabilitySnapshotV1 = (
  observedAt = new Date().toISOString()
): RuntimeCapabilitySnapshotV1 => ({
  contractVersion: LANDING_PAGE_HARNESS_V1.capability,
  readResourceRange: {
    state: "available",
    providerIdentity: "business-resource-registry-v1",
    observedAt,
  },
  updatePlan: {
    state: "available",
    providerIdentity: "conversation-store-v1",
    observedAt,
  },
  canvasRead: {
    state: "available_on_demand",
    readMode: "turn_bound_snapshot",
    providerIdentity: "canvas-studio-puck-turn-read-v1",
    observedAt,
  },
  canvasMutation: {
    state: "unavailable",
    reason: "ux_provider_unavailable",
    providerIdentity: null,
    observedAt,
  },
});

export const createToolReceiptIdV1 = (input: Omit<ToolInvocationReceiptV1, "contractVersion" | "receiptId" | "observation">) =>
  `tool-receipt-${hashCanonicalJsonV1(input)}`;

const exactKeys = {
  thread: ["contractVersion", "threadId", "workspaceId", "sessionId", "documentId", "title", "createdAt", "updatedAt", "messages"],
  message: ["contractVersion", "messageId", "workspaceId", "sessionId", "threadId", "turnId", "runId", "sequence", "role", "content", "toolCallId", "toolCalls", "createdAt"],
  turn: ["contractVersion", "turnId", "workspaceId", "sessionId", "documentId", "runId", "threadId", "triggerMessageId", "deliveredAt", "createdAt"],
  run: ["contractVersion", "runId", "workspaceId", "sessionId", "documentId", "turnId", "threadId", "triggerMessageId", "runRevision", "recoveryCheckpointId", "status", "plan", "receipts", "finalOutput", "deliveryProvenance", "errorCode", "cancellationRequested", "createdAt", "updatedAt"],
  event: ["contractVersion", "eventId", "workspaceId", "sessionId", "threadId", "turnId", "runId", "sequence", "category", "state", "callId", "publicData", "previousEventHash", "eventHash", "createdAt"],
  receipt: ["contractVersion", "receiptId", "workspaceId", "sessionId", "threadId", "turnId", "runId", "callId", "toolId", "toolVersion", "argumentsHash", "resultHash", "resultRef", "writeCertainty", "status", "retryDisposition", "observation", "createdAt"],
  capability: ["contractVersion", "readResourceRange", "updatePlan", "canvasRead", "canvasMutation"],
  checkpoint: ["contractVersion", "checkpointId", "workspaceId", "sessionId", "documentId", "threadId", "turnId", "runId", "runRevision", "status", "eventHeadSequence", "eventHeadHash", "receiptIds", "planHash", "createdAt"],
  resume: ["contractVersion", "runId", "checkpointId", "expectedRunRevision", "idempotencyKey"],
  cursor: ["contractVersion", "runId", "afterSequence", "afterEventHash"],
} as const;

const finiteInteger = (value: unknown, path: string, minimum = 0) => {
  if (!Number.isInteger(value) || (value as number) < minimum) throw new StrictJsonErrorV1("invalid_integer", path, `Expected integer >= ${minimum}.`);
  return value as number;
};
const nullableId = (value: unknown, path: string) => value === null ? null : requiredIdV1(value, path);
const nullableString = (value: unknown, path: string, maxLength?: number) => value === null ? null : requiredStringV1(value, path, maxLength);
const version = (actual: unknown, expected: string, path: string) => {
  if (actual !== expected) throw new StrictJsonErrorV1("contract_version_mismatch", path, `Expected ${expected}.`);
};

export const decodeConversationMessageV1 = (value: unknown): ConversationMessageV1 => {
  const record = strictRecordV1(value, exactKeys.message, "message");
  version(record.contractVersion, LANDING_PAGE_HARNESS_V1.message, "message.contractVersion");
  for (const key of ["messageId", "workspaceId", "sessionId", "threadId", "turnId", "runId"] as const) requiredIdV1(record[key], `message.${key}`);
  finiteInteger(record.sequence, "message.sequence", 1);
  if (!["user", "assistant", "tool"].includes(String(record.role))) throw new StrictJsonErrorV1("invalid_enum", "message.role", "Invalid role.");
  if (typeof record.content !== "string" || record.content.length > 100_000) throw new StrictJsonErrorV1("invalid_string", "message.content", "Invalid content.");
  nullableId(record.toolCallId, "message.toolCallId");
  if (!Array.isArray(record.toolCalls) || record.toolCalls.length > LANDING_PAGE_HARNESS_LIMITS_V1.maxToolCallsPerRun) throw new StrictJsonErrorV1("invalid_array", "message.toolCalls", "Invalid tool calls.");
  for (const [index, call] of record.toolCalls.entries()) {
    const item = strictRecordV1(call, ["callId", "toolId", "argumentsJson"], `message.toolCalls[${index}]`);
    requiredIdV1(item.callId, `message.toolCalls[${index}].callId`);
    requiredIdV1(item.toolId, `message.toolCalls[${index}].toolId`);
    requiredStringV1(item.argumentsJson, `message.toolCalls[${index}].argumentsJson`, 40_000);
  }
  requiredTimestampV1(record.createdAt, "message.createdAt");
  return structuredClone(record) as ConversationMessageV1;
};

export const decodeConversationThreadV1 = (value: unknown): ConversationThreadV1 => {
  const record = strictRecordV1(value, exactKeys.thread, "thread");
  version(record.contractVersion, LANDING_PAGE_HARNESS_V1.thread, "thread.contractVersion");
  for (const key of ["threadId", "workspaceId", "sessionId", "documentId"] as const) requiredIdV1(record[key], `thread.${key}`);
  requiredStringV1(record.title, "thread.title", 160);
  requiredTimestampV1(record.createdAt, "thread.createdAt");
  requiredTimestampV1(record.updatedAt, "thread.updatedAt");
  if (!Array.isArray(record.messages)) throw new StrictJsonErrorV1("invalid_array", "thread.messages", "Expected messages.");
  record.messages.forEach((message, index) => {
    const decoded = decodeConversationMessageV1(message);
    if (decoded.threadId !== record.threadId || decoded.workspaceId !== record.workspaceId || decoded.sessionId !== record.sessionId || decoded.sequence !== index + 1) throw new StrictJsonErrorV1("identity_or_sequence_mismatch", `thread.messages[${index}]`, "Message binding is invalid.");
  });
  return structuredClone(record) as ConversationThreadV1;
};

export const decodeAgentTurnV1 = (value: unknown): AgentTurnV1 => {
  const record = strictRecordV1(value, exactKeys.turn, "turn");
  version(record.contractVersion, LANDING_PAGE_HARNESS_V1.turn, "turn.contractVersion");
  for (const key of ["turnId", "workspaceId", "sessionId", "documentId", "runId", "threadId", "triggerMessageId"] as const) requiredIdV1(record[key], `turn.${key}`);
  if (record.deliveredAt !== null) requiredTimestampV1(record.deliveredAt, "turn.deliveredAt");
  requiredTimestampV1(record.createdAt, "turn.createdAt");
  return structuredClone(record) as AgentTurnV1;
};

export const decodeToolInvocationReceiptV1 = (value: unknown): ToolInvocationReceiptV1 => {
  const record = strictRecordV1(value, exactKeys.receipt, "receipt");
  version(record.contractVersion, LANDING_PAGE_HARNESS_V1.toolReceipt, "receipt.contractVersion");
  for (const key of ["receiptId", "workspaceId", "sessionId", "threadId", "turnId", "runId", "callId", "toolId"] as const) requiredIdV1(record[key], `receipt.${key}`);
  requiredStringV1(record.toolVersion, "receipt.toolVersion", 40);
  requiredHashV1(record.argumentsHash, "receipt.argumentsHash");
  requiredHashV1(record.resultHash, "receipt.resultHash");
  requiredStringV1(record.resultRef, "receipt.resultRef", 160);
  if (record.writeCertainty !== "not_applicable") throw new StrictJsonErrorV1("invalid_enum", "receipt.writeCertainty", "Generic Tool execution does not claim an external write.");
  if (!["completed", "unavailable", "denied", "schema_invalid", "transport_unknown", "failed"].includes(String(record.status))) throw new StrictJsonErrorV1("invalid_enum", "receipt.status", "Invalid status.");
  if (!["do_not_retry", "revise_input", "retry_same_call_id"].includes(String(record.retryDisposition))) throw new StrictJsonErrorV1("invalid_enum", "receipt.retryDisposition", "Invalid retry disposition.");
  if (record.status === "transport_unknown" && record.retryDisposition !== "retry_same_call_id") throw new StrictJsonErrorV1("invalid_status_tuple", "receipt", "Transport unknown requires exact retry.");
  requiredStringV1(record.observation, "receipt.observation", 100_000);
  requiredTimestampV1(record.createdAt, "receipt.createdAt");
  const expectedResultHash = hashUtf8V1(record.observation as string);
  if (record.resultHash !== expectedResultHash) throw new StrictJsonErrorV1("receipt_result_hash_mismatch", "receipt.resultHash", "Result hash does not bind observation bytes.");
  if (record.resultRef !== `tool-observation:sha256:${expectedResultHash}`) throw new StrictJsonErrorV1("receipt_result_ref_mismatch", "receipt.resultRef", "Result ref does not bind result hash.");
  const { contractVersion: _contractVersion, receiptId: _receiptId, observation: _observation, ...identityProjection } = record;
  if (record.receiptId !== createToolReceiptIdV1(identityProjection as Omit<ToolInvocationReceiptV1, "contractVersion" | "receiptId" | "observation">)) throw new StrictJsonErrorV1("receipt_identity_hash_mismatch", "receipt.receiptId", "Receipt ID does not bind its complete identity projection.");
  return structuredClone(record) as ToolInvocationReceiptV1;
};

const decodePlan = (value: unknown) => {
  if (!Array.isArray(value) || value.length > LANDING_PAGE_HARNESS_LIMITS_V1.maxPlanSteps) throw new StrictJsonErrorV1("invalid_array", "run.plan", "Invalid plan.");
  let inProgress = 0;
  const decoded = value.map((step, index) => {
    const record = strictRecordV1(step, ["stepId", "description", "status"], `run.plan[${index}]`);
    requiredIdV1(record.stepId, `run.plan[${index}].stepId`);
    requiredStringV1(record.description, `run.plan[${index}].description`, 240);
    if (!["pending", "in_progress", "completed"].includes(String(record.status))) throw new StrictJsonErrorV1("invalid_enum", `run.plan[${index}].status`, "Invalid status.");
    if (record.status === "in_progress") inProgress += 1;
    return record;
  });
  if (inProgress > 1) throw new StrictJsonErrorV1("plan_cursor_conflict", "run.plan", "At most one step may be in progress.");
  return decoded;
};

export const decodeAgentRunV1 = (value: unknown): AgentRunV1 => {
  const legacyCompatibleValue =
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !Object.prototype.hasOwnProperty.call(value, "deliveryProvenance")
      ? { ...(value as Record<string, unknown>), deliveryProvenance: null }
      : value;
  const record = strictRecordV1(legacyCompatibleValue, exactKeys.run, "run");
  version(record.contractVersion, LANDING_PAGE_HARNESS_V1.run, "run.contractVersion");
  for (const key of ["runId", "workspaceId", "sessionId", "documentId", "turnId", "threadId", "triggerMessageId"] as const) requiredIdV1(record[key], `run.${key}`);
  finiteInteger(record.runRevision, "run.runRevision", 1);
  nullableId(record.recoveryCheckpointId, "run.recoveryCheckpointId");
  if (!["queued", "running", "recovering", "completed", "awaiting_user", "stopped_recoverable", "recoverable_failed"].includes(String(record.status))) throw new StrictJsonErrorV1("invalid_enum", "run.status", "Invalid status.");
  decodePlan(record.plan);
  if (!Array.isArray(record.receipts)) throw new StrictJsonErrorV1("invalid_array", "run.receipts", "Expected receipts.");
  record.receipts.forEach((receipt, index) => {
    const decoded = decodeToolInvocationReceiptV1(receipt);
    if (decoded.runId !== record.runId || decoded.workspaceId !== record.workspaceId || decoded.sessionId !== record.sessionId || decoded.threadId !== record.threadId || decoded.turnId !== record.turnId) throw new StrictJsonErrorV1("identity_mismatch", `run.receipts[${index}]`, "Receipt binding is invalid.");
  });
  const receiptIds = (record.receipts as Array<Record<string, unknown>>).map((receipt) => receipt.receiptId);
  const receiptCallIds = (record.receipts as Array<Record<string, unknown>>).map((receipt) => receipt.callId);
  if (new Set(receiptIds).size !== receiptIds.length || new Set(receiptCallIds).size !== receiptCallIds.length) throw new StrictJsonErrorV1("duplicate_receipt", "run.receipts", "Receipts must be unique by receiptId and callId.");
  nullableString(record.finalOutput, "run.finalOutput", 100_000);
  if (record.deliveryProvenance !== null) {
    const provenance = strictRecordV1(
      record.deliveryProvenance,
      [
        "contractVersion",
        "kind",
        "evidenceReceiptCallIds",
        "terminalProposalArgumentsHash",
        "toolDescriptorFingerprint",
      ],
      "run.deliveryProvenance"
    );
    version(
      provenance.contractVersion,
      LANDING_PAGE_HARNESS_V1.deliveryProvenance,
      "run.deliveryProvenance.contractVersion"
    );
    if (
      ![
        "admitted_terminal_proposal",
        "capability_unavailable_degraded",
        "repeated_tool_failure_degraded",
      ].includes(String(provenance.kind))
    )
      throw new StrictJsonErrorV1(
        "invalid_enum",
        "run.deliveryProvenance.kind",
        "Invalid Host delivery provenance kind."
      );
    if (
      !Array.isArray(provenance.evidenceReceiptCallIds) ||
      provenance.evidenceReceiptCallIds.length < 1 ||
      provenance.evidenceReceiptCallIds.length > LANDING_PAGE_HARNESS_LIMITS_V1.maxToolCallsPerRun + 1
    )
      throw new StrictJsonErrorV1(
        "invalid_array",
        "run.deliveryProvenance.evidenceReceiptCallIds",
        "Host delivery provenance requires bounded Receipt identities."
      );
    const provenanceCallIds = provenance.evidenceReceiptCallIds.map(
      (callId, index) =>
        requiredIdV1(
          callId,
          `run.deliveryProvenance.evidenceReceiptCallIds[${index}]`
        )
    );
    if (new Set(provenanceCallIds).size !== provenanceCallIds.length)
      throw new StrictJsonErrorV1(
        "duplicate_identity",
        "run.deliveryProvenance.evidenceReceiptCallIds",
        "Host delivery provenance Receipt identities must be unique."
      );
    if (
      provenanceCallIds.some(
        (callId) => !receiptCallIds.includes(callId)
      )
    )
      throw new StrictJsonErrorV1(
        "identity_mismatch",
        "run.deliveryProvenance.evidenceReceiptCallIds",
        "Host delivery provenance must bind persisted Run Receipts."
      );
    if (provenance.terminalProposalArgumentsHash === null) {
      if (provenance.kind === "admitted_terminal_proposal")
        throw new StrictJsonErrorV1(
          "invalid_run_state_tuple",
          "run.deliveryProvenance.terminalProposalArgumentsHash",
          "Admitted terminal delivery requires its arguments hash."
        );
    } else {
      requiredHashV1(
        provenance.terminalProposalArgumentsHash,
        "run.deliveryProvenance.terminalProposalArgumentsHash"
      );
      if (provenance.kind !== "admitted_terminal_proposal")
        throw new StrictJsonErrorV1(
          "invalid_run_state_tuple",
          "run.deliveryProvenance.terminalProposalArgumentsHash",
          "Only admitted terminal delivery may bind a terminal arguments hash."
        );
    }
    requiredHashV1(
      provenance.toolDescriptorFingerprint,
      "run.deliveryProvenance.toolDescriptorFingerprint"
    );
  }
  nullableString(record.errorCode, "run.errorCode");
  if (record.errorCode !== null && !RUN_PUBLIC_ERROR_CODES_V1.includes(record.errorCode as RunPublicErrorCodeV1)) throw new StrictJsonErrorV1("invalid_enum", "run.errorCode", "Run error code is not public-safe.");
  if (typeof record.cancellationRequested !== "boolean") throw new StrictJsonErrorV1("invalid_boolean", "run.cancellationRequested", "Expected boolean.");
  requiredTimestampV1(record.createdAt, "run.createdAt");
  requiredTimestampV1(record.updatedAt, "run.updatedAt");
  if (record.status === "completed" && (typeof record.finalOutput !== "string" || !record.finalOutput.trim() || record.errorCode !== null || record.recoveryCheckpointId !== null || record.cancellationRequested !== false)) throw new StrictJsonErrorV1("invalid_run_state_tuple", "run", "Completed Run requires final output and no error/recovery/cancellation state.");
  if (record.status !== "completed" && record.deliveryProvenance !== null)
    throw new StrictJsonErrorV1("invalid_run_state_tuple", "run.deliveryProvenance", "Only a completed Run may carry Host delivery provenance.");
  if (["stopped_recoverable", "recoverable_failed", "recovering"].includes(String(record.status)) && record.recoveryCheckpointId === null) throw new StrictJsonErrorV1("invalid_run_state_tuple", "run.recoveryCheckpointId", "Recoverable Run requires a checkpoint.");
  if (["stopped_recoverable", "recoverable_failed"].includes(String(record.status)) && record.errorCode === null) throw new StrictJsonErrorV1("invalid_run_state_tuple", "run.errorCode", "Recoverable terminal requires an error code.");
  if (["queued", "running", "awaiting_user"].includes(String(record.status)) && record.recoveryCheckpointId !== null) throw new StrictJsonErrorV1("invalid_run_state_tuple", "run.recoveryCheckpointId", "Non-recovering Run cannot bind a recovery checkpoint.");
  return structuredClone(record) as AgentRunV1;
};

export const hashPublicRuntimeEventV1 = (value: Omit<PublicRuntimeEventV1, "eventHash">) => hashCanonicalJsonV1(value);

export const decodePublicRuntimeEventV1 = (value: unknown): PublicRuntimeEventV1 => {
  const record = strictRecordV1(value, exactKeys.event, "event");
  version(record.contractVersion, LANDING_PAGE_HARNESS_V1.event, "event.contractVersion");
  for (const key of ["eventId", "workspaceId", "sessionId", "threadId", "turnId", "runId"] as const) requiredIdV1(record[key], `event.${key}`);
  finiteInteger(record.sequence, "event.sequence", 1);
  if (!["run", "assistant", "plan", "tool", "capability", "delivery"].includes(String(record.category))) throw new StrictJsonErrorV1("invalid_enum", "event.category", "Invalid category.");
  requiredStringV1(record.state, "event.state", 120);
  const allowedStates: Readonly<Record<string, readonly string[]>> = {
    run: ["run_queued", "run_started", "run_recovering", "run_stopped", "run_recoverable_failed", "run_completed", "run_awaiting_user"],
    assistant: ["assistant_delta"],
    plan: ["plan_updated"],
    tool: ["tool_started", "tool_completed", "tool_failed"],
    capability: ["capability_unavailable", "capability_available"],
    delivery: ["turn_delivered"],
  };
  if (!allowedStates[String(record.category)]?.includes(String(record.state))) throw new StrictJsonErrorV1("public_event_state_not_allowed", "event.state", "Event category/state is not authorized for C5A Host.");
  nullableId(record.callId, "event.callId");
  const inspectPublic = (input: unknown, path: string): void => {
    if (typeof input === "string") {
      assertPublicSafeStringV1(input, path);
      return;
    }
    if (input === null || typeof input !== "object") return;
    if (Array.isArray(input)) { input.forEach((item, index) => inspectPublic(item, `${path}[${index}]`)); return; }
    for (const [key, item] of Object.entries(input as Record<string, unknown>)) {
      if (/(?:api.?key|secret|password|token|hidden.?reasoning|chain.?of.?thought|private.?context|raw.?tool.?output)/iu.test(key)) throw new StrictJsonErrorV1("public_event_sensitive_data", `${path}.${key}`, "Sensitive or private data is not allowed in Public Events.");
      inspectPublic(item, `${path}.${key}`);
    }
  };
  inspectPublic(record.publicData, "event.publicData");
  if (
    record.publicData === null ||
    typeof record.publicData !== "object" ||
    Array.isArray(record.publicData) ||
    Object.getPrototypeOf(record.publicData) !== Object.prototype
  ) {
    throw new StrictJsonErrorV1(
      "public_event_data_schema_invalid",
      "event.publicData",
      "Public Event data must be a plain object."
    );
  }
  const publicData = record.publicData as Record<string, unknown>;
  const publicDataKeys: Readonly<Record<string, readonly string[]>> = {
    run:
      record.state === "run_started"
        ? ["status", "modelIdentity"]
        : ["status", "errorCode", "checkpointId"],
    assistant: ["delta"],
    plan: ["steps"],
    tool: ["contractVersion", "kind", "toolId", "toolVersion", "status", "receiptId", "observation", "observationTruncated", "detailRef", "projectionHash", "eventHash"],
    capability: ["capability", "state", "reason", "providerIdentity"],
    delivery: ["messageId"],
  };
  const allowedPublicKeys = publicDataKeys[String(record.category)] || [];
  for (const key of Object.keys(publicData)) if (!allowedPublicKeys.includes(key)) throw new StrictJsonErrorV1("public_event_data_schema_invalid", `event.publicData.${key}`, "Public Event field is not allowed for this category.");
  if (
    record.category === "tool" &&
    publicData.toolId === "canvas_inspect" &&
    publicData.toolVersion === "h1-effective-facts-inspect-v1"
  ) {
    const exactH1Keys =
      publicData.contractVersion === "formal-r3-tool-public-event-v1"
        ? [
            "contractVersion",
            "kind",
            "toolId",
            "toolVersion",
            "status",
            "receiptId",
            "detailRef",
            "projectionHash",
            "eventHash",
          ]
        : record.state === "tool_started"
          ? ["toolId", "toolVersion", "status"]
          : ["toolId", "toolVersion", "status", "receiptId", "detailRef"];
    if (
      Object.keys(publicData).length !== exactH1Keys.length ||
      exactH1Keys.some((key) => !Object.hasOwn(publicData, key))
    ) {
      throw new StrictJsonErrorV1(
        "public_event_data_schema_invalid",
        "event.publicData",
        "H1 canvas_inspect events may expose only opaque completion identity."
      );
    }
  }
  if (Object.prototype.hasOwnProperty.call(publicData, "modelIdentity")) {
    requiredModelIdentityV1(
      publicData.modelIdentity,
      "event.publicData.modelIdentity"
    );
  }
  const requiredPublicKey = record.category === "assistant" ? "delta" : record.category === "plan" ? "steps" : record.category === "tool" ? "toolId" : record.category === "capability" ? "capability" : record.category === "delivery" ? "messageId" : "status";
  if (!Object.prototype.hasOwnProperty.call(publicData, requiredPublicKey)) throw new StrictJsonErrorV1("public_event_data_schema_invalid", `event.publicData.${requiredPublicKey}`, "Public Event required field is missing.");
  requiredHashV1(record.previousEventHash, "event.previousEventHash", true);
  requiredHashV1(record.eventHash, "event.eventHash");
  requiredTimestampV1(record.createdAt, "event.createdAt");
  const { eventHash, ...projection } = record;
  if (hashPublicRuntimeEventV1(projection as Omit<PublicRuntimeEventV1, "eventHash">) !== eventHash) throw new StrictJsonErrorV1("event_hash_mismatch", "event.eventHash", "Event content was modified.");
  return structuredClone(record) as PublicRuntimeEventV1;
};

export const validatePublicRuntimeEventChainV1 = (values: readonly unknown[]) => {
  let previous = "GENESIS";
  const identities = new Map<string, string>();
  let chainIdentity: string | null = null;
  return values.map((value, index) => {
    const event = decodePublicRuntimeEventV1(value);
    const currentIdentity = [event.workspaceId, event.sessionId, event.threadId, event.turnId, event.runId].join("\u0000");
    if (chainIdentity === null) chainIdentity = currentIdentity;
    else if (chainIdentity !== currentIdentity) throw new StrictJsonErrorV1("event_identity_conflict", `events[${index}]`, "Event chain identity changed.");
    const priorIdentity = identities.get(event.eventId);
    if (priorIdentity) {
      throw new StrictJsonErrorV1(
        priorIdentity === event.eventHash ? "event_duplicate" : "event_identity_conflict",
        `events[${index}].eventId`,
        "Event identity was already used."
      );
    }
    identities.set(event.eventId, event.eventHash);
    if (event.sequence !== index + 1) throw new StrictJsonErrorV1("event_sequence_gap", `events[${index}].sequence`, "Event sequence is not contiguous.");
    if (event.previousEventHash !== previous) throw new StrictJsonErrorV1("event_chain_mismatch", `events[${index}].previousEventHash`, "Event chain is invalid.");
    previous = event.eventHash;
    return event;
  });
};

export const decodeRunRecoveryCheckpointV1 = (value: unknown): RunRecoveryCheckpointV1 => {
  const record = strictRecordV1(value, exactKeys.checkpoint, "checkpoint");
  version(record.contractVersion, LANDING_PAGE_HARNESS_V1.checkpoint, "checkpoint.contractVersion");
  for (const key of ["checkpointId", "workspaceId", "sessionId", "documentId", "threadId", "turnId", "runId"] as const) requiredIdV1(record[key], `checkpoint.${key}`);
  finiteInteger(record.runRevision, "checkpoint.runRevision", 1);
  if (!["stopped_recoverable", "recoverable_failed"].includes(String(record.status))) throw new StrictJsonErrorV1("invalid_enum", "checkpoint.status", "Invalid recoverable state.");
  finiteInteger(record.eventHeadSequence, "checkpoint.eventHeadSequence", 0);
  requiredHashV1(record.eventHeadHash, "checkpoint.eventHeadHash", true);
  if ((record.eventHeadSequence === 0) !== (record.eventHeadHash === "GENESIS")) throw new StrictJsonErrorV1("checkpoint_event_head_mismatch", "checkpoint.eventHeadHash", "Event head sequence/hash pair is inconsistent.");
  if (!Array.isArray(record.receiptIds) || new Set(record.receiptIds).size !== record.receiptIds.length) throw new StrictJsonErrorV1("invalid_array", "checkpoint.receiptIds", "Receipt IDs must be unique.");
  record.receiptIds.forEach((id, index) => requiredIdV1(id, `checkpoint.receiptIds[${index}]`));
  requiredHashV1(record.planHash, "checkpoint.planHash");
  requiredTimestampV1(record.createdAt, "checkpoint.createdAt");
  return structuredClone(record) as RunRecoveryCheckpointV1;
};

export const decodeResumeRunInputV1 = (value: unknown): ResumeRunInputV1 => {
  const record = strictRecordV1(value, exactKeys.resume, "resume");
  version(record.contractVersion, LANDING_PAGE_HARNESS_V1.resume, "resume.contractVersion");
  requiredIdV1(record.runId, "resume.runId");
  requiredIdV1(record.checkpointId, "resume.checkpointId");
  finiteInteger(record.expectedRunRevision, "resume.expectedRunRevision", 1);
  requiredIdV1(record.idempotencyKey, "resume.idempotencyKey");
  return structuredClone(record) as ResumeRunInputV1;
};

export const decodeEventCursorV1 = (value: unknown): EventCursorV1 => {
  const record = strictRecordV1(value, exactKeys.cursor, "cursor");
  version(record.contractVersion, LANDING_PAGE_HARNESS_V1.cursor, "cursor.contractVersion");
  requiredIdV1(record.runId, "cursor.runId");
  finiteInteger(record.afterSequence, "cursor.afterSequence", 0);
  requiredHashV1(record.afterEventHash, "cursor.afterEventHash", true);
  return structuredClone(record) as EventCursorV1;
};

export const decodeRuntimeCapabilitySnapshotV1 = (value: unknown): RuntimeCapabilitySnapshotV1 => {
  const record = strictRecordV1(value, exactKeys.capability, "capability");
  version(record.contractVersion, LANDING_PAGE_HARNESS_V1.capability, "capability.contractVersion");
  const read = strictRecordV1(record.readResourceRange, ["state", "providerIdentity", "observedAt"], "capability.readResourceRange");
  if (read.state !== "available" || read.providerIdentity !== "business-resource-registry-v1") throw new StrictJsonErrorV1("capability_identity_invalid", "capability.readResourceRange", "Capability is invalid.");
  requiredTimestampV1(read.observedAt, "capability.readResourceRange.observedAt");
  const plan = strictRecordV1(record.updatePlan, ["state", "providerIdentity", "observedAt"], "capability.updatePlan");
  if (plan.state !== "available" || plan.providerIdentity !== "conversation-store-v1") throw new StrictJsonErrorV1("capability_identity_invalid", "capability.updatePlan", "Capability is invalid.");
  requiredTimestampV1(plan.observedAt, "capability.updatePlan.observedAt");
  const canvasRead = strictRecordV1(record.canvasRead, ["state", "readMode", "providerIdentity", "observedAt"], "capability.canvasRead");
  if (
    canvasRead.state !== "available_on_demand" ||
    canvasRead.readMode !== "turn_bound_snapshot" ||
    canvasRead.providerIdentity !== "canvas-studio-puck-turn-read-v1"
  ) throw new StrictJsonErrorV1("capability_identity_invalid", "capability.canvasRead", "Capability is invalid.");
  requiredTimestampV1(canvasRead.observedAt, "capability.canvasRead.observedAt");
  const canvas = strictRecordV1(record.canvasMutation, ["state", "reason", "providerIdentity", "observedAt"], "capability.canvasMutation");
  const canvasValid =
    (canvas.state === "absent" && canvas.reason === "canvas_provider_not_connected" && canvas.providerIdentity === null) ||
    (canvas.state === "unavailable" && canvas.reason === "ux_provider_unavailable" && canvas.providerIdentity === null) ||
    (canvas.state === "available" && canvas.reason === null && typeof canvas.providerIdentity === "string" && Boolean(canvas.providerIdentity.trim()));
  if (!canvasValid) throw new StrictJsonErrorV1("capability_identity_invalid", "capability.canvasMutation", "Capability is invalid.");
  requiredTimestampV1(canvas.observedAt, "capability.canvasMutation.observedAt");
  return structuredClone(record) as RuntimeCapabilitySnapshotV1;
};
