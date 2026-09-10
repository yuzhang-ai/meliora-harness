import { createHash } from "node:crypto";

export const CANVAS_RUNTIME_V1_CONTRACTS = {
  artifactRef: "artifact-ref-v1",
  editSession: "edit-session-v1",
  canonicalCanvasPointer: "canonical-canvas-pointer-v1",
  commandBatchEnvelope: "canvas-command-batch-envelope-v1",
  commandReceipt: "canvas-command-receipt-v1",
  journalEntry: "session-command-journal-entry-v1",
  pendingAttempt: "pending-command-attempt-v1",
  recoveryCheckpoint: "session-recovery-checkpoint-v1",
  capabilities: "canvas-capabilities-v1",
} as const;

export const CANVAS_RUNTIME_V1_JOURNAL_GENESIS = "GENESIS" as const;

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export class CanvasRuntimeContractErrorV1 extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "CanvasRuntimeContractErrorV1";
    this.code = code;
    this.path = path;
  }
}

const fail = (code: string, path: string, message: string): never => {
  throw new CanvasRuntimeContractErrorV1(code, path, message);
};

const stableJson = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return fail("non_finite_number", "$", "Canonical JSON rejects non-finite numbers.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (typeof value === "object" && value !== undefined) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return fail(
    "unsupported_canonical_value",
    "$",
    `Canonical JSON rejects values of type ${typeof value}.`
  );
};

export const canonicalJsonV1 = (value: unknown) => stableJson(value);

export const hashCanonicalV1 = (value: unknown) =>
  createHash("sha256").update(stableJson(value), "utf8").digest("hex");

type JsonRecord = Record<string, unknown>;

const record = (value: unknown, path: string): JsonRecord => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail("invalid_type", path, "Expected an object.");
  }
  return value as JsonRecord;
};

const exactKeys = (value: JsonRecord, keys: readonly string[], path: string) => {
  const allowed = new Set(keys);
  for (const key of keys) {
    if (!(key in value)) fail("missing_field", `${path}.${key}`, "Field is required.");
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail("unknown_field", `${path}.${key}`, "Field is not allowed.");
  }
};

const string = (value: unknown, path: string): string => {
  if (typeof value !== "string") fail("invalid_type", path, "Expected a string.");
  const parsed = value as string;
  if (!parsed.trim()) fail("empty_identifier", path, "Value must be non-empty.");
  return parsed;
};

const nullableString = (value: unknown, path: string): string | null =>
  value === null ? null : string(value, path);

const integer = (value: unknown, path: string, minimum: number): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    fail("invalid_integer", path, `Expected a safe integer >= ${minimum}.`);
  }
  return value as number;
};

const literal = <T extends string | boolean | null>(
  value: unknown,
  expected: T,
  path: string
): T => {
  if (value !== expected) fail("invalid_literal", path, `Expected ${JSON.stringify(expected)}.`);
  return expected;
};

const enumeration = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string
): T => {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail("invalid_enum", path, `Expected one of ${allowed.join(", ")}.`);
  }
  return value as T;
};

const sha256 = (value: unknown, path: string): string => {
  const parsed = string(value, path);
  if (!SHA256_PATTERN.test(parsed)) {
    fail("invalid_sha256", path, "Expected a lowercase SHA-256 digest.");
  }
  return parsed;
};

const timestamp = (value: unknown, path: string): string => {
  const parsed = string(value, path);
  if (Number.isNaN(Date.parse(parsed))) fail("invalid_timestamp", path, "Expected an ISO timestamp.");
  return parsed;
};

const stringArray = (value: unknown, path: string): string[] => {
  if (!Array.isArray(value)) fail("invalid_type", path, "Expected an array.");
  const parsed = value as unknown[];
  return parsed.map((item, index) => string(item, `${path}[${index}]`));
};

export type ArtifactRefV1 = {
  contractVersion: typeof CANVAS_RUNTIME_V1_CONTRACTS.artifactRef;
  artifactId: string;
  sha256: string;
  mediaType: string;
  byteLength: number;
};

export const decodeArtifactRefV1 = (value: unknown, path = "artifactRef"): ArtifactRefV1 => {
  const input = record(value, path);
  exactKeys(input, ["contractVersion", "artifactId", "sha256", "mediaType", "byteLength"], path);
  return {
    contractVersion: literal(
      input.contractVersion,
      CANVAS_RUNTIME_V1_CONTRACTS.artifactRef,
      `${path}.contractVersion`
    ),
    artifactId: string(input.artifactId, `${path}.artifactId`),
    sha256: sha256(input.sha256, `${path}.sha256`),
    mediaType: string(input.mediaType, `${path}.mediaType`),
    byteLength: integer(input.byteLength, `${path}.byteLength`, 0),
  };
};

export type EditSessionV1 = {
  contractVersion: typeof CANVAS_RUNTIME_V1_CONTRACTS.editSession;
  sessionId: string;
  workspaceId: string;
  documentId: string;
  goalRef: ArtifactRefV1;
  planRef: ArtifactRefV1 | null;
  planCursor: string | null;
  status: "active" | "completed" | "cancelled" | "blocked";
  createdAt: string;
  updatedAt: string;
};

export const decodeEditSessionV1 = (value: unknown, path = "editSession"): EditSessionV1 => {
  const input = record(value, path);
  exactKeys(
    input,
    [
      "contractVersion",
      "sessionId",
      "workspaceId",
      "documentId",
      "goalRef",
      "planRef",
      "planCursor",
      "status",
      "createdAt",
      "updatedAt",
    ],
    path
  );
  const planRef =
    input.planRef === null ? null : decodeArtifactRefV1(input.planRef, `${path}.planRef`);
  const planCursor = nullableString(input.planCursor, `${path}.planCursor`);
  if (planCursor !== null && planRef === null) {
    fail("plan_binding_mismatch", `${path}.planCursor`, "Plan cursor requires a plan ref.");
  }
  return {
    contractVersion: literal(
      input.contractVersion,
      CANVAS_RUNTIME_V1_CONTRACTS.editSession,
      `${path}.contractVersion`
    ),
    sessionId: string(input.sessionId, `${path}.sessionId`),
    workspaceId: string(input.workspaceId, `${path}.workspaceId`),
    documentId: string(input.documentId, `${path}.documentId`),
    goalRef: decodeArtifactRefV1(input.goalRef, `${path}.goalRef`),
    planRef,
    planCursor,
    status: enumeration(
      input.status,
      ["active", "completed", "cancelled", "blocked"] as const,
      `${path}.status`
    ),
    createdAt: timestamp(input.createdAt, `${path}.createdAt`),
    updatedAt: timestamp(input.updatedAt, `${path}.updatedAt`),
  };
};

export type CanonicalCanvasPointerV1 = {
  contractVersion: typeof CANVAS_RUNTIME_V1_CONTRACTS.canonicalCanvasPointer;
  documentId: string;
  schemaVersion: string;
  revision: string;
  stateFingerprint: string | null;
};

export const decodeCanonicalCanvasPointerV1 = (
  value: unknown,
  path = "canvasPointer"
): CanonicalCanvasPointerV1 => {
  const input = record(value, path);
  exactKeys(
    input,
    ["contractVersion", "documentId", "schemaVersion", "revision", "stateFingerprint"],
    path
  );
  return {
    contractVersion: literal(
      input.contractVersion,
      CANVAS_RUNTIME_V1_CONTRACTS.canonicalCanvasPointer,
      `${path}.contractVersion`
    ),
    documentId: string(input.documentId, `${path}.documentId`),
    schemaVersion: string(input.schemaVersion, `${path}.schemaVersion`),
    revision: string(input.revision, `${path}.revision`),
    stateFingerprint:
      input.stateFingerprint === null
        ? null
        : sha256(input.stateFingerprint, `${path}.stateFingerprint`),
  };
};

export type CanvasCommandBatchEnvelopeV1 = {
  contractVersion: typeof CANVAS_RUNTIME_V1_CONTRACTS.commandBatchEnvelope;
  commandVersion: string;
  workspaceId: string;
  documentId: string;
  sessionId: string;
  batchId: string;
  idempotencyKey: string;
  basedOnRevision: string;
  authorityRef: ArtifactRefV1;
  scopeRef: ArtifactRefV1;
  operationCount: number;
  commandPayloadRef: ArtifactRefV1;
  createdAt: string;
};

const COMMAND_ENVELOPE_KEYS = [
  "contractVersion",
  "commandVersion",
  "workspaceId",
  "documentId",
  "sessionId",
  "batchId",
  "idempotencyKey",
  "basedOnRevision",
  "authorityRef",
  "scopeRef",
  "operationCount",
  "commandPayloadRef",
  "createdAt",
] as const;

export const decodeCanvasCommandBatchEnvelopeV1 = (
  value: unknown,
  path = "commandEnvelope"
): CanvasCommandBatchEnvelopeV1 => {
  const input = record(value, path);
  exactKeys(input, COMMAND_ENVELOPE_KEYS, path);
  return {
    contractVersion: literal(
      input.contractVersion,
      CANVAS_RUNTIME_V1_CONTRACTS.commandBatchEnvelope,
      `${path}.contractVersion`
    ),
    commandVersion: string(input.commandVersion, `${path}.commandVersion`),
    workspaceId: string(input.workspaceId, `${path}.workspaceId`),
    documentId: string(input.documentId, `${path}.documentId`),
    sessionId: string(input.sessionId, `${path}.sessionId`),
    batchId: string(input.batchId, `${path}.batchId`),
    idempotencyKey: string(input.idempotencyKey, `${path}.idempotencyKey`),
    basedOnRevision: string(input.basedOnRevision, `${path}.basedOnRevision`),
    authorityRef: decodeArtifactRefV1(input.authorityRef, `${path}.authorityRef`),
    scopeRef: decodeArtifactRefV1(input.scopeRef, `${path}.scopeRef`),
    operationCount: integer(input.operationCount, `${path}.operationCount`, 1),
    commandPayloadRef: decodeArtifactRefV1(
      input.commandPayloadRef,
      `${path}.commandPayloadRef`
    ),
    createdAt: timestamp(input.createdAt, `${path}.createdAt`),
  };
};

export type CommandDiagnosticV1 = {
  code: string;
  path: string | null;
  message: string;
  expected: string | null;
  actual: string | null;
};

const decodeDiagnostic = (value: unknown, path: string): CommandDiagnosticV1 => {
  const input = record(value, path);
  exactKeys(input, ["code", "path", "message", "expected", "actual"], path);
  return {
    code: string(input.code, `${path}.code`),
    path: nullableString(input.path, `${path}.path`),
    message: string(input.message, `${path}.message`),
    expected: nullableString(input.expected, `${path}.expected`),
    actual: nullableString(input.actual, `${path}.actual`),
  };
};

const decodeDiagnostics = (value: unknown, path: string): CommandDiagnosticV1[] => {
  if (!Array.isArray(value)) fail("invalid_type", path, "Expected an array.");
  const parsed = value as unknown[];
  return parsed.map((item, index) => decodeDiagnostic(item, `${path}[${index}]`));
};

type ReceiptBaseV1 = {
  contractVersion: typeof CANVAS_RUNTIME_V1_CONTRACTS.commandReceipt;
  receiptId: string;
  workspaceId: string;
  documentId: string;
  sessionId: string;
  batchId: string;
  idempotencyKey: string;
  commandEnvelopeHash: string;
  basedOnRevision: string;
  appliedOperationCount: number;
  diagnostics: CommandDiagnosticV1[];
  evidenceRefs: string[];
  createdAt: string;
};

export type AppliedCanvasCommandReceiptV1 = ReceiptBaseV1 & {
  status: "applied";
  applied: true;
  beforeCanvas: CanonicalCanvasPointerV1;
  resultCanvas: CanonicalCanvasPointerV1;
  readbackSource: "adapter_readback";
  readbackVerifiedAt: string;
  undoRef: string | null;
  nodeRefMap: Record<string, string>;
};

export type RejectedCanvasCommandReceiptV1 = ReceiptBaseV1 & {
  status: "rejected";
  applied: false;
  appliedOperationCount: 0;
  currentCanvas: CanonicalCanvasPointerV1 | null;
  undoRef: null;
  errorCode: string;
  retryDisposition:
    | "revise_input"
    | "refresh_revision"
    | "retry_same_idempotency_key"
    | "do_not_retry";
};

export type CanvasCommandReceiptV1 =
  | AppliedCanvasCommandReceiptV1
  | RejectedCanvasCommandReceiptV1;

const RECEIPT_BASE_KEYS = [
  "contractVersion",
  "receiptId",
  "workspaceId",
  "documentId",
  "sessionId",
  "batchId",
  "idempotencyKey",
  "commandEnvelopeHash",
  "basedOnRevision",
  "status",
  "applied",
  "appliedOperationCount",
  "diagnostics",
  "evidenceRefs",
  "createdAt",
] as const;

const decodeReceiptBase = (input: JsonRecord, path: string): ReceiptBaseV1 => ({
  contractVersion: literal(
    input.contractVersion,
    CANVAS_RUNTIME_V1_CONTRACTS.commandReceipt,
    `${path}.contractVersion`
  ),
  receiptId: string(input.receiptId, `${path}.receiptId`),
  workspaceId: string(input.workspaceId, `${path}.workspaceId`),
  documentId: string(input.documentId, `${path}.documentId`),
  sessionId: string(input.sessionId, `${path}.sessionId`),
  batchId: string(input.batchId, `${path}.batchId`),
  idempotencyKey: string(input.idempotencyKey, `${path}.idempotencyKey`),
  commandEnvelopeHash: sha256(input.commandEnvelopeHash, `${path}.commandEnvelopeHash`),
  basedOnRevision: string(input.basedOnRevision, `${path}.basedOnRevision`),
  appliedOperationCount: integer(
    input.appliedOperationCount,
    `${path}.appliedOperationCount`,
    0
  ),
  diagnostics: decodeDiagnostics(input.diagnostics, `${path}.diagnostics`),
  evidenceRefs: stringArray(input.evidenceRefs, `${path}.evidenceRefs`),
  createdAt: timestamp(input.createdAt, `${path}.createdAt`),
});

const decodeStringMap = (value: unknown, path: string): Record<string, string> => {
  const input = record(value, path);
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(input)) {
    if (!key.trim()) fail("empty_identifier", path, "Map keys must be non-empty.");
    output[key] = string(item, `${path}.${key}`);
  }
  return output;
};

export const decodeCanvasCommandReceiptV1 = (
  value: unknown,
  path = "receipt"
): CanvasCommandReceiptV1 => {
  const input = record(value, path);
  const status = enumeration(input.status, ["applied", "rejected"] as const, `${path}.status`);
  if (status === "applied") {
    exactKeys(
      input,
      [
        ...RECEIPT_BASE_KEYS,
        "beforeCanvas",
        "resultCanvas",
        "readbackSource",
        "readbackVerifiedAt",
        "undoRef",
        "nodeRefMap",
      ],
      path
    );
    const base = decodeReceiptBase(input, path);
    const beforeCanvas = decodeCanonicalCanvasPointerV1(
      input.beforeCanvas,
      `${path}.beforeCanvas`
    );
    const resultCanvas = decodeCanonicalCanvasPointerV1(
      input.resultCanvas,
      `${path}.resultCanvas`
    );
    literal(input.applied, true, `${path}.applied`);
    if (base.appliedOperationCount < 1) {
      fail("invalid_applied_count", `${path}.appliedOperationCount`, "Applied count must be positive.");
    }
    if (beforeCanvas.revision !== base.basedOnRevision) {
      fail(
        "before_revision_mismatch",
        `${path}.beforeCanvas.revision`,
        "Before revision must equal basedOnRevision."
      );
    }
    if (resultCanvas.revision === base.basedOnRevision) {
      fail(
        "result_revision_not_advanced",
        `${path}.resultCanvas.revision`,
        "Applied receipt must advance the revision."
      );
    }
    if (
      beforeCanvas.documentId !== base.documentId ||
      resultCanvas.documentId !== base.documentId
    ) {
      fail(
        "receipt_document_mismatch",
        `${path}.resultCanvas.documentId`,
        "Canvas pointers must bind to the receipt document."
      );
    }
    return {
      ...base,
      status: "applied",
      applied: true,
      beforeCanvas,
      resultCanvas,
      readbackSource: literal(
        input.readbackSource,
        "adapter_readback",
        `${path}.readbackSource`
      ),
      readbackVerifiedAt: timestamp(
        input.readbackVerifiedAt,
        `${path}.readbackVerifiedAt`
      ),
      undoRef: nullableString(input.undoRef, `${path}.undoRef`),
      nodeRefMap: decodeStringMap(input.nodeRefMap, `${path}.nodeRefMap`),
    };
  }

  exactKeys(
    input,
    [
      ...RECEIPT_BASE_KEYS,
      "currentCanvas",
      "undoRef",
      "errorCode",
      "retryDisposition",
    ],
    path
  );
  const base = decodeReceiptBase(input, path);
  literal(input.applied, false, `${path}.applied`);
  literal(input.undoRef, null, `${path}.undoRef`);
  if (base.appliedOperationCount !== 0) {
    fail(
      "rejected_count_nonzero",
      `${path}.appliedOperationCount`,
      "Rejected receipts must record zero applied operations."
    );
  }
  const currentCanvas =
    input.currentCanvas === null
      ? null
      : decodeCanonicalCanvasPointerV1(input.currentCanvas, `${path}.currentCanvas`);
  if (currentCanvas && currentCanvas.documentId !== base.documentId) {
    fail(
      "receipt_document_mismatch",
      `${path}.currentCanvas.documentId`,
      "Current canvas must bind to the receipt document."
    );
  }
  return {
    ...base,
    status: "rejected",
    applied: false,
    appliedOperationCount: 0,
    currentCanvas,
    undoRef: null,
    errorCode: string(input.errorCode, `${path}.errorCode`),
    retryDisposition: enumeration(
      input.retryDisposition,
      [
        "revise_input",
        "refresh_revision",
        "retry_same_idempotency_key",
        "do_not_retry",
      ] as const,
      `${path}.retryDisposition`
    ),
  };
};

export type SessionCommandJournalEntryV1 = {
  contractVersion: typeof CANVAS_RUNTIME_V1_CONTRACTS.journalEntry;
  workspaceId: string;
  documentId: string;
  sessionId: string;
  sessionSequence: number;
  batchId: string;
  idempotencyKey: string;
  basedOnRevision: string;
  commandEnvelopeHash: string;
  receiptId: string;
  receiptHash: string;
  outcome: "applied" | "rejected";
  observedRevisionAfterCall: string | null;
  previousEntryHash: string;
  entryHash: string;
  createdAt: string;
};

const JOURNAL_KEYS = [
  "contractVersion",
  "workspaceId",
  "documentId",
  "sessionId",
  "sessionSequence",
  "batchId",
  "idempotencyKey",
  "basedOnRevision",
  "commandEnvelopeHash",
  "receiptId",
  "receiptHash",
  "outcome",
  "observedRevisionAfterCall",
  "previousEntryHash",
  "entryHash",
  "createdAt",
] as const;

export const decodeSessionCommandJournalEntryV1 = (
  value: unknown,
  path = "journalEntry"
): SessionCommandJournalEntryV1 => {
  const input = record(value, path);
  exactKeys(input, JOURNAL_KEYS, path);
  const previousEntryHash = string(input.previousEntryHash, `${path}.previousEntryHash`);
  if (
    previousEntryHash !== CANVAS_RUNTIME_V1_JOURNAL_GENESIS &&
    !SHA256_PATTERN.test(previousEntryHash)
  ) {
    fail(
      "invalid_sha256",
      `${path}.previousEntryHash`,
      "Expected GENESIS or a lowercase SHA-256 digest."
    );
  }
  return {
    contractVersion: literal(
      input.contractVersion,
      CANVAS_RUNTIME_V1_CONTRACTS.journalEntry,
      `${path}.contractVersion`
    ),
    workspaceId: string(input.workspaceId, `${path}.workspaceId`),
    documentId: string(input.documentId, `${path}.documentId`),
    sessionId: string(input.sessionId, `${path}.sessionId`),
    sessionSequence: integer(input.sessionSequence, `${path}.sessionSequence`, 1),
    batchId: string(input.batchId, `${path}.batchId`),
    idempotencyKey: string(input.idempotencyKey, `${path}.idempotencyKey`),
    basedOnRevision: string(input.basedOnRevision, `${path}.basedOnRevision`),
    commandEnvelopeHash: sha256(
      input.commandEnvelopeHash,
      `${path}.commandEnvelopeHash`
    ),
    receiptId: string(input.receiptId, `${path}.receiptId`),
    receiptHash: sha256(input.receiptHash, `${path}.receiptHash`),
    outcome: enumeration(input.outcome, ["applied", "rejected"] as const, `${path}.outcome`),
    observedRevisionAfterCall: nullableString(
      input.observedRevisionAfterCall,
      `${path}.observedRevisionAfterCall`
    ),
    previousEntryHash,
    entryHash: sha256(input.entryHash, `${path}.entryHash`),
    createdAt: timestamp(input.createdAt, `${path}.createdAt`),
  };
};

export type PendingCommandAttemptV1 = {
  contractVersion: typeof CANVAS_RUNTIME_V1_CONTRACTS.pendingAttempt;
  workspaceId: string;
  documentId: string;
  sessionId: string;
  batchId: string;
  idempotencyKey: string;
  commandEnvelopeHash: string;
  basedOnRevision: string;
  state: "prepared" | "dispatching" | "outcome_unknown";
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

const PENDING_KEYS = [
  "contractVersion",
  "workspaceId",
  "documentId",
  "sessionId",
  "batchId",
  "idempotencyKey",
  "commandEnvelopeHash",
  "basedOnRevision",
  "state",
  "lastErrorCode",
  "createdAt",
  "updatedAt",
] as const;

export const decodePendingCommandAttemptV1 = (
  value: unknown,
  path = "pendingAttempt"
): PendingCommandAttemptV1 => {
  const input = record(value, path);
  exactKeys(input, PENDING_KEYS, path);
  return {
    contractVersion: literal(
      input.contractVersion,
      CANVAS_RUNTIME_V1_CONTRACTS.pendingAttempt,
      `${path}.contractVersion`
    ),
    workspaceId: string(input.workspaceId, `${path}.workspaceId`),
    documentId: string(input.documentId, `${path}.documentId`),
    sessionId: string(input.sessionId, `${path}.sessionId`),
    batchId: string(input.batchId, `${path}.batchId`),
    idempotencyKey: string(input.idempotencyKey, `${path}.idempotencyKey`),
    commandEnvelopeHash: sha256(
      input.commandEnvelopeHash,
      `${path}.commandEnvelopeHash`
    ),
    basedOnRevision: string(input.basedOnRevision, `${path}.basedOnRevision`),
    state: enumeration(
      input.state,
      ["prepared", "dispatching", "outcome_unknown"] as const,
      `${path}.state`
    ),
    lastErrorCode: nullableString(input.lastErrorCode, `${path}.lastErrorCode`),
    createdAt: timestamp(input.createdAt, `${path}.createdAt`),
    updatedAt: timestamp(input.updatedAt, `${path}.updatedAt`),
  };
};

export type RecoveryDispositionV1 =
  | "continue"
  | "refresh_canvas"
  | "reconcile_pending_command";

export type SessionRecoveryCheckpointV1 = {
  contractVersion: typeof CANVAS_RUNTIME_V1_CONTRACTS.recoveryCheckpoint;
  workspaceId: string;
  documentId: string;
  sessionId: string;
  journalSequence: number;
  journalHeadHash: string;
  lastObservedCanvas: CanonicalCanvasPointerV1;
  planRef: ArtifactRefV1 | null;
  planCursor: string | null;
  lastReceiptId: string | null;
  pendingAttempt: PendingCommandAttemptV1 | null;
  recoveryDisposition: RecoveryDispositionV1;
  checkpointHash: string;
  createdAt: string;
};

const CHECKPOINT_KEYS = [
  "contractVersion",
  "workspaceId",
  "documentId",
  "sessionId",
  "journalSequence",
  "journalHeadHash",
  "lastObservedCanvas",
  "planRef",
  "planCursor",
  "lastReceiptId",
  "pendingAttempt",
  "recoveryDisposition",
  "checkpointHash",
  "createdAt",
] as const;

export const decodeSessionRecoveryCheckpointV1 = (
  value: unknown,
  path = "checkpoint"
): SessionRecoveryCheckpointV1 => {
  const input = record(value, path);
  exactKeys(input, CHECKPOINT_KEYS, path);
  const journalSequence = integer(input.journalSequence, `${path}.journalSequence`, 0);
  const journalHeadHash = string(input.journalHeadHash, `${path}.journalHeadHash`);
  if (journalSequence === 0 && journalHeadHash !== CANVAS_RUNTIME_V1_JOURNAL_GENESIS) {
    fail(
      "checkpoint_journal_mismatch",
      `${path}.journalHeadHash`,
      "An empty journal must use GENESIS."
    );
  }
  if (journalSequence > 0 && !SHA256_PATTERN.test(journalHeadHash)) {
    fail(
      "checkpoint_journal_mismatch",
      `${path}.journalHeadHash`,
      "A non-empty journal must use a SHA-256 head."
    );
  }
  const planRef =
    input.planRef === null ? null : decodeArtifactRefV1(input.planRef, `${path}.planRef`);
  const planCursor = nullableString(input.planCursor, `${path}.planCursor`);
  if (planCursor !== null && planRef === null) {
    fail("plan_binding_mismatch", `${path}.planCursor`, "Plan cursor requires a plan ref.");
  }
  const pendingAttempt =
    input.pendingAttempt === null
      ? null
      : decodePendingCommandAttemptV1(input.pendingAttempt, `${path}.pendingAttempt`);
  const workspaceId = string(input.workspaceId, `${path}.workspaceId`);
  const documentId = string(input.documentId, `${path}.documentId`);
  const sessionId = string(input.sessionId, `${path}.sessionId`);
  if (
    pendingAttempt &&
    (pendingAttempt.workspaceId !== workspaceId ||
      pendingAttempt.documentId !== documentId ||
      pendingAttempt.sessionId !== sessionId)
  ) {
    fail(
      "pending_command_binding_mismatch",
      `${path}.pendingAttempt`,
      "Pending attempt must bind to the checkpoint workspace, document, and session."
    );
  }
  const recoveryDisposition = enumeration(
    input.recoveryDisposition,
    ["continue", "refresh_canvas", "reconcile_pending_command"] as const,
    `${path}.recoveryDisposition`
  );
  if ((pendingAttempt !== null) !== (recoveryDisposition === "reconcile_pending_command")) {
    fail(
      "pending_disposition_mismatch",
      `${path}.recoveryDisposition`,
      "Pending attempts require reconcile_pending_command and vice versa."
    );
  }
  const lastReceiptId = nullableString(input.lastReceiptId, `${path}.lastReceiptId`);
  if ((journalSequence === 0) !== (lastReceiptId === null)) {
    fail(
      "checkpoint_receipt_mismatch",
      `${path}.lastReceiptId`,
      "Empty journals must not have a last receipt; non-empty journals must have one."
    );
  }
  return {
    contractVersion: literal(
      input.contractVersion,
      CANVAS_RUNTIME_V1_CONTRACTS.recoveryCheckpoint,
      `${path}.contractVersion`
    ),
    workspaceId,
    documentId,
    sessionId,
    journalSequence,
    journalHeadHash,
    lastObservedCanvas: decodeCanonicalCanvasPointerV1(
      input.lastObservedCanvas,
      `${path}.lastObservedCanvas`
    ),
    planRef,
    planCursor,
    lastReceiptId,
    pendingAttempt,
    recoveryDisposition,
    checkpointHash: sha256(input.checkpointHash, `${path}.checkpointHash`),
    createdAt: timestamp(input.createdAt, `${path}.createdAt`),
  };
};

export type CapabilityStateV1 = "supported" | "unsupported" | "unknown";

export type CanvasCapabilitiesV1 = {
  contractVersion: typeof CANVAS_RUNTIME_V1_CONTRACTS.capabilities;
  adapterId: string;
  adapterVersion: string;
  readDocument: CapabilityStateV1;
  readSelection: CapabilityStateV1;
  readNodeTree: CapabilityStateV1;
  revisionCas: CapabilityStateV1;
  atomicBatch: CapabilityStateV1;
  durableIdempotency: CapabilityStateV1;
  nativeUndo: CapabilityStateV1;
  variables: CapabilityStateV1;
  components: CapabilityStateV1;
  locateAvailableSpace: CapabilityStateV1;
  screenshot: CapabilityStateV1;
  liveChangeEvents: CapabilityStateV1;
};

const CAPABILITY_FIELDS = [
  "readDocument",
  "readSelection",
  "readNodeTree",
  "revisionCas",
  "atomicBatch",
  "durableIdempotency",
  "nativeUndo",
  "variables",
  "components",
  "locateAvailableSpace",
  "screenshot",
  "liveChangeEvents",
] as const;

export const decodeCanvasCapabilitiesV1 = (
  value: unknown,
  path = "capabilities"
): CanvasCapabilitiesV1 => {
  const input = record(value, path);
  exactKeys(input, ["contractVersion", "adapterId", "adapterVersion", ...CAPABILITY_FIELDS], path);
  const capability = (field: (typeof CAPABILITY_FIELDS)[number]) =>
    enumeration(
      input[field],
      ["supported", "unsupported", "unknown"] as const,
      `${path}.${field}`
    );
  return {
    contractVersion: literal(
      input.contractVersion,
      CANVAS_RUNTIME_V1_CONTRACTS.capabilities,
      `${path}.contractVersion`
    ),
    adapterId: string(input.adapterId, `${path}.adapterId`),
    adapterVersion: string(input.adapterVersion, `${path}.adapterVersion`),
    readDocument: capability("readDocument"),
    readSelection: capability("readSelection"),
    readNodeTree: capability("readNodeTree"),
    revisionCas: capability("revisionCas"),
    atomicBatch: capability("atomicBatch"),
    durableIdempotency: capability("durableIdempotency"),
    nativeUndo: capability("nativeUndo"),
    variables: capability("variables"),
    components: capability("components"),
    locateAvailableSpace: capability("locateAvailableSpace"),
    screenshot: capability("screenshot"),
    liveChangeEvents: capability("liveChangeEvents"),
  };
};

export type AutomaticWriteGateV1 =
  | { allowed: true; missingCapabilities: [] }
  | { allowed: false; missingCapabilities: Array<"readDocument" | "revisionCas" | "atomicBatch" | "durableIdempotency"> };

export const evaluateAutomaticWriteGateV1 = (
  capabilities: CanvasCapabilitiesV1
): AutomaticWriteGateV1 => {
  const mandatory = [
    "readDocument",
    "revisionCas",
    "atomicBatch",
    "durableIdempotency",
  ] as const;
  const missingCapabilities = mandatory.filter(
    (field) => capabilities[field] !== "supported"
  );
  return missingCapabilities.length === 0
    ? { allowed: true, missingCapabilities: [] }
    : { allowed: false, missingCapabilities };
};

export const hashCanvasCommandBatchEnvelopeV1 = (value: CanvasCommandBatchEnvelopeV1) =>
  hashCanonicalV1(value);
export const hashCanvasCommandReceiptV1 = (value: CanvasCommandReceiptV1) =>
  hashCanonicalV1(value);
export const hashPendingCommandAttemptV1 = (value: PendingCommandAttemptV1) =>
  hashCanonicalV1(value);

export const hashSessionCommandJournalEntryV1 = (value: SessionCommandJournalEntryV1) => {
  const { entryHash: _entryHash, ...payload } = value;
  return hashCanonicalV1(payload);
};

export const hashSessionRecoveryCheckpointV1 = (value: SessionRecoveryCheckpointV1) => {
  const { checkpointHash: _checkpointHash, ...payload } = value;
  return hashCanonicalV1(payload);
};

export const hashCanvasRuntimeFingerprintV1 = (input: {
  canvasFingerprint: string;
  journalHeadHash: string;
  lastReceiptId: string | null;
  planCursor: string | null;
  sessionId: string;
}) => hashCanonicalV1(input);

const receiptBindingFields = [
  "workspaceId",
  "documentId",
  "sessionId",
  "batchId",
  "idempotencyKey",
  "basedOnRevision",
] as const;

const assertReceiptBinding = (
  command: CanvasCommandBatchEnvelopeV1,
  receipt: CanvasCommandReceiptV1,
  path = "receipt"
) => {
  for (const field of receiptBindingFields) {
    if (command[field] !== receipt[field]) {
      fail(
        "batch_receipt_binding_mismatch",
        `${path}.${field}`,
        `Receipt ${field} does not match its command envelope.`
      );
    }
  }
  const envelopeHash = hashCanvasCommandBatchEnvelopeV1(command);
  if (receipt.commandEnvelopeHash !== envelopeHash) {
    fail(
      "command_envelope_hash_mismatch",
      `${path}.commandEnvelopeHash`,
      "Receipt command hash does not match its command envelope."
    );
  }
  if (receipt.status === "applied" && receipt.appliedOperationCount !== command.operationCount) {
    fail(
      "partial_application",
      `${path}.appliedOperationCount`,
      "An applied batch must apply every operation."
    );
  }
};

const pendingBindingFields = [
  "workspaceId",
  "documentId",
  "sessionId",
  "batchId",
  "idempotencyKey",
  "basedOnRevision",
] as const;

const pendingBindsCommand = (
  command: CanvasCommandBatchEnvelopeV1,
  pending: PendingCommandAttemptV1
) =>
  pendingBindingFields.every((field) => pending[field] === command[field]) &&
  pending.commandEnvelopeHash === hashCanvasCommandBatchEnvelopeV1(command);

const assertPendingCommandBinding = (
  command: CanvasCommandBatchEnvelopeV1,
  pending: PendingCommandAttemptV1,
  path = "pendingAttempt"
) => {
  for (const field of pendingBindingFields) {
    if (pending[field] !== command[field]) {
      fail(
        "pending_command_binding_mismatch",
        `${path}.${field}`,
        `Pending ${field} does not match its command envelope.`
      );
    }
  }
  if (pending.commandEnvelopeHash !== hashCanvasCommandBatchEnvelopeV1(command)) {
    fail(
      "pending_command_binding_mismatch",
      `${path}.commandEnvelopeHash`,
      "Pending command hash does not match its command envelope."
    );
  }
};

export const validateUndoCapabilityBindingV1 = (
  receipt: CanvasCommandReceiptV1,
  nativeUndo: CapabilityStateV1
) => {
  if (receipt.status === "rejected" && receipt.undoRef !== null) {
    return fail("undo_capability_mismatch", "receipt.undoRef", "Rejected receipts cannot undo.");
  }
  if (receipt.status === "applied") {
    if (nativeUndo === "supported" && receipt.undoRef === null) {
      return fail(
        "undo_capability_mismatch",
        "receipt.undoRef",
        "nativeUndo=supported requires a real undo reference."
      );
    }
    if (nativeUndo !== "supported" && receipt.undoRef !== null) {
      return fail(
        "undo_capability_mismatch",
        "receipt.undoRef",
        "Unsupported or unknown native undo must remain null."
      );
    }
  }
  return true;
};

export type IdempotencyResolutionV1 =
  | { kind: "new" }
  | { kind: "replay"; receipt: CanvasCommandReceiptV1; receiptHash: string }
  | { kind: "conflict"; errorCode: "idempotency_conflict" };

export const resolveIdempotencyV1 = (input: {
  incomingEnvelope: CanvasCommandBatchEnvelopeV1;
  existingEnvelope: CanvasCommandBatchEnvelopeV1 | null;
  existingReceipt: CanvasCommandReceiptV1 | null;
}): IdempotencyResolutionV1 => {
  if (input.existingEnvelope === null) {
    if (input.existingReceipt !== null) {
      return fail(
        "orphan_receipt",
        "existingReceipt",
        "A receipt cannot exist without its command envelope."
      );
    }
    return { kind: "new" };
  }
  const existing = input.existingEnvelope;
  const incoming = input.incomingEnvelope;
  const sameDomain =
    existing.workspaceId === incoming.workspaceId &&
    existing.documentId === incoming.documentId &&
    existing.idempotencyKey === incoming.idempotencyKey;
  if (!sameDomain) {
    return fail(
      "idempotency_lookup_domain_mismatch",
      "incomingEnvelope.idempotencyKey",
      "Existing reservation belongs to a different idempotency domain."
    );
  }
  if (hashCanvasCommandBatchEnvelopeV1(existing) !== hashCanvasCommandBatchEnvelopeV1(incoming)) {
    return { kind: "conflict", errorCode: "idempotency_conflict" };
  }
  if (input.existingReceipt === null) {
    return fail(
      "pending_attempt_required",
      "existingReceipt",
      "An unsettled exact replay must be reconciled through its pending attempt."
    );
  }
  assertReceiptBinding(existing, input.existingReceipt, "existingReceipt");
  return {
    kind: "replay",
    receipt: input.existingReceipt,
    receiptHash: hashCanvasCommandReceiptV1(input.existingReceipt),
  };
};

export const createSessionCommandJournalEntryV1 = (input: {
  sessionSequence: number;
  previousEntryHash: string;
  command: CanvasCommandBatchEnvelopeV1;
  receipt: CanvasCommandReceiptV1;
}): SessionCommandJournalEntryV1 => {
  assertReceiptBinding(input.command, input.receipt);
  const payload = {
    contractVersion: CANVAS_RUNTIME_V1_CONTRACTS.journalEntry,
    workspaceId: input.command.workspaceId,
    documentId: input.command.documentId,
    sessionId: input.command.sessionId,
    sessionSequence: integer(input.sessionSequence, "sessionSequence", 1),
    batchId: input.command.batchId,
    idempotencyKey: input.command.idempotencyKey,
    basedOnRevision: input.command.basedOnRevision,
    commandEnvelopeHash: hashCanvasCommandBatchEnvelopeV1(input.command),
    receiptId: input.receipt.receiptId,
    receiptHash: hashCanvasCommandReceiptV1(input.receipt),
    outcome: input.receipt.status,
    observedRevisionAfterCall:
      input.receipt.status === "applied"
        ? input.receipt.resultCanvas.revision
        : input.receipt.currentCanvas?.revision ?? null,
    previousEntryHash: input.previousEntryHash,
    createdAt: input.receipt.createdAt,
  } satisfies Omit<SessionCommandJournalEntryV1, "entryHash">;
  return { ...payload, entryHash: hashCanonicalV1(payload) };
};

export const createSessionRecoveryCheckpointV1 = (input: {
  workspaceId: string;
  documentId: string;
  sessionId: string;
  journal: SessionCommandJournalEntryV1[];
  lastObservedCanvas: CanonicalCanvasPointerV1;
  planRef: ArtifactRefV1 | null;
  planCursor: string | null;
  pendingAttempt: PendingCommandAttemptV1 | null;
  recoveryDisposition: RecoveryDispositionV1;
  createdAt: string;
}): SessionRecoveryCheckpointV1 => {
  const lastEntry = input.journal.at(-1) ?? null;
  const payload = {
    contractVersion: CANVAS_RUNTIME_V1_CONTRACTS.recoveryCheckpoint,
    workspaceId: string(input.workspaceId, "workspaceId"),
    documentId: string(input.documentId, "documentId"),
    sessionId: string(input.sessionId, "sessionId"),
    journalSequence: lastEntry?.sessionSequence ?? 0,
    journalHeadHash: lastEntry?.entryHash ?? CANVAS_RUNTIME_V1_JOURNAL_GENESIS,
    lastObservedCanvas: input.lastObservedCanvas,
    planRef: input.planRef,
    planCursor: input.planCursor,
    lastReceiptId: lastEntry?.receiptId ?? null,
    pendingAttempt: input.pendingAttempt,
    recoveryDisposition: input.recoveryDisposition,
    createdAt: timestamp(input.createdAt, "createdAt"),
  } satisfies Omit<SessionRecoveryCheckpointV1, "checkpointHash">;
  const checkpoint = { ...payload, checkpointHash: hashCanonicalV1(payload) };
  return decodeSessionRecoveryCheckpointV1(checkpoint);
};

export type CanvasRuntimeStoreBundleV1 = {
  workspaceId: string;
  documentId: string;
  sessionId: string;
  commandEnvelopes: CanvasCommandBatchEnvelopeV1[];
  receipts: CanvasCommandReceiptV1[];
  journal: SessionCommandJournalEntryV1[];
  checkpoint: SessionRecoveryCheckpointV1;
};

export const decodeCanvasRuntimeStoreBundleV1 = (
  value: unknown,
  path = "storeBundle"
): CanvasRuntimeStoreBundleV1 => {
  const input = record(value, path);
  exactKeys(
    input,
    [
      "workspaceId",
      "documentId",
      "sessionId",
      "commandEnvelopes",
      "receipts",
      "journal",
      "checkpoint",
    ],
    path
  );
  if (!Array.isArray(input.commandEnvelopes)) {
    fail("invalid_type", `${path}.commandEnvelopes`, "Expected an array.");
  }
  if (!Array.isArray(input.receipts)) {
    fail("invalid_type", `${path}.receipts`, "Expected an array.");
  }
  if (!Array.isArray(input.journal)) {
    fail("invalid_type", `${path}.journal`, "Expected an array.");
  }
  const bundle: CanvasRuntimeStoreBundleV1 = {
    workspaceId: string(input.workspaceId, `${path}.workspaceId`),
    documentId: string(input.documentId, `${path}.documentId`),
    sessionId: string(input.sessionId, `${path}.sessionId`),
    commandEnvelopes: (input.commandEnvelopes as unknown[]).map((item, index) =>
      decodeCanvasCommandBatchEnvelopeV1(item, `${path}.commandEnvelopes[${index}]`)
    ),
    receipts: (input.receipts as unknown[]).map((item, index) =>
      decodeCanvasCommandReceiptV1(item, `${path}.receipts[${index}]`)
    ),
    journal: (input.journal as unknown[]).map((item, index) =>
      decodeSessionCommandJournalEntryV1(item, `${path}.journal[${index}]`)
    ),
    checkpoint: decodeSessionRecoveryCheckpointV1(input.checkpoint, `${path}.checkpoint`),
  };
  const result = validateCanvasRuntimeStoreBundleV1(bundle);
  if (!result.ok) {
    const first = result.violations[0];
    fail(first.code, first.path, first.message);
  }
  return bundle;
};

export type StoreInvariantViolationV1 = {
  code: string;
  path: string;
  message: string;
};

export type StoreValidationResultV1 = {
  ok: boolean;
  violations: StoreInvariantViolationV1[];
};

export const validateCanvasRuntimeStoreBundleV1 = (
  bundle: CanvasRuntimeStoreBundleV1
): StoreValidationResultV1 => {
  const violations: StoreInvariantViolationV1[] = [];
  const add = (code: string, path: string, message: string) =>
    violations.push({ code, path, message });
  const capture = (path: string, action: () => void) => {
    try {
      action();
    } catch (error) {
      if (error instanceof CanvasRuntimeContractErrorV1) {
        add(error.code, error.path || path, error.message);
      } else {
        throw error;
      }
    }
  };

  const identity = {
    workspaceId: bundle.workspaceId,
    documentId: bundle.documentId,
    sessionId: bundle.sessionId,
  };
  const commandsByBatch = new Map<string, CanvasCommandBatchEnvelopeV1>();
  const commandsByIdempotency = new Map<string, CanvasCommandBatchEnvelopeV1>();
  for (const [index, command] of bundle.commandEnvelopes.entries()) {
    capture(`commandEnvelopes[${index}]`, () => decodeCanvasCommandBatchEnvelopeV1(command));
    for (const field of ["workspaceId", "documentId", "sessionId"] as const) {
      if (command[field] !== identity[field]) {
        add(
          "command_session_binding_mismatch",
          `commandEnvelopes[${index}].${field}`,
          `Command ${field} does not match the store session.`
        );
      }
    }
    if (commandsByBatch.has(command.batchId)) {
      add("duplicate_batch_id", `commandEnvelopes[${index}].batchId`, "Batch ID is not unique.");
    }
    if (commandsByIdempotency.has(command.idempotencyKey)) {
      add(
        "duplicate_idempotency_key",
        `commandEnvelopes[${index}].idempotencyKey`,
        "Idempotency key is not unique within the document."
      );
    }
    commandsByBatch.set(command.batchId, command);
    commandsByIdempotency.set(command.idempotencyKey, command);
  }

  const receiptsById = new Map<string, CanvasCommandReceiptV1>();
  const receiptsByBatch = new Map<string, CanvasCommandReceiptV1>();
  for (const [index, receipt] of bundle.receipts.entries()) {
    capture(`receipts[${index}]`, () => decodeCanvasCommandReceiptV1(receipt));
    if (receiptsById.has(receipt.receiptId)) {
      add("duplicate_receipt_id", `receipts[${index}].receiptId`, "Receipt ID is not unique.");
    }
    if (receiptsByBatch.has(receipt.batchId)) {
      add("duplicate_batch_receipt", `receipts[${index}].batchId`, "Batch has multiple receipts.");
    }
    receiptsById.set(receipt.receiptId, receipt);
    receiptsByBatch.set(receipt.batchId, receipt);
    const command = commandsByBatch.get(receipt.batchId);
    if (!command) {
      add("orphan_receipt", `receipts[${index}]`, "Receipt has no command envelope.");
      const commandByIdempotency = commandsByIdempotency.get(receipt.idempotencyKey);
      if (commandByIdempotency) {
        capture(`receipts[${index}]`, () =>
          assertReceiptBinding(commandByIdempotency, receipt, `receipts[${index}]`)
        );
      }
    } else {
      capture(`receipts[${index}]`, () => assertReceiptBinding(command, receipt, `receipts[${index}]`));
    }
  }

  let previousHash = CANVAS_RUNTIME_V1_JOURNAL_GENESIS as string;
  const journalBatchIds = new Set<string>();
  for (const [index, entry] of bundle.journal.entries()) {
    capture(`journal[${index}]`, () => decodeSessionCommandJournalEntryV1(entry));
    const expectedSequence = index + 1;
    if (entry.sessionSequence !== expectedSequence) {
      add(
        "journal_sequence_gap",
        `journal[${index}].sessionSequence`,
        `Expected session sequence ${expectedSequence}.`
      );
    }
    if (entry.previousEntryHash !== previousHash) {
      add(
        "journal_previous_hash_mismatch",
        `journal[${index}].previousEntryHash`,
        "Journal chain does not point to the prior entry."
      );
    }
    if (hashSessionCommandJournalEntryV1(entry) !== entry.entryHash) {
      add("journal_entry_hash_mismatch", `journal[${index}].entryHash`, "Journal entry was altered.");
    }
    for (const field of ["workspaceId", "documentId", "sessionId"] as const) {
      if (entry[field] !== identity[field]) {
        add(
          "journal_session_binding_mismatch",
          `journal[${index}].${field}`,
          `Journal ${field} does not match the store session.`
        );
      }
    }
    const command = commandsByBatch.get(entry.batchId);
    const receipt = receiptsById.get(entry.receiptId);
    if (!command) {
      add("command_envelope_missing", `journal[${index}].batchId`, "Journal command is missing.");
    } else if (
      hashCanvasCommandBatchEnvelopeV1(command) !== entry.commandEnvelopeHash ||
      command.idempotencyKey !== entry.idempotencyKey ||
      command.basedOnRevision !== entry.basedOnRevision
    ) {
      add(
        "command_envelope_hash_mismatch",
        `journal[${index}].commandEnvelopeHash`,
        "Journal command binding is invalid."
      );
    }
    if (!receipt) {
      add("receipt_missing", `journal[${index}].receiptId`, "Journal receipt is missing.");
    } else {
      if (hashCanvasCommandReceiptV1(receipt) !== entry.receiptHash) {
        add("receipt_hash_mismatch", `journal[${index}].receiptHash`, "Receipt hash is invalid.");
      }
      if (
        receipt.batchId !== entry.batchId ||
        receipt.status !== entry.outcome ||
        receipt.idempotencyKey !== entry.idempotencyKey
      ) {
        add(
          "journal_receipt_binding_mismatch",
          `journal[${index}].receiptId`,
          "Journal outcome does not match its receipt."
        );
      }
      const observed =
        receipt.status === "applied"
          ? receipt.resultCanvas.revision
          : receipt.currentCanvas?.revision ?? null;
      if (observed !== entry.observedRevisionAfterCall) {
        add(
          "journal_observed_revision_mismatch",
          `journal[${index}].observedRevisionAfterCall`,
          "Observed revision does not match the terminal receipt."
        );
      }
    }
    if (journalBatchIds.has(entry.batchId)) {
      add("duplicate_journal_batch", `journal[${index}].batchId`, "Batch was journaled twice.");
    }
    journalBatchIds.add(entry.batchId);
    previousHash = entry.entryHash;
  }

  const pending = bundle.checkpoint.pendingAttempt;
  for (const [index, command] of bundle.commandEnvelopes.entries()) {
    if (!journalBatchIds.has(command.batchId)) {
      const isPending = pending !== null && pendingBindsCommand(command, pending);
      if (!isPending) {
        add("orphan_command_envelope", `commandEnvelopes[${index}]`, "Command is neither settled nor pending.");
      }
    }
  }
  for (const [index, receipt] of bundle.receipts.entries()) {
    if (!journalBatchIds.has(receipt.batchId)) {
      add("orphan_receipt", `receipts[${index}]`, "Terminal receipt is not journaled.");
    }
  }
  if (pending) {
    capture("checkpoint.pendingAttempt", () => decodePendingCommandAttemptV1(pending));
    const command =
      commandsByBatch.get(pending.batchId) ??
      commandsByIdempotency.get(pending.idempotencyKey) ??
      null;
    if (!command) {
      add(
        "pending_command_binding_mismatch",
        "checkpoint.pendingAttempt.commandEnvelopeHash",
        "Pending attempt must bind to its exact command envelope."
      );
    } else {
      capture("checkpoint.pendingAttempt", () =>
        assertPendingCommandBinding(command, pending, "checkpoint.pendingAttempt")
      );
    }
    if (receiptsByBatch.has(pending.batchId) || journalBatchIds.has(pending.batchId)) {
      add(
        "pending_terminal_conflict",
        "checkpoint.pendingAttempt.batchId",
        "A batch cannot be pending and terminal at the same time."
      );
    }
  }

  const checkpoint = bundle.checkpoint;
  capture("checkpoint", () => decodeSessionRecoveryCheckpointV1(checkpoint));
  for (const field of ["workspaceId", "documentId", "sessionId"] as const) {
    if (checkpoint[field] !== identity[field]) {
      add(
        "checkpoint_session_binding_mismatch",
        `checkpoint.${field}`,
        `Checkpoint ${field} does not match the store session.`
      );
    }
  }
  if (checkpoint.lastObservedCanvas.documentId !== bundle.documentId) {
    add(
      "checkpoint_canvas_binding_mismatch",
      "checkpoint.lastObservedCanvas.documentId",
      "Checkpoint canvas belongs to another document."
    );
  }
  if (hashSessionRecoveryCheckpointV1(checkpoint) !== checkpoint.checkpointHash) {
    add("checkpoint_hash_mismatch", "checkpoint.checkpointHash", "Checkpoint was altered.");
  }
  const journalHead = bundle.journal.at(-1) ?? null;
  if (
    checkpoint.journalSequence !== (journalHead?.sessionSequence ?? 0) ||
    checkpoint.journalHeadHash !==
      (journalHead?.entryHash ?? CANVAS_RUNTIME_V1_JOURNAL_GENESIS) ||
    checkpoint.lastReceiptId !== (journalHead?.receiptId ?? null)
  ) {
    add(
      "checkpoint_journal_mismatch",
      "checkpoint.journalHeadHash",
      "Checkpoint does not match the session journal head."
    );
  }

  return { ok: violations.length === 0, violations };
};
