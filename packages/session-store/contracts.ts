import type { JsonValue } from "../model-protocol/contracts";
import type {
  NormalizedToolInvocation,
  ToolReceipt,
} from "../tool-runtime/contracts";
import { assertValidCommandTimestamp, assertValidGeneratedId } from "./run-command-contract";
import { assertPersistableJson } from "./src/sensitive-data";

export const SESSION_STORE_SCHEMA_VERSION = "meliora.session-store.v1" as const;

/**
 * A conflict is an expected concurrency or idempotency result, not an adapter
 * implementation error. Callers must branch on these codes rather than retry
 * a side effect blindly.
 */
export type SessionStoreConflictCode =
  | "event_sequence_conflict"
  | "lease_held"
  | "lease_not_held"
  | "lease_expired"
  | "run_attempt_conflict"
  | "idempotency_key_conflict"
  | "invocation_reservation_conflict"
  | "receipt_conflict"
  | "command_identity_conflict"
  | "command_status_conflict"
  | "model_step_conflict"
  | "model_step_in_progress"
  | "snapshot_sequence_conflict"
  | "terminal_model_step_result_conflict"
  | "invocation_execution_conflict"
  /** The durable record cannot prove a pre-dispatch recovery is safe. */
  | "initial_recovery_not_safe";

export type SessionStoreErrorCode =
  | SessionStoreConflictCode
  | "session_not_found"
  | "turn_not_found"
  | "run_not_found"
  | "run_attempt_not_found"
  | "run_command_not_found"
  | "artifact_not_found"
  | "recovery_bundle_too_large"
  | "recovery_bundle_incomplete"
  | "schema_version_unsupported";

export type SessionStoreFailure = Readonly<{
  code: SessionStoreErrorCode;
  message: string;
  retryable: boolean;
}>;

export type SessionRecord = Readonly<{
  schemaVersion: "meliora.session.v1";
  sessionId: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}>;

export type TurnRecord = Readonly<{
  schemaVersion: "meliora.turn.v1";
  sessionId: string;
  turnId: string;
  intentRevision: number;
  createdAt: string;
  updatedAt: string;
}>;

export type RunCommandStatus = "reserved" | "accepted" | "dispatched" | "terminal";

export type RunCommandTerminalStatus = "completed" | "blocked" | "failed" | "cancelled";

type StoredRunCommandBase = Readonly<{
  schemaVersion: "meliora.run-command.v1";
  localPrincipalId: string;
  workspaceId: string;
  idempotencyKey: string;
  canonicalRequestHash: string;
  sessionId: string;
  turnId: string;
  runId: string;
  /**
   * Immutable identity of the Attempt created with this command.  It is only
   * a command identity: Run.activeAttemptId is the sole lease/CAS authority.
   */
  initialAttemptId: string;
  /** @deprecated Compatibility alias for initialAttemptId; they are always equal. */
  attemptId: string;
  createdAt: string;
  updatedAt: string;
}>;

export type StoredRunCommand =
  | (StoredRunCommandBase & Readonly<{
      status: Exclude<RunCommandStatus, "terminal">;
      terminalStatus?: never;
      terminalCode?: never;
    }>)
  | (StoredRunCommandBase & Readonly<{
      status: "terminal";
      terminalStatus: RunCommandTerminalStatus;
      /** Stable safe code only; raw Provider or database errors are forbidden. */
      terminalCode?: string;
    }>);

/** A Turn-level private, model-visible fact that survives creation of a new Attempt. */
export type StoredPrivateUserInput = Readonly<{
  schemaVersion: "meliora.private-user-input.v1";
  sessionId: string;
  turnId: string;
  role: "user";
  visibility: "private";
  content: string;
  contentHash: string;
  createdAt: string;
}>;

export type ReserveRunCommandInput = Readonly<{
  localPrincipalId: string;
  workspaceId: string;
  idempotencyKey: string;
  canonicalRequestHash: string;
  sessionId: string;
  turnId: string;
  runId: string;
  attemptId: string;
  catalogHash: string;
  intentRevision: number;
  userMessage: string;
  reservedAt: string;
}>;

export type ReserveRunCommandResult =
  | Readonly<{ kind: "owner"; command: StoredRunCommand }>
  | Readonly<{ kind: "replay"; command: StoredRunCommand }>
  | Readonly<{
      kind: "conflict";
      code: "idempotency_key_conflict" | "command_identity_conflict";
    }>;

export type RunCommandScope = Readonly<{
  localPrincipalId: string;
  workspaceId: string;
  idempotencyKey: string;
}>;

type TransitionRunCommandBase = RunCommandScope & Readonly<{
  runId: string;
  attemptId: string;
  leaseToken: string;
  expectedStatus: RunCommandStatus;
  updatedAt: string;
}>;

export type TransitionRunCommandInput =
  | (TransitionRunCommandBase & Readonly<{
      /** `dispatched` is reserved for startModelStep's atomic checkpoint gate. */
      nextStatus: Exclude<RunCommandStatus, "terminal" | "dispatched">;
      terminalStatus?: never;
      terminalCode?: never;
    }>)
  | (TransitionRunCommandBase & Readonly<{
      nextStatus: "terminal";
      terminalStatus: RunCommandTerminalStatus;
      terminalCode?: string;
    }>);

export type TransitionRunCommandResult =
  | Readonly<{ kind: "updated"; command: StoredRunCommand }>
  | Readonly<{ kind: "replay"; command: StoredRunCommand }>
  | Readonly<{
      kind: "conflict";
      code: "command_status_conflict" | "run_attempt_conflict" | "lease_not_held" | "lease_expired";
    }>
  | Readonly<{ kind: "not_found"; code: "run_command_not_found" }>;

/**
 * A public terminal event and its durable command state form one observable
 * fact.  Adapters must either write both or write neither; callers must not
 * compose appendEvents() and transitionRunCommand() for this boundary.
 */
export type SettleRunCommandWithTerminalEventInput = RunCommandScope & Readonly<{
  runId: string;
  attemptId: string;
  leaseToken: string;
  expectedCommandStatus: Exclude<RunCommandStatus, "terminal">;
  expectedSequence: number;
  terminalStatus: RunCommandTerminalStatus;
  terminalCode?: string;
  updatedAt: string;
  terminalEvent: NewEvent;
}>;

export type SettleRunCommandWithTerminalEventResult =
  | Readonly<{ kind: "settled"; command: StoredRunCommand; event: StoredEvent }>
  | Readonly<{ kind: "replay"; command: StoredRunCommand; event: StoredEvent }>
  | Readonly<{
      kind: "conflict";
      code: "command_status_conflict" | "event_sequence_conflict" | "run_attempt_conflict" | "lease_not_held" | "lease_expired";
      currentSequence?: number;
    }>
  | Readonly<{ kind: "not_found"; code: "run_command_not_found" }>;

/**
 * Recovery must not first change Run.activeAttemptId and then try a separate
 * terminal write: an interrupted second step could hide an old `started`
 * Model Step.  This is one all-or-nothing recovery boundary.
 */
export type RecoverAndSettleRunCommandWithTerminalEventInput = RunCommandScope & Readonly<{
  runId: string;
  expectedActiveAttemptId: string;
  expectedLatestAttemptNumber: number;
  expectedCommandStatus: "dispatched";
  expectedSequence: number;
  recoveryAttempt: CreateRunAttemptInput;
  terminalCode: string;
  updatedAt: string;
  terminalEvent: NewEvent;
}>;

export type RecoverAndSettleRunCommandWithTerminalEventResult =
  | Readonly<{ kind: "settled"; command: StoredRunCommand; event: StoredEvent; attempt: PersistedRunAttempt }>
  | Readonly<{
      kind: "conflict";
      code: "command_status_conflict" | "event_sequence_conflict" | "run_attempt_conflict" | "lease_held";
      currentSequence?: number;
    }>
  | Readonly<{ kind: "not_found"; code: "run_command_not_found" }>;

/**
 * C.2a's deliberately narrow hand-off.  This is not a generic attempt
 * creation primitive: it is only valid for Attempt #1 before any Provider or
 * Host boundary can have been crossed.  It preserves the Command and prior
 * event log, creates Attempt #2 and its lease together, and gives a later
 * scheduler the sole authority to decide whether to dispatch it.
 */
export type ClaimInitialPreDispatchRunCommandForRecoveryInput = RunCommandScope & Readonly<{
  runId: string;
  /** Must equal both Command.initialAttemptId and Run.activeAttemptId. */
  expectedInitialAttemptId: string;
  expectedLatestAttemptNumber: 1;
  expectedCommandStatus: "reserved" | "accepted";
  expectedSequence: number;
  recoveryAttempt: CreateRunAttemptInput;
}>;

export type ClaimInitialPreDispatchRunCommandForRecoveryResult =
  | Readonly<{
      kind: "claimed";
      command: StoredRunCommand;
      attempt: PersistedRunAttempt;
      lease: Readonly<{ leaseToken: string; expiresAt: string }>;
    }>
  | Readonly<{
      kind: "conflict";
      code: "command_status_conflict" | "event_sequence_conflict" | "run_attempt_conflict" | "lease_held" | "initial_recovery_not_safe";
      currentSequence?: number;
    }>
  | Readonly<{ kind: "not_found"; code: "run_command_not_found" }>;

export type ReadPrivateUserInputInput = Readonly<{
  sessionId: string;
  turnId: string;
}>;

export type ModelStepStatus = "started" | "terminal" | "failed";

type StoredModelStepBase = Readonly<{
  schemaVersion: "meliora.model-step-checkpoint.v1";
  runId: string;
  attemptId: string;
  modelStepId: string;
  requestFingerprint: string;
  startedAt: string;
}>;

export type StoredModelStepCheckpoint =
  | (StoredModelStepBase & Readonly<{ status: "started"; finishedAt?: never; failureCode?: never }>)
  | (StoredModelStepBase & Readonly<{ status: "terminal"; finishedAt: string; failureCode?: never }>)
  | (StoredModelStepBase & Readonly<{ status: "failed"; finishedAt: string; failureCode: string }>);

export type StartModelStepInput = Readonly<{
  runId: string;
  attemptId: string;
  leaseToken: string;
  modelStepId: string;
  requestFingerprint: string;
  startedAt: string;
}>;

export type StartModelStepResult =
  | Readonly<{ kind: "started"; checkpoint: StoredModelStepCheckpoint }>
  | Readonly<{ kind: "replay"; checkpoint: StoredModelStepCheckpoint }>
  | Readonly<{
      kind: "conflict";
      code: "model_step_conflict" | "model_step_in_progress" | "run_attempt_conflict" | "lease_not_held" | "lease_expired";
    }>;

export type FinishModelStepInput = Readonly<{
  runId: string;
  attemptId: string;
  leaseToken: string;
  modelStepId: string;
  requestFingerprint: string;
  outcome:
    | Readonly<{ status: "terminal"; finishedAt: string }>
    | Readonly<{ status: "failed"; finishedAt: string; failureCode: string }>;
}>;

export type FinishModelStepResult =
  | Readonly<{ kind: "committed"; checkpoint: StoredModelStepCheckpoint }>
  | Readonly<{ kind: "replay"; checkpoint: StoredModelStepCheckpoint }>
  | Readonly<{
      kind: "conflict";
      code: "model_step_conflict" | "terminal_model_step_commit_required" | "run_attempt_conflict" | "lease_not_held" | "lease_expired";
    }>;

export type ReadModelStepInput = Readonly<{
  runId: string;
  modelStepId: string;
}>;

export type ReadLatestModelStepInput = Readonly<{
  runId: string;
  attemptId?: string;
}>;

/**
 * Store-owned recovery DTOs deliberately do not import Agent Runtime state.
 * The Runtime owns its state-machine projection and serializes it into
 * runtimeState; Store only guarantees durability, ordering, and lookup.
 */
export type PersistedRunRecord = Readonly<{
  schemaVersion: "meliora.persisted-run.v1";
  sessionId: string;
  turnId: string;
  runId: string;
  activeAttemptId: string;
  latestAttemptNumber: number;
  createdAt: string;
  updatedAt: string;
}>;

export type PersistedRunAttempt = Readonly<{
  schemaVersion: "meliora.persisted-run-attempt.v1";
  sessionId: string;
  turnId: string;
  runId: string;
  attemptId: string;
  attemptNumber: number;
  status: string;
  lastEventSequence: number;
  catalogHash: string;
  intentRevision: number;
  runtimeState: JsonValue;
  createdAt: string;
  updatedAt: string;
}>;

export type CreateSessionInput = Readonly<{
  sessionId: string;
  workspaceId: string;
  createdAt: string;
}>;

export type CreateTurnInput = Readonly<{
  sessionId: string;
  turnId: string;
  intentRevision: number;
  createdAt: string;
}>;

/**
 * Creating a Run creates attempt #1 atomically. Later recovery attempts use
 * createRunAttempt so a RunRecord can always name an active attempt.
 */
export type CreateRunInput = Readonly<{
  sessionId: string;
  turnId: string;
  runId: string;
  initialAttemptId: string;
  catalogHash: string;
  intentRevision: number;
  createdAt: string;
}>;

export type CreateRunAttemptInput = Readonly<{
  sessionId: string;
  turnId: string;
  runId: string;
  attemptId: string;
  expectedLatestAttemptNumber: number;
  catalogHash: string;
  intentRevision: number;
  createdAt: string;
  ownerId: string;
  ttlMs: number;
  requestedAt: string;
}>;

export type CreateRunAttemptResult =
  | Readonly<{
      kind: "created";
      attempt: PersistedRunAttempt;
      lease: Readonly<{ leaseToken: string; expiresAt: string }>;
    }>
  | Readonly<{
      kind: "conflict";
      code: "run_attempt_conflict";
      latestAttemptNumber: number;
    }>
  | Readonly<{
      kind: "conflict";
      code: "lease_held";
      latestAttemptNumber: number;
      expiresAt: string;
    }>;

export type StoredEvent = Readonly<{
  schemaVersion: "meliora.session-event.v1";
  eventId: string;
  runId: string;
  attemptId: string;
  sequence: number;
  kind: string;
  visibility: "public" | "private";
  payload: JsonValue;
  createdAt: string;
  causationId?: string;
  correlationId?: string;
}>;

/** Run and attempt ownership are bound by AppendEventsInput, never caller data. */
export type NewEvent = Omit<StoredEvent, "runId" | "attemptId" | "sequence">;

export type AppendEventsInput = Readonly<{
  runId: string;
  attemptId: string;
  expectedSequence: number;
  leaseToken: string;
  events: readonly NewEvent[];
}>;

export type AppendEventsResult =
  | Readonly<{
      kind: "appended";
      events: readonly StoredEvent[];
      lastSequence: number;
    }>
  | Readonly<{
      kind: "conflict";
      code:
        | "event_sequence_conflict"
        | "lease_not_held"
        | "lease_expired"
        | "run_attempt_conflict";
      currentSequence?: number;
    }>;

export type ReadEventsInput = Readonly<{
  runId: string;
  afterSequence?: number;
  limit: number;
}>;

export type EventPage = Readonly<{
  events: readonly StoredEvent[];
  nextSequence: number | null;
}>;

/**
 * A read-only event-log page with a Store-owned fixed watermark.  Omitting
 * `throughSequence` starts a new read and atomically captures the Run's event
 * head; every following page must carry that exact value.
 */
export type ReadEventLogPageInput = Readonly<{
  runId: string;
  afterSequence?: number;
  throughSequence?: number;
  limit: number;
}>;

export type EventLogPage =
  | Readonly<{
      kind: "found";
      events: readonly StoredEvent[];
      nextSequence: number | null;
      throughSequence: number;
    }>
  | Readonly<{ kind: "not_found"; code: "run_not_found" }>
  | Readonly<{ kind: "conflict"; code: "event_watermark_conflict" }>;

export type RunSnapshot = Readonly<{
  schemaVersion: "meliora.run-snapshot.v1";
  snapshotId: string;
  runId: string;
  attemptId: string;
  throughSequence: number;
  /** Private-only recovery state. It is never a public/SSE payload. */
  state: PrivateRunSnapshotState;
  createdAt: string;
}>;

export type PrivateArtifactRef = Readonly<{
  artifactId: string;
  contentHash: string;
  mediaType: string;
  byteLength: number;
  visibility: "private";
}>;

export const PRIVATE_RUN_SNAPSHOT_PHASES = [
  "created", "preparing", "model_streaming", "tool_assembling",
  "awaiting_approval", "executing_tools", "compacting", "verifying",
  "completed", "failed", "cancelled", "blocked",
] as const;
export type PrivateRunSnapshotPhase = typeof PRIVATE_RUN_SNAPSHOT_PHASES[number];

export type SnapshotPendingInvocationRef = Readonly<{
  invocationId: string;
  attemptId: string;
  argumentsHash: string;
  status: NormalizedToolInvocation["status"];
  toolName?: string;
  toolVersion?: string;
}>;

export type TerminalModelStepResultRef = Readonly<{
  attemptId: string;
  modelStepId: string;
  requestFingerprint: string;
  artifact: PrivateArtifactRef;
}>;

/**
 * The Store persists references, not model text, credentials, or raw outputs.
 * Runtime owns the phase vocabulary and validates referenced artifacts before
 * making them model-visible again.
 */
export type PrivateRunSnapshotState = Readonly<{
  schemaVersion: "meliora.private-run-snapshot-state.v1";
  phase: PrivateRunSnapshotPhase;
  catalogHash: string;
  intentRevision: number;
  modelHistoryArtifact: PrivateArtifactRef;
  terminalModelStepResult?: TerminalModelStepResultRef;
  pendingInvocations: readonly SnapshotPendingInvocationRef[];
  receiptRefs: readonly ToolReceipt["receiptId"][];
  verificationRefs: readonly ArtifactRef[];
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isIdentifier = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f]/u.test(value);
const isHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));
const isJsonValue = (value: unknown): boolean => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
};
const assertArtifactRef = (value: unknown, privateOnly: boolean): void => {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["artifactId", "contentHash", "mediaType", "byteLength", "visibility"])
    || !isIdentifier(value.artifactId)
    || !isHash(value.contentHash)
    || typeof value.mediaType !== "string" || value.mediaType.length === 0 || value.mediaType.length > 200
    || typeof value.byteLength !== "number" || !Number.isSafeInteger(value.byteLength) || value.byteLength < 0
    || (value.visibility !== "public" && value.visibility !== "private")
    || (privateOnly && value.visibility !== "private")) throw new TypeError("invalid_private_run_snapshot");
};
const assertPendingInvocation = (value: unknown): void => {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["invocationId", "attemptId", "argumentsHash", "status", "toolName", "toolVersion"])
    || !isIdentifier(value.invocationId) || !isIdentifier(value.attemptId)
    || !isHash(value.argumentsHash)
    || (value.toolName !== undefined && !isIdentifier(value.toolName))
    || (value.toolVersion !== undefined && !isIdentifier(value.toolVersion))
    || !["reserved", "awaiting_approval", "executing", "succeeded", "failed", "cancelled", "outcome_unknown"].includes(value.status as string)) {
    throw new TypeError("invalid_private_run_snapshot");
  }
};

export function assertPrivateRunSnapshotState(state: unknown): asserts state is PrivateRunSnapshotState {
  if (!isRecord(state)
    || !hasOnlyKeys(state, ["schemaVersion", "phase", "catalogHash", "intentRevision", "modelHistoryArtifact", "terminalModelStepResult", "pendingInvocations", "receiptRefs", "verificationRefs"])
    || state.schemaVersion !== "meliora.private-run-snapshot-state.v1"
    || !PRIVATE_RUN_SNAPSHOT_PHASES.includes(state.phase as PrivateRunSnapshotPhase)
    || !isIdentifier(state.catalogHash)
    || typeof state.intentRevision !== "number" || !Number.isSafeInteger(state.intentRevision) || state.intentRevision < 0
    || !Array.isArray(state.pendingInvocations) || !Array.isArray(state.receiptRefs) || !Array.isArray(state.verificationRefs)) {
    throw new TypeError("invalid_private_run_snapshot");
  }
  assertArtifactRef(state.modelHistoryArtifact, true);
  if (state.terminalModelStepResult !== undefined) {
    const terminal = state.terminalModelStepResult;
    if (!isRecord(terminal)
      || !hasOnlyKeys(terminal, ["attemptId", "modelStepId", "requestFingerprint", "artifact"])
      || !isIdentifier(terminal.attemptId) || !isIdentifier(terminal.modelStepId)
      || !isHash(terminal.requestFingerprint)) throw new TypeError("invalid_private_run_snapshot");
    assertArtifactRef(terminal.artifact, true);
  }
  state.pendingInvocations.forEach(assertPendingInvocation);
  if (!state.receiptRefs.every(isIdentifier)) throw new TypeError("invalid_private_run_snapshot");
  state.verificationRefs.forEach((ref) => assertArtifactRef(ref, false));
}

/**
 * Validates the complete private snapshot envelope before it crosses an
 * adapter boundary. State-only validation is insufficient: every envelope
 * string is durable data and must be subject to the same credential policy.
 */
export function assertValidRunSnapshot(snapshot: unknown): asserts snapshot is RunSnapshot {
  if (!isRecord(snapshot)
    || !hasOnlyKeys(snapshot, ["schemaVersion", "snapshotId", "runId", "attemptId", "throughSequence", "state", "createdAt"])
    || snapshot.schemaVersion !== "meliora.run-snapshot.v1") {
    throw new TypeError("invalid_run_snapshot");
  }

  // Scan before structural errors so a rejected envelope is never able to
  // bypass the sensitive-data policy by choosing an invalid generated ID.
  assertPersistableJson(snapshot as JsonValue, "snapshot");

  if (typeof snapshot.snapshotId !== "string"
    || typeof snapshot.runId !== "string"
    || typeof snapshot.attemptId !== "string"
    || typeof snapshot.createdAt !== "string"
    || typeof snapshot.throughSequence !== "number"
    || !Number.isSafeInteger(snapshot.throughSequence)
    || snapshot.throughSequence < 0) {
    throw new TypeError("invalid_run_snapshot");
  }
  assertValidGeneratedId(snapshot.snapshotId);
  assertValidGeneratedId(snapshot.runId);
  assertValidGeneratedId(snapshot.attemptId);
  assertValidCommandTimestamp(snapshot.createdAt);
  assertPrivateRunSnapshotState(snapshot.state);
}

export type WriteSnapshotInput = Readonly<{
  snapshot: RunSnapshot;
  expectedSequence: number;
  leaseToken: string;
}>;

/**
 * Fixed, private-only representation of the normalized result of one model
 * step. Raw model bytes never enter snapshots or recovery DTOs.
 */
export const PRIVATE_TERMINAL_MODEL_STEP_RESULT_MEDIA_TYPE =
  "application/vnd.meliora.model-step-result+json" as const;

export type CommitTerminalModelStepResultAndSnapshotInput = Readonly<{
  runId: string;
  attemptId: string;
  leaseToken: string;
  modelStepId: string;
  requestFingerprint: string;
  finishedAt: string;
  normalizedResult: Readonly<{
    artifactId: string;
    contentHash: string;
    content: Uint8Array;
    /** Safe, structured metadata only; visibility and media type are fixed. */
    metadata?: JsonValue;
  }>;
  snapshot: RunSnapshot;
  expectedSequence: number;
}>;

export type CommitTerminalModelStepResultAndSnapshotResult =
  | Readonly<{ kind: "committed"; checkpoint: StoredModelStepCheckpoint; artifact: PrivateArtifactRef; snapshot: RunSnapshot }>
  | Readonly<{ kind: "replay"; checkpoint: StoredModelStepCheckpoint; artifact: PrivateArtifactRef; snapshot: RunSnapshot }>
  | Readonly<{
      kind: "conflict";
      code:
        | "model_step_conflict"
        | "terminal_model_step_result_conflict"
        | "snapshot_sequence_conflict"
        | "run_attempt_conflict"
        | "lease_not_held"
        | "lease_expired";
    }>;

export type InvocationReservationInput = Readonly<{
  invocation: NormalizedToolInvocation;
  leaseToken: string;
  reservedAt: string;
}>;

export type ReservationResult =
  | Readonly<{ kind: "owner"; reservationId: string }>
  | Readonly<{
      kind: "replay";
      reservationId: string;
      invocation: NormalizedToolInvocation;
      receipt: ToolReceipt | null;
    }>
  | Readonly<{
      kind: "conflict";
      code:
        | "idempotency_key_conflict"
        | "invocation_reservation_conflict"
        | "run_attempt_conflict"
        | "lease_not_held"
        | "lease_expired";
    }>;

export type StoredInvocationReservation = Readonly<{
  reservationId: string;
  runId: string;
  attemptId: string;
  invocationId: string;
  idempotencyKey: string;
  status: NormalizedToolInvocation["status"];
  reservedAt: string;
  /** Undefined means this is a legacy record whose execution boundary is unknown. */
  executionStartedAt?: string;
}>;

/** Dormant in WP-3B.1a: Runtime must not use this execution permit until B1b. */
export type BeginInvocationExecutionInput = Readonly<{
  runId: string;
  attemptId: string;
  leaseToken: string;
  reservationId: string;
}>;

export type BeginInvocationExecutionResult =
  | Readonly<{ kind: "started"; executionStartedAt: string }>
  | Readonly<{ kind: "already_executing_or_unknown"; executionStartedAt?: string }>
  | Readonly<{ kind: "receipt_replay"; receiptId: string }>
  | Readonly<{
      kind: "conflict";
      code: "run_attempt_conflict" | "lease_not_held" | "lease_expired" | "invocation_execution_conflict";
    }>;

export type ReadInvocationInput = Readonly<{
  runId: string;
  attemptId: string;
  invocationId: string;
}>;

export type ReadReservationInput = Readonly<{
  runId: string;
  attemptId: string;
  invocationId: string;
}>;

/**
 * Recovery may inspect an invocation reserved by an earlier Attempt without
 * granting the new Attempt permission to replay or commit that side effect.
 */
export type ReadInvocationByIdempotencyKeyInput = Readonly<{
  runId: string;
  idempotencyKey: string;
}>;

export type InvocationReconciliationRecord = Readonly<{
  reservation: StoredInvocationReservation;
  invocation: NormalizedToolInvocation;
  receipt: ToolReceipt | null;
}>;

export type CommitReceiptInput = Readonly<{
  runId: string;
  attemptId: string;
  leaseToken: string;
  reservationId: string;
  receipt: ToolReceipt;
}>;

export type CommitReceiptResult =
  | Readonly<{ kind: "committed"; receiptId: string }>
  | Readonly<{ kind: "replay"; receiptId: string }>
  | Readonly<{
      kind: "conflict";
      code:
        | "lease_not_held"
        | "lease_expired"
        | "run_attempt_conflict"
        | "invocation_reservation_conflict"
        | "invocation_execution_conflict"
        | "receipt_conflict";
    }>;

/**
 * Receipt-backed public tool facts are a single durable observable boundary.
 * Adapters must write the Receipt, its public events and immutable binding in
 * one transaction, or write none of them.
 */
export type CommitReceiptWithPublicEventsInput = CommitReceiptInput & Readonly<{
  expectedSequence: number;
}>;

export type CommitReceiptWithPublicEventsResult =
  | Readonly<{ kind: "committed"; receiptId: string; events: readonly StoredEvent[] }>
  | Readonly<{ kind: "replay"; receiptId: string; events: readonly StoredEvent[] }>
  | Readonly<{ kind: "conflict"; code:
    | "lease_not_held" | "lease_expired" | "run_attempt_conflict"
    | "invocation_reservation_conflict" | "invocation_execution_conflict"
    | "receipt_conflict" | "event_sequence_conflict" | "receipt_public_event_conflict";
    currentSequence?: number }>;

/** Internal recovery proof for the immutable Receipt-to-public-event boundary. */
export type ReadReceiptPublicEventBindingInput = Readonly<{
  runId: string;
  attemptId: string;
  receiptId: string;
}>;
export type ReadReceiptPublicEventBindingResult =
  | Readonly<{ kind: "found"; events: readonly StoredEvent[] }>
  | Readonly<{ kind: "missing" }>;

export type ReadReceiptInput = Readonly<{
  runId: string;
  attemptId: string;
  receiptId: string;
}>;

export type ArtifactRef = Readonly<{
  artifactId: string;
  contentHash: string;
  mediaType: string;
  byteLength: number;
  visibility: "public" | "private";
}>;

export type Artifact = ArtifactRef & Readonly<{
  createdAt: string;
  content: Uint8Array;
  metadata?: JsonValue;
}>;

export type PutArtifactInput = Readonly<{
  artifactId: string;
  contentHash: string;
  mediaType: string;
  content: Uint8Array;
  visibility: "public" | "private";
  metadata?: JsonValue;
  createdAt: string;
}>;

/**
 * Opaque Store-only staging alias. It becomes eligible for a public event
 * only through the atomic Receipt/event binding; it is never an HTTP artifact
 * identifier in this M0 slice.
 * The Store keeps the derivative's physical identity private.
 */
export type StagedPublicArtifactManifest = Readonly<{
  artifactId: string;
  visibility: "public";
  contentHash: string;
  mediaType: "text/plain";
  byteLength: number;
  createdAt: string;
  projectionKind: "tool_result";
}>;

export type StagePublicToolResultDerivativeInput = Readonly<{
  runId: string;
  sessionId: string;
  attemptId: string;
  leaseToken: string;
  reservationId: string;
  invocationId: string;
  content: Uint8Array;
  contentHash: string;
  mediaType: "text/plain";
}>;

export type StagePublicToolResultDerivativeResult =
  | Readonly<{ kind: "staged"; manifest: StagedPublicArtifactManifest }>
  | Readonly<{ kind: "replay"; manifest: StagedPublicArtifactManifest }>
  | Readonly<{
      kind: "conflict";
      code: "run_attempt_conflict" | "lease_not_held" | "lease_expired" | "invocation_execution_conflict" | "public_artifact_provenance_conflict";
    }>;

/** Store-only staged read. It is neither SSE/HTTP output nor an authorization decision. */
export type ResolveStagedPublicArtifactInput = Readonly<{
  runId: string;
  sessionId: string;
  artifactId: string;
}>;

export type ResolveStagedPublicArtifactResult =
  | Readonly<{ kind: "found"; manifest: StagedPublicArtifactManifest }>
  | Readonly<{ kind: "not_found" }>;

/**
 * The only Store authorization proof for an alias carried by a public event.
 * It deliberately returns a manifest, never the private physical artifact or
 * its bytes.  A matching durable Receipt is required: staging alone is not a
 * public-read grant.
 */
export type AuthorizePublicArtifactRefInput = Readonly<{
  localPrincipalId: string;
  runId: string;
  sessionId: string;
  artifactId: string;
  /** Every alias authorization is tied to its canonical public event kind. */
  eventBinding:
    | Readonly<{ kind: "tool_result_presented"; invocationId: string; status: ToolReceipt["status"] }>
    | Readonly<{ kind: "verification_updated" }>;
}>;

export type AuthorizePublicArtifactRefResult =
  | Readonly<{ kind: "authorized"; manifest: StagedPublicArtifactManifest }>
  | Readonly<{ kind: "rejected" }>;

/** Server/SSE gate. Artifact-bearing events must exactly match a Receipt binding. */
export type AuthorizePublicStoredEventInput = Readonly<{
  localPrincipalId: string;
  sessionId: string;
  event: StoredEvent;
}>;
export type AuthorizePublicStoredEventResult =
  | Readonly<{ kind: "authorized" }>
  | Readonly<{ kind: "rejected" }>;

export type LeaseRequest = Readonly<{
  runId: string;
  attemptId: string;
  ownerId: string;
  ttlMs: number;
  requestedAt: string;
}>;

export type LeaseResult =
  | Readonly<{
      kind: "acquired";
      leaseToken: string;
      expiresAt: string;
    }>
  | Readonly<{
      kind: "held";
      expiresAt: string;
    }>
  | Readonly<{
      kind: "conflict";
      code: "run_attempt_conflict";
    }>;

export type LeaseRenewal = Readonly<{
  runId: string;
  attemptId: string;
  leaseToken: string;
  ttlMs: number;
  renewedAt: string;
}>;

export type RecoveryCommandCursor = Readonly<{
  createdAt: string;
  runId: string;
}>;

export type RecoveryCommandScanInput = Readonly<{
  limit: number;
  /** Exclusive immutable `(createdAt, runId)` tuple from the prior page. */
  afterCursor?: RecoveryCommandCursor;
}>;

export type RecoveryReadPort = Readonly<{
  listRecoverableCommands(input: RecoveryCommandScanInput): Promise<RecoveryCommandPage>;
  readRecoveryBundle(input: RecoveryBundleInput): Promise<RecoveryBundleResult>;
}>;

export type RecoveryCommandPage = Readonly<{
  commands: readonly RecoverableCommandRef[];
  /** Null means this complete ordered sweep reached its end. */
  nextCursor: RecoveryCommandCursor | null;
  sweepComplete: boolean;
}>;

/** Deliberately minimal scan DTO; it is not a command read API. */
export type RecoverableCommandRef = Readonly<{
  runId: string;
  initialAttemptId: string;
  status: Exclude<RunCommandStatus, "terminal">;
  createdAt: string;
}>;

export type RecoveryBundleInput = Readonly<{
  runId: string;
  expectedActiveAttemptId?: string;
  afterSequence?: number;
  eventLimit: number;
}>;

export type RecoveryBundle = Readonly<{
  command: StoredRunCommand;
  run: PersistedRunRecord;
  activeAttempt: PersistedRunAttempt;
  readActiveAttemptId: string;
  latestAttemptNumber: number;
  /** A found recovery bundle is complete; absence is recovery_bundle_incomplete. */
  privateUserInput: StoredPrivateUserInput;
  privateSnapshot: RunSnapshot | null;
  tailEvents: readonly StoredEvent[];
  effectiveAfterSequence: number;
  eventHeadSequence: number;
  tailComplete: boolean;
  nextAfterSequence: number | null;
  latestModelStep: StoredModelStepCheckpoint | null;
  /** Atomic terminal binding when one exists; raw result stays artifact-only. */
  terminalModelStepResult: TerminalModelStepResultRef | null;
  invocations: readonly InvocationReconciliationRecord[];
}>;

export type RecoveryBundleResult =
  | Readonly<{ kind: "found"; bundle: RecoveryBundle }>
  | Readonly<{ kind: "not_found"; code: "run_not_found" | "run_command_not_found" }>
  | Readonly<{ kind: "conflict"; code: "run_attempt_conflict" }>
  | Readonly<{ kind: "failure"; code: "recovery_bundle_too_large" | "recovery_bundle_incomplete" }>;

export interface SessionStorePort extends RecoveryReadPort {
  reserveRunCommand(input: ReserveRunCommandInput): Promise<ReserveRunCommandResult>;
  readRunCommand(input: RunCommandScope): Promise<StoredRunCommand | null>;
  transitionRunCommand(input: TransitionRunCommandInput): Promise<TransitionRunCommandResult>;
  settleRunCommandWithTerminalEvent(
    input: SettleRunCommandWithTerminalEventInput,
  ): Promise<SettleRunCommandWithTerminalEventResult>;
  recoverAndSettleRunCommandWithTerminalEvent(
    input: RecoverAndSettleRunCommandWithTerminalEventInput,
  ): Promise<RecoverAndSettleRunCommandWithTerminalEventResult>;
  claimInitialPreDispatchRunCommandForRecovery(
    input: ClaimInitialPreDispatchRunCommandForRecoveryInput,
  ): Promise<ClaimInitialPreDispatchRunCommandForRecoveryResult>;
  readPrivateUserInput(input: ReadPrivateUserInputInput): Promise<StoredPrivateUserInput | null>;
  startModelStep(input: StartModelStepInput): Promise<StartModelStepResult>;
  /** B1b: only deterministic failed outcomes may use this; terminal requires atomic commit. */
  finishModelStep(input: FinishModelStepInput): Promise<FinishModelStepResult>;
  commitTerminalModelStepResultAndSnapshot(
    input: CommitTerminalModelStepResultAndSnapshotInput,
  ): Promise<CommitTerminalModelStepResultAndSnapshotResult>;
  readModelStep(input: ReadModelStepInput): Promise<StoredModelStepCheckpoint | null>;
  readLatestModelStep(input: ReadLatestModelStepInput): Promise<StoredModelStepCheckpoint | null>;
  createSession(input: CreateSessionInput): Promise<SessionRecord>;
  createTurn(input: CreateTurnInput): Promise<TurnRecord>;
  createRun(input: CreateRunInput): Promise<PersistedRunRecord>;
  createRunAttempt(input: CreateRunAttemptInput): Promise<CreateRunAttemptResult>;
  appendEvents(input: AppendEventsInput): Promise<AppendEventsResult>;
  readEvents(input: ReadEventsInput): Promise<EventPage>;
  /** Internal read primitive for bounded, replayable public projections. */
  readEventLogPage(input: ReadEventLogPageInput): Promise<EventLogPage>;
  /** Legacy non-terminal checkpoint helper; terminal bindings require atomic commit. */
  writeSnapshot(input: WriteSnapshotInput): Promise<void>;
  readSnapshot(runId: string): Promise<RunSnapshot | null>;
  reserveInvocation(input: InvocationReservationInput): Promise<ReservationResult>;
  /** B1b execution permit: only `started` authorizes Host execution. */
  beginInvocationExecution(input: BeginInvocationExecutionInput): Promise<BeginInvocationExecutionResult>;
  readInvocation(input: ReadInvocationInput): Promise<NormalizedToolInvocation | null>;
  readReservation(input: ReadReservationInput): Promise<StoredInvocationReservation | null>;
  readInvocationByIdempotencyKey(
    input: ReadInvocationByIdempotencyKeyInput,
  ): Promise<InvocationReconciliationRecord | null>;
  /** New Receipts require a durable `executing` reservation; exact Receipts replay. */
  commitReceipt(input: CommitReceiptInput): Promise<CommitReceiptResult>;
  commitReceiptWithPublicEvents(
    input: CommitReceiptWithPublicEventsInput,
  ): Promise<CommitReceiptWithPublicEventsResult>;
  readReceiptPublicEventBinding(
    input: ReadReceiptPublicEventBindingInput,
  ): Promise<ReadReceiptPublicEventBindingResult>;
  readReceipt(input: ReadReceiptInput): Promise<ToolReceipt | null>;
  /** Staging remains private until authorizePublicArtifactRef proves Receipt provenance. */
  stagePublicToolResultDerivative(
    input: StagePublicToolResultDerivativeInput,
  ): Promise<StagePublicToolResultDerivativeResult>;
  resolveStagedPublicArtifact(
    input: ResolveStagedPublicArtifactInput,
  ): Promise<ResolveStagedPublicArtifactResult>;
  authorizePublicArtifactRef(
    input: AuthorizePublicArtifactRefInput,
  ): Promise<AuthorizePublicArtifactRefResult>;
  authorizePublicStoredEvent(
    input: AuthorizePublicStoredEventInput,
  ): Promise<AuthorizePublicStoredEventResult>;
  putArtifact(input: PutArtifactInput): Promise<ArtifactRef>;
  getArtifact(id: string): Promise<Artifact | null>;
  acquireLease(input: LeaseRequest): Promise<LeaseResult>;
  renewLease(input: LeaseRenewal): Promise<boolean>;
}
