import type { JsonValue } from "../model-protocol/contracts";
import type {
  NormalizedToolInvocation,
  ToolReceipt,
} from "../tool-runtime/contracts";

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
  | "snapshot_sequence_conflict";

export type SessionStoreErrorCode =
  | SessionStoreConflictCode
  | "session_not_found"
  | "turn_not_found"
  | "run_not_found"
  | "run_attempt_not_found"
  | "run_command_not_found"
  | "artifact_not_found"
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
  expectedStatus: RunCommandStatus;
  updatedAt: string;
}>;

export type TransitionRunCommandInput =
  | (TransitionRunCommandBase & Readonly<{
      nextStatus: Exclude<RunCommandStatus, "terminal">;
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
  | Readonly<{ kind: "conflict"; code: "command_status_conflict" }>
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
      code: "model_step_conflict" | "run_attempt_conflict" | "lease_not_held" | "lease_expired";
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

export type RunSnapshot = Readonly<{
  schemaVersion: "meliora.run-snapshot.v1";
  snapshotId: string;
  runId: string;
  attemptId: string;
  throughSequence: number;
  state: JsonValue;
  createdAt: string;
}>;

export type WriteSnapshotInput = Readonly<{
  snapshot: RunSnapshot;
  expectedSequence: number;
  leaseToken: string;
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
        | "receipt_conflict";
    }>;

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

export interface SessionStorePort {
  reserveRunCommand(input: ReserveRunCommandInput): Promise<ReserveRunCommandResult>;
  readRunCommand(input: RunCommandScope): Promise<StoredRunCommand | null>;
  transitionRunCommand(input: TransitionRunCommandInput): Promise<TransitionRunCommandResult>;
  readPrivateUserInput(input: ReadPrivateUserInputInput): Promise<StoredPrivateUserInput | null>;
  startModelStep(input: StartModelStepInput): Promise<StartModelStepResult>;
  finishModelStep(input: FinishModelStepInput): Promise<FinishModelStepResult>;
  readModelStep(input: ReadModelStepInput): Promise<StoredModelStepCheckpoint | null>;
  readLatestModelStep(input: ReadLatestModelStepInput): Promise<StoredModelStepCheckpoint | null>;
  createSession(input: CreateSessionInput): Promise<SessionRecord>;
  createTurn(input: CreateTurnInput): Promise<TurnRecord>;
  createRun(input: CreateRunInput): Promise<PersistedRunRecord>;
  createRunAttempt(input: CreateRunAttemptInput): Promise<CreateRunAttemptResult>;
  appendEvents(input: AppendEventsInput): Promise<AppendEventsResult>;
  readEvents(input: ReadEventsInput): Promise<EventPage>;
  writeSnapshot(input: WriteSnapshotInput): Promise<void>;
  readSnapshot(runId: string): Promise<RunSnapshot | null>;
  reserveInvocation(input: InvocationReservationInput): Promise<ReservationResult>;
  readInvocation(input: ReadInvocationInput): Promise<NormalizedToolInvocation | null>;
  readReservation(input: ReadReservationInput): Promise<StoredInvocationReservation | null>;
  readInvocationByIdempotencyKey(
    input: ReadInvocationByIdempotencyKeyInput,
  ): Promise<InvocationReconciliationRecord | null>;
  commitReceipt(input: CommitReceiptInput): Promise<CommitReceiptResult>;
  readReceipt(input: ReadReceiptInput): Promise<ToolReceipt | null>;
  putArtifact(input: PutArtifactInput): Promise<ArtifactRef>;
  getArtifact(id: string): Promise<Artifact | null>;
  acquireLease(input: LeaseRequest): Promise<LeaseResult>;
  renewLease(input: LeaseRenewal): Promise<boolean>;
}
