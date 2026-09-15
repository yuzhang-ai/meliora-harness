import type {
  AppendEventsInput,
  AppendEventsResult,
  Artifact,
  ArtifactRef,
  BeginInvocationExecutionInput,
  BeginInvocationExecutionResult,
  CommitReceiptInput,
  CommitReceiptResult,
  CommitReceiptWithPublicEventsInput,
  CommitReceiptWithPublicEventsResult,
  CommitTerminalModelStepResultAndSnapshotInput,
  CommitTerminalModelStepResultAndSnapshotResult,
  FinishModelStepInput,
  FinishModelStepResult,
  CreateRunAttemptInput,
  CreateRunAttemptResult,
  CreateRunInput,
  CreateSessionInput,
  CreateTurnInput,
  EventPage,
  EventLogPage,
  InvocationReservationInput,
  LeaseRenewal,
  LeaseRequest,
  LeaseResult,
  NewEvent,
  PersistedRunAttempt,
  PersistedRunRecord,
  PutArtifactInput,
  ReadLatestModelStepInput,
  ReadModelStepInput,
  ReadPrivateUserInputInput,
  ReadEventsInput,
  ReadEventLogPageInput,
  ReadInvocationInput,
  ReadInvocationByIdempotencyKeyInput,
  ReadReceiptInput,
  ReadReceiptPublicEventBindingInput,
  ReadReceiptPublicEventBindingResult,
  ReadReservationInput,
  RecoveryBundle,
  RecoveryBundleInput,
  RecoveryBundleResult,
  RecoveryCommandPage,
  RecoveryCommandScanInput,
  RecoverAndSettleRunCommandWithTerminalEventInput,
  RecoverAndSettleRunCommandWithTerminalEventResult,
  ClaimInitialPreDispatchRunCommandForRecoveryInput,
  ClaimInitialPreDispatchRunCommandForRecoveryResult,
  ReclaimInitialPreDispatchExecutionAuthorityInput,
  ReclaimInitialPreDispatchExecutionAuthorityResult,
  RecoverableCommandRef,
  ReservationResult,
  ReserveRunCommandInput,
  ReserveRunCommandResult,
  RunCommandScope,
  RunCommandStatus,
  RunSnapshot,
  SessionRecord,
  SessionStorePort,
  SettleRunCommandWithTerminalEventInput,
  SettleRunCommandWithTerminalEventResult,
  StoredEvent,
  StoredInvocationReservation,
  StoredModelStepCheckpoint,
  StoredPrivateUserInput,
  StoredRunCommand,
  StartModelStepInput,
  StartModelStepResult,
  TransitionRunCommandInput,
  TransitionRunCommandResult,
  TurnRecord,
  WriteSnapshotInput,
  InvocationReconciliationRecord,
  PrivateArtifactRef,
  TerminalModelStepResultRef,
  StagePublicToolResultDerivativeInput,
  StagePublicToolResultDerivativeResult,
  ResolveStagedPublicArtifactInput,
  ResolveStagedPublicArtifactResult,
  StagedPublicArtifactManifest,
  AuthorizePublicArtifactRefInput,
  AuthorizePublicArtifactRefResult,
  AuthorizePublicStoredEventInput,
  AuthorizePublicStoredEventResult,
} from "./contracts";
import { randomUUID } from "node:crypto";
import { assertValidRunSnapshot, PRIVATE_TERMINAL_MODEL_STEP_RESULT_MEDIA_TYPE } from "./contracts";
import type { NormalizedToolInvocation, ToolReceipt } from "../tool-runtime/contracts";
import type { JsonValue } from "../model-protocol/contracts";
import {
  assertPersistableNewEvent,
  assertValidCommandTimestamp,
  assertValidGeneratedId,
  assertValidIdempotencyKey,
  assertValidLocalPrincipalId,
  assertValidModelStepFingerprint,
  assertValidReserveRunCommandInput,
  assertValidSafeCode,
  assertValidWorkspaceId,
  canTransitionRunCommand,
  canonicalRunCommandRequestHash,
  privateUserInputContentHash,
} from "./run-command-contract";
import { assertPersistableBytes, assertPersistableJson, assertPersistableText } from "./src/sensitive-data";
import { canonicalJson, hashBytes } from "./src/integrity";

type Lease = Readonly<{ token: string; ownerId: string; expiresAt: string }>;

const RECOVERY_TERMINAL_EVENT_KEYS = new Set([
  "schemaVersion", "eventId", "kind", "visibility", "payload", "createdAt",
]);
const INITIAL_PRE_DISPATCH_STATUSES = ["preparing", "model_streaming"] as const;

/**
 * The only public log prefix the current ReadOnlyRunLoop can write after a
 * Command becomes accepted but before it calls startModelStep().  Treat every
 * other event as evidence we cannot prove the Provider boundary was not
 * crossed.  A reserved Command has not entered the loop, so it has no prefix.
 */
const hasOnlyInitialPreDispatchPrefix = (
  events: readonly StoredEvent[],
  runId: string,
  attemptId: string | readonly string[],
  commandStatus: "reserved" | "accepted",
  expectedSequence: number,
): boolean => {
  if (events.length !== expectedSequence || events.length > INITIAL_PRE_DISPATCH_STATUSES.length) return false;
  if (commandStatus === "reserved" && events.length !== 0) return false;
  let enteredRecoveryAttempt = false;
  return events.every((event, index) => {
    const payload = event.payload;
    return event.schemaVersion === "meliora.session-event.v1"
      && event.runId === runId
      && (typeof attemptId === "string"
        ? event.attemptId === attemptId
        : event.attemptId === attemptId[1]
          ? (enteredRecoveryAttempt = true)
          : event.attemptId === attemptId[0] && !enteredRecoveryAttempt)
      && event.sequence === index + 1
      && event.kind === "run_status_changed"
      && event.visibility === "public"
      && event.causationId === undefined
      && event.correlationId === undefined
      && typeof payload === "object"
      && payload !== null
      && !Array.isArray(payload)
      && Object.keys(payload).length === 1
      && (payload as { status?: unknown }).status === INITIAL_PRE_DISPATCH_STATUSES[index];
  });
};
const continuationForPrefix = (sequence: number) => sequence === 0
  ? { status: "created" as const, sequence: 0 as const }
  : sequence === 1
    ? { status: "preparing" as const, sequence: 1 as const }
    : { status: "model_streaming" as const, sequence: 2 as const };
const toStoredEvent = (event: NewEvent, runId: string, attemptId: string, sequence: number): StoredEvent => ({
  schemaVersion: event.schemaVersion,
  eventId: event.eventId,
  runId,
  attemptId,
  sequence,
  kind: event.kind,
  visibility: event.visibility,
  payload: event.payload,
  createdAt: event.createdAt,
  ...(event.causationId === undefined ? {} : { causationId: event.causationId }),
  ...(event.correlationId === undefined ? {} : { correlationId: event.correlationId }),
});

type MemorySessionStoreOptions = Readonly<{
  clock?: () => Date;
  nextLeaseToken?: () => string;
  nextReservationId?: () => string;
  /** Test-only hooks. Public aliases and private physical IDs have separate nonce sources. */
  nextPublicArtifactAliasNonce?: () => string;
  nextPublicArtifactPhysicalNonce?: () => string;
  /** Test-only adapter hook; validates atomic rollback without changing the Port. */
  onAtomicTerminalWrite?: (stage: "artifact" | "checkpoint" | "terminal_result" | "snapshot") => void;
  /** Test-only adapter hook; validates Receipt/event all-or-nothing writes. */
  onReceiptPublicEventWrite?: (stage: "receipt" | "event" | "binding" | "invocation" | "attempt") => void;
  /** Test-only recovery boundary preflight; hooks run before its no-await commit. */
  onRecoveryAtomicWrite?: (stage: "attempt" | "lease" | "event" | "command" | "takeover_attempt" | "takeover_lease" | "takeover_run") => void;
}>;

type StagedPublicArtifactProvenance = Readonly<{
  manifest: StagedPublicArtifactManifest;
  physicalArtifactId: string;
  runId: string;
  sessionId: string;
  originAttemptId: string;
  originInvocationId: string;
  reservationId: string;
}>;
type ReceiptPublicEventBinding = Readonly<{
  receiptId: string;
  expectedSequence: number;
  events: readonly StoredEvent[];
}>;

const attemptKey = (runId: string, attemptId: string) => `${runId}\u0000${attemptId}`;
const invocationKey = (runId: string, attemptId: string, invocationId: string) =>
  `${runId}\u0000${attemptId}\u0000${invocationId}`;
const receiptKey = (runId: string, attemptId: string, receiptId: string) =>
  `${runId}\u0000${attemptId}\u0000${receiptId}`;
const commandScopeKey = (scope: RunCommandScope) =>
  `${scope.localPrincipalId}\u0000${scope.workspaceId}\u0000${scope.idempotencyKey}`;
const modelStepKey = (runId: string, modelStepId: string) => `${runId}\u0000${modelStepId}`;
const stagedPublicArtifactOriginKey = (runId: string, attemptId: string, invocationId: string) =>
  `${runId}\u0000${attemptId}\u0000${invocationId}\u0000tool_result`;
const sameDocument = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const deepCopy = <T>(value: T): T => structuredClone(value);
const sameInvocationRequest = (
  left: NormalizedToolInvocation,
  right: NormalizedToolInvocation,
) =>
  left.invocationId === right.invocationId &&
  left.runId === right.runId &&
  left.attemptId === right.attemptId &&
  left.toolName === right.toolName &&
  left.toolVersion === right.toolVersion &&
  left.argumentsHash === right.argumentsHash &&
  left.catalogHash === right.catalogHash &&
  left.idempotencyKey === right.idempotencyKey &&
  sameDocument(left.arguments, right.arguments);

/**
 * A deliberately small in-memory adapter used only by contract tests. It
 * models the durable Store invariants without committing Meliora to SQLite.
 */
export class MemorySessionStore implements SessionStorePort {
  private readonly commands = new Map<string, StoredRunCommand>();
  private readonly commandScopeByRunId = new Map<string, string>();
  private readonly privateUserInputs = new Map<string, StoredPrivateUserInput>();
  private readonly modelSteps = new Map<string, StoredModelStepCheckpoint>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly turns = new Map<string, TurnRecord>();
  private readonly runs = new Map<string, PersistedRunRecord>();
  private readonly attempts = new Map<string, PersistedRunAttempt>();
  private readonly events = new Map<string, StoredEvent[]>();
  private readonly snapshots = new Map<string, RunSnapshot>();
  private readonly terminalSnapshotHistory = new Map<string, Readonly<{ snapshot: RunSnapshot; commitOrdinal: number }>>();
  private readonly terminalModelStepResults = new Map<string, TerminalModelStepResultRef & Readonly<{ snapshotId: string; commitOrdinal: number; throughSequence: number; stateHash: string; snapshotEnvelopeHash: string; finishedAt: string }>>();
  private readonly invocations = new Map<string, NormalizedToolInvocation>();
  private readonly reservations = new Map<string, StoredInvocationReservation>();
  private readonly reservationByRunIdempotencyKey = new Map<string, string>();
  private readonly receipts = new Map<string, ToolReceipt>();
  private readonly receiptByReservation = new Map<string, string>();
  private readonly receiptPublicEventBindings = new Map<string, ReceiptPublicEventBinding>();
  private readonly artifacts = new Map<string, Artifact>();
  private readonly stagedPublicArtifacts = new Map<string, StagedPublicArtifactProvenance>();
  private readonly stagedPublicArtifactAliasByOrigin = new Map<string, string>();
  private readonly stagedPublicArtifactAliasByPhysicalId = new Map<string, string>();
  private readonly leases = new Map<string, Lease>();
  private leaseSequence = 0;
  private reservationSequence = 0;

  private readonly clock: () => Date;
  private readonly nextLeaseToken: () => string;
  private readonly nextReservationId: () => string;
  private readonly nextPublicArtifactAliasNonce: () => string;
  private readonly nextPublicArtifactPhysicalNonce: () => string;
  private readonly onReceiptPublicEventWrite?: MemorySessionStoreOptions["onReceiptPublicEventWrite"];
  private readonly onAtomicTerminalWrite?: MemorySessionStoreOptions["onAtomicTerminalWrite"];
  private readonly onRecoveryAtomicWrite?: MemorySessionStoreOptions["onRecoveryAtomicWrite"];

  constructor(options: MemorySessionStoreOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.nextLeaseToken = options.nextLeaseToken ?? (() => `lease-${++this.leaseSequence}`);
    this.nextReservationId = options.nextReservationId ?? (() => `reservation-${++this.reservationSequence}`);
    this.nextPublicArtifactAliasNonce = options.nextPublicArtifactAliasNonce ?? (() => randomUUID());
    this.nextPublicArtifactPhysicalNonce = options.nextPublicArtifactPhysicalNonce ?? (() => randomUUID());
    this.onReceiptPublicEventWrite = options.onReceiptPublicEventWrite;
    this.onAtomicTerminalWrite = options.onAtomicTerminalWrite;
    this.onRecoveryAtomicWrite = options.onRecoveryAtomicWrite;
  }

  async reserveRunCommand(input: ReserveRunCommandInput): Promise<ReserveRunCommandResult> {
    assertValidReserveRunCommandInput(input);
    const scopeKey = commandScopeKey(input);
    const existing = this.commands.get(scopeKey);
    if (existing) {
      return existing.canonicalRequestHash === input.canonicalRequestHash
        ? { kind: "replay", command: existing }
        : { kind: "conflict", code: "idempotency_key_conflict" };
    }

    // A new scope owns new stable IDs. Check every collision before mutating a Map.
    if (
      this.sessions.has(input.sessionId)
      || this.turns.has(input.turnId)
      || this.runs.has(input.runId)
      || [...this.attempts.values()].some((attempt) => attempt.attemptId === input.attemptId)
      || this.privateUserInputs.has(input.turnId)
      || this.commandScopeByRunId.has(input.runId)
    ) {
      return { kind: "conflict", code: "command_identity_conflict" };
    }

    const command: StoredRunCommand = {
      schemaVersion: "meliora.run-command.v1",
      localPrincipalId: input.localPrincipalId,
      workspaceId: input.workspaceId,
      idempotencyKey: input.idempotencyKey,
      canonicalRequestHash: input.canonicalRequestHash,
      sessionId: input.sessionId,
      turnId: input.turnId,
      runId: input.runId,
      initialAttemptId: input.attemptId,
      attemptId: input.attemptId,
      status: "reserved",
      createdAt: input.reservedAt,
      updatedAt: input.reservedAt,
    };
    const privateUserInput: StoredPrivateUserInput = {
      schemaVersion: "meliora.private-user-input.v1",
      sessionId: input.sessionId,
      turnId: input.turnId,
      role: "user",
      visibility: "private",
      content: input.userMessage,
      contentHash: privateUserInputContentHash(input.userMessage),
      createdAt: input.reservedAt,
    };
    const session: SessionRecord = {
      schemaVersion: "meliora.session.v1",
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      createdAt: input.reservedAt,
      updatedAt: input.reservedAt,
    };
    const turn: TurnRecord = {
      schemaVersion: "meliora.turn.v1",
      sessionId: input.sessionId,
      turnId: input.turnId,
      intentRevision: input.intentRevision,
      createdAt: input.reservedAt,
      updatedAt: input.reservedAt,
    };
    const run: PersistedRunRecord = {
      schemaVersion: "meliora.persisted-run.v1",
      sessionId: input.sessionId,
      turnId: input.turnId,
      runId: input.runId,
      activeAttemptId: input.attemptId,
      latestAttemptNumber: 1,
      createdAt: input.reservedAt,
      updatedAt: input.reservedAt,
    };
    const attempt: PersistedRunAttempt = {
      schemaVersion: "meliora.persisted-run-attempt.v1",
      sessionId: input.sessionId,
      turnId: input.turnId,
      runId: input.runId,
      attemptId: input.attemptId,
      attemptNumber: 1,
      status: "created",
      lastEventSequence: 0,
      catalogHash: input.catalogHash,
      intentRevision: input.intentRevision,
      runtimeState: null,
      createdAt: input.reservedAt,
      updatedAt: input.reservedAt,
    };

    this.sessions.set(session.sessionId, deepCopy(session));
    this.turns.set(turn.turnId, deepCopy(turn));
    this.runs.set(run.runId, deepCopy(run));
    this.attempts.set(attemptKey(run.runId, attempt.attemptId), deepCopy(attempt));
    this.events.set(run.runId, []);
    this.privateUserInputs.set(turn.turnId, deepCopy(privateUserInput));
    this.commands.set(scopeKey, deepCopy(command));
    this.commandScopeByRunId.set(run.runId, scopeKey);
    return { kind: "owner", command: deepCopy(command) };
  }

  async readRunCommand(input: RunCommandScope): Promise<StoredRunCommand | null> {
    assertValidLocalPrincipalId(input.localPrincipalId);
    assertValidWorkspaceId(input.workspaceId);
    assertValidIdempotencyKey(input.idempotencyKey);
    const command = this.commands.get(commandScopeKey(input));
    return command ? deepCopy(command) : null;
  }

  async transitionRunCommand(input: TransitionRunCommandInput): Promise<TransitionRunCommandResult> {
    assertValidLocalPrincipalId(input.localPrincipalId);
    assertValidWorkspaceId(input.workspaceId);
    assertValidIdempotencyKey(input.idempotencyKey);
    assertValidGeneratedId(input.runId);
    assertValidGeneratedId(input.attemptId);
    assertValidCommandTimestamp(input.updatedAt);
    if ((input as { nextStatus: RunCommandStatus }).nextStatus === "dispatched") {
      return { kind: "conflict", code: "command_status_conflict" };
    }
    if (input.nextStatus === "terminal" && !input.terminalStatus) {
      return { kind: "conflict", code: "command_status_conflict" };
    }
    if (input.nextStatus !== "terminal" && (input.terminalStatus !== undefined || input.terminalCode !== undefined)) {
      return { kind: "conflict", code: "command_status_conflict" };
    }
    if (input.terminalCode !== undefined) assertValidSafeCode(input.terminalCode);
    const key = commandScopeKey(input);
    const existing = this.commands.get(key);
    if (!existing) return { kind: "not_found", code: "run_command_not_found" };
    if (
      existing.runId !== input.runId
      || !this.attemptForRun(input.runId, input.attemptId)
      || this.runs.get(input.runId)?.activeAttemptId !== input.attemptId
    ) {
      return { kind: "conflict", code: "run_attempt_conflict" };
    }
    const leaseConflict = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
    if (leaseConflict) return { kind: "conflict", code: leaseConflict };

    const isExactReplay = existing.status === input.nextStatus
      && existing.terminalStatus === input.terminalStatus
      && existing.terminalCode === input.terminalCode;
    if (isExactReplay) return { kind: "replay", command: existing };
    if (
      existing.status !== input.expectedStatus
      || !canTransitionRunCommand(existing.status, input.nextStatus)
      || Date.parse(input.updatedAt) < Date.parse(existing.updatedAt)
    ) {
      return { kind: "conflict", code: "command_status_conflict" };
    }

    const {
      terminalStatus: _terminalStatus,
      terminalCode: _terminalCode,
      ...commandBase
    } = existing;
    const updated: StoredRunCommand = input.nextStatus === "terminal"
      ? {
          ...commandBase,
          status: "terminal",
          terminalStatus: input.terminalStatus,
          ...(input.terminalCode === undefined ? {} : { terminalCode: input.terminalCode }),
          updatedAt: input.updatedAt,
        }
      : { ...commandBase, status: input.nextStatus, updatedAt: input.updatedAt };
    this.commands.set(key, updated);
    return { kind: "updated", command: updated };
  }

  async settleRunCommandWithTerminalEvent(
    input: SettleRunCommandWithTerminalEventInput,
  ): Promise<SettleRunCommandWithTerminalEventResult> {
    assertValidLocalPrincipalId(input.localPrincipalId);
    assertValidWorkspaceId(input.workspaceId);
    assertValidIdempotencyKey(input.idempotencyKey);
    assertValidGeneratedId(input.runId);
    assertValidGeneratedId(input.attemptId);
    assertValidCommandTimestamp(input.updatedAt);
    if (input.terminalCode !== undefined) assertValidSafeCode(input.terminalCode);
    if (!Number.isInteger(input.expectedSequence) || input.expectedSequence < 0) {
      return { kind: "conflict", code: "event_sequence_conflict" };
    }
    const expectedKind = `run_${input.terminalStatus}`;
    const event = input.terminalEvent;
    assertPersistableNewEvent(event);
    if (
      event.schemaVersion !== "meliora.session-event.v1"
      || event.kind !== expectedKind
      || event.visibility !== "public"
    ) {
      return { kind: "conflict", code: "command_status_conflict" };
    }
    const key = commandScopeKey(input);
    const command = this.commands.get(key);
    if (!command) return { kind: "not_found", code: "run_command_not_found" };
    if (
      command.runId !== input.runId
      || !this.attemptForRun(input.runId, input.attemptId)
      || this.runs.get(input.runId)?.activeAttemptId !== input.attemptId
    ) return { kind: "conflict", code: "run_attempt_conflict" };
    const leaseConflict = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
    if (leaseConflict) return { kind: "conflict", code: leaseConflict };
    const attempt = this.attemptForRun(input.runId, input.attemptId)!;
    const expectedEvent = toStoredEvent(event, input.runId, input.attemptId, input.expectedSequence + 1);
    const priorEvent = [...this.events.values()].flat().find((candidate) => candidate.eventId === event.eventId);

    if (command.status === "terminal") {
      if (
        command.terminalStatus !== input.terminalStatus
        || command.terminalCode !== input.terminalCode
        || attempt.lastEventSequence !== input.expectedSequence + 1
        || !priorEvent
        || !sameDocument(priorEvent, expectedEvent)
      ) return { kind: "conflict", code: "command_status_conflict" };
      return { kind: "replay", command, event: priorEvent };
    }
    if (
      command.status !== input.expectedCommandStatus
      || !canTransitionRunCommand(command.status, "terminal")
      || Date.parse(input.updatedAt) < Date.parse(command.updatedAt)
      || attempt.lastEventSequence !== input.expectedSequence
      || priorEvent !== undefined
    ) {
      return attempt.lastEventSequence !== input.expectedSequence
        ? { kind: "conflict", code: "event_sequence_conflict", currentSequence: attempt.lastEventSequence }
        : { kind: "conflict", code: "command_status_conflict" };
    }

    const { terminalStatus: _terminalStatus, terminalCode: _terminalCode, ...base } = command;
    const settled: StoredRunCommand = {
      ...base,
      status: "terminal",
      terminalStatus: input.terminalStatus,
      ...(input.terminalCode === undefined ? {} : { terminalCode: input.terminalCode }),
      updatedAt: input.updatedAt,
    };
    // No await occurs in this critical section: the two visible facts change together.
    this.events.set(input.runId, [...(this.events.get(input.runId) ?? []), expectedEvent]);
    this.attempts.set(attemptKey(input.runId, input.attemptId), {
      ...attempt,
      lastEventSequence: expectedEvent.sequence,
      updatedAt: input.updatedAt,
    });
    this.commands.set(key, settled);
    return { kind: "settled", command: settled, event: expectedEvent };
  }

  async recoverAndSettleRunCommandWithTerminalEvent(
    input: RecoverAndSettleRunCommandWithTerminalEventInput,
  ): Promise<RecoverAndSettleRunCommandWithTerminalEventResult> {
    assertValidLocalPrincipalId(input.localPrincipalId);
    assertValidWorkspaceId(input.workspaceId);
    assertValidIdempotencyKey(input.idempotencyKey);
    assertValidGeneratedId(input.runId);
    assertValidGeneratedId(input.expectedActiveAttemptId);
    assertValidSafeCode(input.terminalCode);
    assertValidCommandTimestamp(input.updatedAt);
    if (input.expectedCommandStatus !== "dispatched") return { kind: "conflict", code: "command_status_conflict" };
    const recovery = input.recoveryAttempt;
    assertValidGeneratedId(recovery.attemptId);
    assertValidGeneratedId(recovery.ownerId);
    assertPersistableText(recovery.attemptId, "recovery_attempt.attemptId");
    assertPersistableText(recovery.ownerId, "recovery_attempt.ownerId");
    assertValidCommandTimestamp(recovery.createdAt);
    assertValidCommandTimestamp(recovery.requestedAt);
    this.requireTtl(recovery.ttlMs);
    const event = input.terminalEvent;
    assertPersistableNewEvent(event);
    if (event.schemaVersion !== "meliora.session-event.v1" || event.kind !== "run_blocked" || event.visibility !== "public") {
      return { kind: "conflict", code: "command_status_conflict" };
    }
    if (Object.keys(event).some((key) => !RECOVERY_TERMINAL_EVENT_KEYS.has(key))) {
      return { kind: "conflict", code: "command_status_conflict" };
    }
    const payload = event.payload;
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)
      || Object.keys(payload).sort().join(",") !== "code,message,userActions"
      || (payload as { code?: unknown }).code !== input.terminalCode
      || typeof (payload as { message?: unknown }).message !== "string"
      || !Array.isArray((payload as { userActions?: unknown }).userActions)
      || !(payload as { userActions: unknown[] }).userActions.every((action) => typeof action === "string")) {
      return { kind: "conflict", code: "command_status_conflict" };
    }
    if (!Number.isInteger(input.expectedLatestAttemptNumber) || input.expectedLatestAttemptNumber < 1
      || !Number.isInteger(input.expectedSequence) || input.expectedSequence < 0
      || recovery.runId !== input.runId || recovery.expectedLatestAttemptNumber !== input.expectedLatestAttemptNumber) return { kind: "conflict", code: "run_attempt_conflict" };
    if (recovery.createdAt !== recovery.requestedAt || recovery.createdAt !== input.updatedAt || recovery.createdAt !== event.createdAt) {
      return { kind: "conflict", code: "command_status_conflict" };
    }

    const key = commandScopeKey(input);
    const command = this.commands.get(key);
    if (!command) return { kind: "not_found", code: "run_command_not_found" };
    const run = this.runs.get(input.runId);
    const active = run ? this.attemptForRun(input.runId, run.activeAttemptId) : undefined;
    if (!run || !active
      || command.runId !== input.runId
      || run.activeAttemptId !== input.expectedActiveAttemptId
      || run.latestAttemptNumber !== input.expectedLatestAttemptNumber
      || active.attemptNumber !== input.expectedLatestAttemptNumber
      || recovery.sessionId !== run.sessionId || recovery.turnId !== run.turnId
      || recovery.catalogHash !== active.catalogHash || recovery.intentRevision !== active.intentRevision
      || this.attempts.has(attemptKey(input.runId, recovery.attemptId))) {
      return { kind: "conflict", code: "run_attempt_conflict" };
    }
    if (this.activeLeaseForRun(input.runId)) return { kind: "conflict", code: "lease_held" };
    if (command.status !== input.expectedCommandStatus || active.lastEventSequence !== input.expectedSequence
      || Date.parse(input.updatedAt) < Date.parse(command.updatedAt)) {
      return active.lastEventSequence !== input.expectedSequence
        ? { kind: "conflict", code: "event_sequence_conflict", currentSequence: active.lastEventSequence }
        : { kind: "conflict", code: "command_status_conflict" };
    }
    if ([...this.events.values()].flat().some((candidate) => candidate.eventId === event.eventId)) {
      return { kind: "conflict", code: "command_status_conflict" };
    }

    const attempt: PersistedRunAttempt = {
      schemaVersion: "meliora.persisted-run-attempt.v1",
      sessionId: run.sessionId, turnId: run.turnId, runId: input.runId, attemptId: recovery.attemptId,
      attemptNumber: run.latestAttemptNumber + 1, status: "created", lastEventSequence: input.expectedSequence + 1,
      catalogHash: active.catalogHash, intentRevision: active.intentRevision, runtimeState: null,
      createdAt: recovery.createdAt, updatedAt: input.updatedAt,
    };
    const expectedEvent: StoredEvent = {
      schemaVersion: event.schemaVersion,
      eventId: event.eventId,
      runId: input.runId,
      attemptId: recovery.attemptId,
      sequence: input.expectedSequence + 1,
      kind: event.kind,
      visibility: event.visibility,
      payload: event.payload,
      createdAt: event.createdAt,
    };
    const { terminalStatus: _terminalStatus, terminalCode: _terminalCode, ...base } = command;
    const settled: StoredRunCommand = {
      ...base, status: "terminal", terminalStatus: "blocked", terminalCode: input.terminalCode, updatedAt: input.updatedAt,
    };
    const lease = this.newLease(recovery.ownerId, recovery.ttlMs);
    // Validate every injectable write before this no-await critical section;
    // unlike SQLite there is no rollback-capable engine below these Maps.
    this.onRecoveryAtomicWrite?.("attempt");
    this.onRecoveryAtomicWrite?.("lease");
    this.onRecoveryAtomicWrite?.("event");
    this.onRecoveryAtomicWrite?.("command");
    // All inputs were validated before this no-await critical section.  The
    // new Attempt, lease, terminal Command and public event are one fact.
    this.attempts.set(attemptKey(input.runId, attempt.attemptId), attempt);
    this.runs.set(input.runId, { ...run, activeAttemptId: attempt.attemptId, latestAttemptNumber: attempt.attemptNumber, updatedAt: recovery.createdAt });
    this.leases.set(attemptKey(input.runId, attempt.attemptId), lease);
    this.events.set(input.runId, [...(this.events.get(input.runId) ?? []), expectedEvent]);
    this.commands.set(key, settled);
    return { kind: "settled", command: settled, event: expectedEvent, attempt };
  }

  async claimInitialPreDispatchRunCommandForRecovery(
    input: ClaimInitialPreDispatchRunCommandForRecoveryInput,
  ): Promise<ClaimInitialPreDispatchRunCommandForRecoveryResult> {
    assertValidLocalPrincipalId(input.localPrincipalId);
    assertValidWorkspaceId(input.workspaceId);
    assertValidIdempotencyKey(input.idempotencyKey);
    assertValidGeneratedId(input.runId);
    assertValidGeneratedId(input.expectedInitialAttemptId);
    if (input.expectedLatestAttemptNumber !== 1 || (input.expectedCommandStatus !== "reserved" && input.expectedCommandStatus !== "accepted")) {
      return { kind: "conflict", code: "initial_recovery_not_safe" };
    }
    if (!Number.isInteger(input.expectedSequence) || input.expectedSequence < 0) {
      return { kind: "conflict", code: "event_sequence_conflict" };
    }
    const recovery = input.recoveryAttempt;
    assertValidGeneratedId(recovery.attemptId);
    assertValidGeneratedId(recovery.ownerId);
    assertPersistableText(recovery.attemptId, "recovery_attempt.attemptId");
    assertPersistableText(recovery.ownerId, "recovery_attempt.ownerId");
    assertValidCommandTimestamp(recovery.createdAt);
    assertValidCommandTimestamp(recovery.requestedAt);
    this.requireTtl(recovery.ttlMs);
    if (recovery.runId !== input.runId
      || recovery.expectedLatestAttemptNumber !== 1
      || recovery.attemptId === input.expectedInitialAttemptId
      || recovery.createdAt !== recovery.requestedAt) {
      return { kind: "conflict", code: "run_attempt_conflict" };
    }

    const key = commandScopeKey(input);
    const command = this.commands.get(key);
    if (!command) return { kind: "not_found", code: "run_command_not_found" };
    const run = this.runs.get(input.runId);
    const initialAttempt = run ? this.attemptForRun(input.runId, run.activeAttemptId) : null;
    const session = run ? this.sessions.get(run.sessionId) : undefined;
    const turn = run ? this.turns.get(run.turnId) : undefined;
    const privateInput = run ? this.privateUserInputs.get(run.turnId) : undefined;
    const attemptsForRun = [...this.attempts.values()].filter((attempt) => attempt.runId === input.runId);
    if (!run || !initialAttempt
      || command.runId !== input.runId
      || command.initialAttemptId !== input.expectedInitialAttemptId
      || command.attemptId !== input.expectedInitialAttemptId
      || run.activeAttemptId !== input.expectedInitialAttemptId
      || run.latestAttemptNumber !== 1
      || initialAttempt.attemptId !== input.expectedInitialAttemptId
      || initialAttempt.attemptNumber !== 1
      || initialAttempt.status !== "created" || initialAttempt.runtimeState !== null
      || command.sessionId !== run.sessionId || command.turnId !== run.turnId
      || initialAttempt.sessionId !== run.sessionId || initialAttempt.turnId !== run.turnId
      || recovery.sessionId !== run.sessionId || recovery.turnId !== run.turnId
      || recovery.catalogHash !== initialAttempt.catalogHash || recovery.intentRevision !== initialAttempt.intentRevision
      || !session || session.sessionId !== run.sessionId || session.workspaceId !== command.workspaceId
      || session.createdAt !== command.createdAt || session.updatedAt !== command.createdAt
      || !turn || turn.turnId !== run.turnId || turn.sessionId !== run.sessionId || turn.intentRevision !== initialAttempt.intentRevision
      || turn.createdAt !== command.createdAt || turn.updatedAt !== command.createdAt
      || !privateInput || privateInput.schemaVersion !== "meliora.private-user-input.v1" || privateInput.sessionId !== run.sessionId || privateInput.turnId !== run.turnId
      || privateInput.role !== "user" || privateInput.visibility !== "private"
      || privateInput.createdAt !== command.createdAt || privateInput.contentHash !== privateUserInputContentHash(privateInput.content)
      || command.canonicalRequestHash !== canonicalRunCommandRequestHash({ workspaceId: command.workspaceId, message: privateInput.content })
      || run.createdAt !== command.createdAt || initialAttempt.createdAt !== command.createdAt
      || this.attempts.has(attemptKey(input.runId, recovery.attemptId))) {
      return { kind: "conflict", code: "initial_recovery_not_safe" };
    }
    if (command.status !== input.expectedCommandStatus) return { kind: "conflict", code: "command_status_conflict" };
    if (Date.parse(recovery.createdAt) < Date.parse(command.updatedAt)) return { kind: "conflict", code: "initial_recovery_not_safe" };

    // The Server can crash after reservation but before its first lease
    // acquisition, so an absent initial lease is a valid no-worker proof.
    // Any malformed lease is drift, and any live lease for *any* Attempt of
    // this Run remains an authority conflict.
    const leasePrefix = `${input.runId}\u0000`;
    for (const [leaseKey, lease] of this.leases) {
      if (!leaseKey.startsWith(leasePrefix)) continue;
      if (!Number.isFinite(Date.parse(lease.expiresAt))) {
        return { kind: "conflict", code: "initial_recovery_not_safe" };
      }
      if (!this.isExpired(lease)) return { kind: "conflict", code: "lease_held" };
    }
    if (attemptsForRun.length !== 1 || attemptsForRun[0]!.attemptId !== input.expectedInitialAttemptId) {
      return { kind: "conflict", code: "initial_recovery_not_safe" };
    }
    const events = this.events.get(input.runId) ?? [];
    if (initialAttempt.lastEventSequence !== input.expectedSequence) {
      return { kind: "conflict", code: "event_sequence_conflict", currentSequence: initialAttempt.lastEventSequence };
    }
    if (!hasOnlyInitialPreDispatchPrefix(events, input.runId, input.expectedInitialAttemptId, input.expectedCommandStatus, input.expectedSequence)
      || [...this.modelSteps.values()].some((step) => step.runId === input.runId)
      || this.snapshots.has(input.runId)
      || [...this.terminalSnapshotHistory.values()].some((history) => history.snapshot.runId === input.runId)
      || [...this.terminalModelStepResults.entries()].some(([resultKey]) => resultKey.startsWith(`${input.runId}\u0000`))
      || [...this.invocations.values()].some((invocation) => invocation.runId === input.runId)
      || [...this.receipts.values()].some((receipt) => receipt.runId === input.runId)
      || [...this.receiptPublicEventBindings.values()].some((binding) => binding.events.some((event) => event.runId === input.runId))
      || [...this.stagedPublicArtifacts.values()].some((artifact) => artifact.runId === input.runId)) {
      return { kind: "conflict", code: "initial_recovery_not_safe" };
    }

    const attempt: PersistedRunAttempt = {
      schemaVersion: "meliora.persisted-run-attempt.v1",
      sessionId: run.sessionId, turnId: run.turnId, runId: input.runId, attemptId: recovery.attemptId,
      attemptNumber: 2, status: "created", lastEventSequence: input.expectedSequence,
      catalogHash: initialAttempt.catalogHash, intentRevision: initialAttempt.intentRevision, runtimeState: null,
      createdAt: recovery.createdAt, updatedAt: recovery.createdAt,
    };
    const lease = this.newLease(recovery.ownerId, recovery.ttlMs);
    // Validate every injectable point before mutating Maps: no await and no
    // partial takeover exist in the Memory adapter.
    this.onRecoveryAtomicWrite?.("takeover_attempt");
    this.onRecoveryAtomicWrite?.("takeover_lease");
    this.onRecoveryAtomicWrite?.("takeover_run");
    this.attempts.set(attemptKey(input.runId, attempt.attemptId), attempt);
    this.runs.set(input.runId, {
      ...run,
      activeAttemptId: attempt.attemptId,
      latestAttemptNumber: attempt.attemptNumber,
      updatedAt: recovery.createdAt,
    });
    this.leases.set(attemptKey(input.runId, attempt.attemptId), lease);
    return { kind: "claimed", command: deepCopy(command), attempt: deepCopy(attempt), lease: { leaseToken: lease.token, expiresAt: lease.expiresAt }, continuation: continuationForPrefix(input.expectedSequence) };
  }

  async reclaimInitialPreDispatchExecutionAuthority(
    input: ReclaimInitialPreDispatchExecutionAuthorityInput,
  ): Promise<ReclaimInitialPreDispatchExecutionAuthorityResult> {
    assertValidLocalPrincipalId(input.localPrincipalId);
    assertValidWorkspaceId(input.workspaceId);
    assertValidIdempotencyKey(input.idempotencyKey);
    assertValidGeneratedId(input.runId);
    assertValidGeneratedId(input.expectedInitialAttemptId);
    assertValidGeneratedId(input.expectedActiveAttemptId);
    assertValidGeneratedId(input.ownerId);
    assertPersistableText(input.ownerId, "reclaim.ownerId");
    assertValidCommandTimestamp(input.requestedAt);
    this.requireTtl(input.ttlMs);
    if (input.expectedLatestAttemptNumber !== 2
      || input.expectedActiveAttemptId === input.expectedInitialAttemptId
      || (input.expectedCommandStatus !== "reserved" && input.expectedCommandStatus !== "accepted")
      || !Number.isInteger(input.expectedSequence) || input.expectedSequence < 0) {
      return { kind: "conflict", code: "initial_recovery_not_safe" };
    }
    const command = this.commands.get(commandScopeKey(input));
    if (!command) return { kind: "not_found", code: "run_command_not_found" };
    const run = this.runs.get(input.runId);
    const initial = this.attemptForRun(input.runId, input.expectedInitialAttemptId);
    const active = this.attemptForRun(input.runId, input.expectedActiveAttemptId);
    const session = run ? this.sessions.get(run.sessionId) : undefined;
    const turn = run ? this.turns.get(run.turnId) : undefined;
    const privateInput = run ? this.privateUserInputs.get(run.turnId) : undefined;
    const attempts = [...this.attempts.values()].filter((attempt) => attempt.runId === input.runId);
    if (!run || !initial || !active
      || command.runId !== input.runId || command.initialAttemptId !== input.expectedInitialAttemptId || command.attemptId !== input.expectedInitialAttemptId
      || run.activeAttemptId !== input.expectedActiveAttemptId || run.latestAttemptNumber !== 2
      || initial.attemptNumber !== 1 || active.attemptNumber !== 2
      || initial.status !== "created" || active.status !== "created" || initial.runtimeState !== null || active.runtimeState !== null
      || initial.sessionId !== run.sessionId || initial.turnId !== run.turnId || active.sessionId !== run.sessionId || active.turnId !== run.turnId
      || command.sessionId !== run.sessionId || command.turnId !== run.turnId
      || !session || session.sessionId !== run.sessionId || session.workspaceId !== command.workspaceId
      || session.createdAt !== command.createdAt || session.updatedAt !== command.createdAt
      || !turn || turn.turnId !== run.turnId || turn.sessionId !== run.sessionId || turn.intentRevision !== initial.intentRevision
      || turn.createdAt !== command.createdAt || turn.updatedAt !== command.createdAt
      || !privateInput || privateInput.schemaVersion !== "meliora.private-user-input.v1" || privateInput.sessionId !== run.sessionId || privateInput.turnId !== run.turnId
      || privateInput.role !== "user" || privateInput.visibility !== "private" || privateInput.contentHash !== privateUserInputContentHash(privateInput.content)
      || privateInput.createdAt !== command.createdAt || run.createdAt !== command.createdAt || initial.createdAt !== command.createdAt
      || command.canonicalRequestHash !== canonicalRunCommandRequestHash({ workspaceId: command.workspaceId, message: privateInput.content })
      || initial.catalogHash !== active.catalogHash || initial.intentRevision !== active.intentRevision
      || attempts.length !== 2 || active.lastEventSequence !== input.expectedSequence) {
      return { kind: "conflict", code: "initial_recovery_not_safe" };
    }
    if (command.status !== input.expectedCommandStatus) return { kind: "conflict", code: "command_status_conflict" };
    const events = this.events.get(input.runId) ?? [];
    const initialEventHead = events.filter((event) => event.attemptId === initial.attemptId).at(-1)?.sequence ?? 0;
    if (initial.lastEventSequence !== initialEventHead
      || !hasOnlyInitialPreDispatchPrefix(events, input.runId, [initial.attemptId, active.attemptId], input.expectedCommandStatus, input.expectedSequence)
      || [...this.modelSteps.values()].some((step) => step.runId === input.runId)
      || this.snapshots.has(input.runId)
      || [...this.terminalSnapshotHistory.values()].some((history) => history.snapshot.runId === input.runId)
      || [...this.terminalModelStepResults.keys()].some((key) => key.startsWith(`${input.runId}\u0000`))
      || [...this.invocations.values()].some((value) => value.runId === input.runId)
      || [...this.receipts.values()].some((value) => value.runId === input.runId)
      || [...this.receiptPublicEventBindings.values()].some((binding) => binding.events.some((event) => event.runId === input.runId))
      || [...this.stagedPublicArtifacts.values()].some((artifact) => artifact.runId === input.runId)) {
      return { kind: "conflict", code: "initial_recovery_not_safe" };
    }
    const activeLeaseKey = attemptKey(input.runId, active.attemptId);
    if (!this.leases.has(activeLeaseKey)) return { kind: "conflict", code: "initial_recovery_not_safe" };
    for (const [key, lease] of this.leases) {
      if (!key.startsWith(`${input.runId}\u0000`) || !Number.isFinite(Date.parse(lease.expiresAt))) {
        if (key.startsWith(`${input.runId}\u0000`)) return { kind: "conflict", code: "initial_recovery_not_safe" };
        continue;
      }
      if (!this.isExpired(lease)) return { kind: "conflict", code: "lease_held" };
    }
    const lease = this.newLease(input.ownerId, input.ttlMs);
    this.leases.set(activeLeaseKey, lease);
    return { kind: "reclaimed", command: deepCopy(command), attempt: deepCopy(active), lease: { leaseToken: lease.token, expiresAt: lease.expiresAt }, continuation: continuationForPrefix(input.expectedSequence) };
  }

  async readPrivateUserInput(input: ReadPrivateUserInputInput): Promise<StoredPrivateUserInput | null> {
    const record = this.privateUserInputs.get(input.turnId);
    return record?.sessionId === input.sessionId ? deepCopy(record) : null;
  }

  async listRecoverableCommands(input: RecoveryCommandScanInput): Promise<RecoveryCommandPage> {
    this.assertRecoveryLimit(input.limit, 64, "invalid_recovery_command_limit");
    if (input.afterCursor !== undefined) {
      assertValidCommandTimestamp(input.afterCursor.createdAt);
      assertValidGeneratedId(input.afterCursor.runId);
    }
    const commands: RecoverableCommandRef[] = [...this.commands.values()]
      .filter((command) => command.status !== "terminal")
      .sort((left, right) => left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : left.runId < right.runId ? -1 : left.runId > right.runId ? 1 : 0)
      .filter((command) => input.afterCursor === undefined
        || command.createdAt > input.afterCursor.createdAt
        || (command.createdAt === input.afterCursor.createdAt && command.runId > input.afterCursor.runId))
      .map((command) => ({ runId: command.runId, initialAttemptId: command.initialAttemptId, status: command.status, createdAt: command.createdAt }));
    const page = commands.slice(0, input.limit);
    const sweepComplete = commands.length <= input.limit;
    return {
      commands: deepCopy(page),
      sweepComplete,
      nextCursor: sweepComplete ? null : deepCopy({ createdAt: page.at(-1)!.createdAt, runId: page.at(-1)!.runId }),
    };
  }

  async readRecoveryBundle(input: RecoveryBundleInput): Promise<RecoveryBundleResult> {
    this.assertRecoveryLimit(input.eventLimit, 500, "invalid_recovery_event_limit");
    if (input.afterSequence !== undefined && (!Number.isInteger(input.afterSequence) || input.afterSequence < 0)) {
      throw new TypeError("invalid_recovery_after_sequence");
    }
    const run = this.runs.get(input.runId);
    if (!run) return { kind: "not_found", code: "run_not_found" };
    if (input.expectedActiveAttemptId !== undefined && input.expectedActiveAttemptId !== run.activeAttemptId) {
      return { kind: "conflict", code: "run_attempt_conflict" };
    }
    const commandScope = this.commandScopeByRunId.get(input.runId);
    const command = commandScope ? this.commands.get(commandScope) : undefined;
    if (!command) return { kind: "not_found", code: "run_command_not_found" };
    const activeAttempt = this.attemptForRun(input.runId, run.activeAttemptId);
    if (!activeAttempt) return { kind: "conflict", code: "run_attempt_conflict" };
    const privateUserInput = this.privateUserInputs.get(run.turnId);
    if (!privateUserInput) return { kind: "failure", code: "recovery_bundle_incomplete" };
    const invocations = [...this.reservations.values()]
      .filter((reservation) => reservation.runId === input.runId)
      .sort((left, right) => left.reservedAt.localeCompare(right.reservedAt) || left.invocationId.localeCompare(right.invocationId));
    if (invocations.length > 128) return { kind: "failure", code: "recovery_bundle_too_large" };
    const snapshot = this.snapshots.get(input.runId) ?? null;
    if (snapshot) this.assertSnapshotIntegrity(snapshot);
    const terminalModelStepResult = this.assertTerminalResultSnapshotInvariant(input.runId, snapshot);
    const effectiveAfterSequence = Math.max(input.afterSequence ?? 0, snapshot?.throughSequence ?? 0);
    const eligible = (this.events.get(input.runId) ?? []).filter((event) => event.sequence > effectiveAfterSequence);
    const tailEvents = eligible.slice(0, input.eventLimit);
    const tailComplete = eligible.length <= tailEvents.length;
    const records: InvocationReconciliationRecord[] = invocations.map((reservation) => {
      const invocation = this.invocations.get(invocationKey(reservation.runId, reservation.attemptId, reservation.invocationId));
      if (!invocation) throw new Error("recovery_invocation_drift");
      const receiptId = this.receiptByReservation.get(reservation.reservationId);
      return { reservation, invocation, receipt: receiptId ? this.receipts.get(receiptKey(reservation.runId, reservation.attemptId, receiptId)) ?? null : null };
    });
    const latestModelStep = [...this.modelSteps.values()]
      .filter((step) => step.runId === input.runId && step.attemptId === run.activeAttemptId)
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.modelStepId.localeCompare(right.modelStepId))
      .at(-1) ?? null;
    const bundle: RecoveryBundle = {
      command,
      run,
      activeAttempt,
      readActiveAttemptId: run.activeAttemptId,
      latestAttemptNumber: run.latestAttemptNumber,
      privateUserInput,
      privateSnapshot: snapshot,
      tailEvents,
      effectiveAfterSequence,
      eventHeadSequence: activeAttempt.lastEventSequence,
      tailComplete,
      nextAfterSequence: tailComplete ? null : tailEvents.at(-1)?.sequence ?? effectiveAfterSequence,
      latestModelStep,
      terminalModelStepResult,
      invocations: records,
    };
    return { kind: "found", bundle: deepCopy(bundle) };
  }

  async startModelStep(input: StartModelStepInput): Promise<StartModelStepResult> {
    assertValidGeneratedId(input.runId);
    assertValidGeneratedId(input.attemptId);
    assertValidGeneratedId(input.modelStepId);
    assertValidModelStepFingerprint(input.requestFingerprint);
    assertValidCommandTimestamp(input.startedAt);
    if (!this.attemptForRun(input.runId, input.attemptId) || this.runs.get(input.runId)?.activeAttemptId !== input.attemptId) {
      return { kind: "conflict", code: "run_attempt_conflict" };
    }
    const key = modelStepKey(input.runId, input.modelStepId);
    const existing = this.modelSteps.get(key);
    if (existing) {
      if (existing.attemptId !== input.attemptId || existing.requestFingerprint !== input.requestFingerprint) {
        return { kind: "conflict", code: "model_step_conflict" };
      }
      return existing.status === "started"
        ? { kind: "conflict", code: "model_step_in_progress" }
        : { kind: "replay", checkpoint: existing };
    }
    const leaseConflict = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
    if (leaseConflict) return { kind: "conflict", code: leaseConflict };
    const commandScope = this.commandScopeByRunId.get(input.runId);
    const command = commandScope === undefined ? undefined : this.commands.get(commandScope);
    if (!command || (command.status !== "accepted" && command.status !== "dispatched")) {
      return { kind: "conflict", code: "model_step_conflict" };
    }
    if (Date.parse(input.startedAt) < Date.parse(command.updatedAt)) {
      return { kind: "conflict", code: "model_step_conflict" };
    }
    const hasPendingStep = [...this.modelSteps.values()].some((checkpoint) => checkpoint.runId === input.runId
        && checkpoint.status === "started",
    );
    if (hasPendingStep) return { kind: "conflict", code: "model_step_in_progress" };
    const checkpoint: StoredModelStepCheckpoint = {
      schemaVersion: "meliora.model-step-checkpoint.v1",
      runId: input.runId,
      attemptId: input.attemptId,
      modelStepId: input.modelStepId,
      requestFingerprint: input.requestFingerprint,
      status: "started",
      startedAt: input.startedAt,
    };
    if (command.status === "accepted") {
      this.commands.set(commandScope!, { ...command, status: "dispatched", updatedAt: input.startedAt });
    }
    this.modelSteps.set(key, checkpoint);
    return { kind: "started", checkpoint };
  }

  async finishModelStep(input: FinishModelStepInput): Promise<FinishModelStepResult> {
    assertValidGeneratedId(input.runId);
    assertValidGeneratedId(input.attemptId);
    assertValidGeneratedId(input.modelStepId);
    assertValidModelStepFingerprint(input.requestFingerprint);
    assertValidCommandTimestamp(input.outcome.finishedAt);
    if (input.outcome.status === "terminal") return { kind: "conflict", code: "terminal_model_step_commit_required" };
    if (input.outcome.status === "failed") assertValidSafeCode(input.outcome.failureCode);
    if (!this.attemptForRun(input.runId, input.attemptId) || this.runs.get(input.runId)?.activeAttemptId !== input.attemptId) {
      return { kind: "conflict", code: "run_attempt_conflict" };
    }
    const leaseConflict = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
    if (leaseConflict) return { kind: "conflict", code: leaseConflict };
    const key = modelStepKey(input.runId, input.modelStepId);
    const existing = this.modelSteps.get(key);
    if (!existing || existing.attemptId !== input.attemptId || existing.requestFingerprint !== input.requestFingerprint) {
      return { kind: "conflict", code: "model_step_conflict" };
    }
    const {
      status: _status,
      finishedAt: _finishedAt,
      failureCode: _failureCode,
      ...checkpointBase
    } = existing;
    const desired: StoredModelStepCheckpoint = {
      ...checkpointBase,
      status: "failed",
      finishedAt: input.outcome.finishedAt,
      failureCode: input.outcome.failureCode,
    };
    if (existing.status !== "started") {
      return sameDocument(existing, desired)
        ? { kind: "replay", checkpoint: existing }
        : { kind: "conflict", code: "model_step_conflict" };
    }
    if (Date.parse(input.outcome.finishedAt) < Date.parse(existing.startedAt)) {
      return { kind: "conflict", code: "model_step_conflict" };
    }
    this.modelSteps.set(key, desired);
    return { kind: "committed", checkpoint: desired };
  }

  async readModelStep(input: ReadModelStepInput): Promise<StoredModelStepCheckpoint | null> {
    return this.modelSteps.get(modelStepKey(input.runId, input.modelStepId)) ?? null;
  }

  async readLatestModelStep(input: ReadLatestModelStepInput): Promise<StoredModelStepCheckpoint | null> {
    let latest: StoredModelStepCheckpoint | null = null;
    for (const checkpoint of this.modelSteps.values()) {
      if (checkpoint.runId !== input.runId || (input.attemptId !== undefined && checkpoint.attemptId !== input.attemptId)) continue;
      if (!latest || Date.parse(checkpoint.startedAt) >= Date.parse(latest.startedAt)) latest = checkpoint;
    }
    return latest;
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const existing = this.sessions.get(input.sessionId);
    if (existing) return existing;
    const session: SessionRecord = {
      schemaVersion: "meliora.session.v1",
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    this.sessions.set(session.sessionId, session);
    return session;
  }

  async createTurn(input: CreateTurnInput): Promise<TurnRecord> {
    const existing = this.turns.get(input.turnId);
    if (existing) return existing;
    const turn: TurnRecord = {
      schemaVersion: "meliora.turn.v1",
      sessionId: input.sessionId,
      turnId: input.turnId,
      intentRevision: input.intentRevision,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    this.turns.set(turn.turnId, turn);
    return turn;
  }

  async createRun(input: CreateRunInput): Promise<PersistedRunRecord> {
    const existing = this.runs.get(input.runId);
    if (existing) return existing;
    const run: PersistedRunRecord = {
      schemaVersion: "meliora.persisted-run.v1",
      sessionId: input.sessionId,
      turnId: input.turnId,
      runId: input.runId,
      activeAttemptId: input.initialAttemptId,
      latestAttemptNumber: 1,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    const attempt: PersistedRunAttempt = {
      schemaVersion: "meliora.persisted-run-attempt.v1",
      sessionId: input.sessionId,
      turnId: input.turnId,
      runId: input.runId,
      attemptId: input.initialAttemptId,
      attemptNumber: 1,
      status: "created",
      lastEventSequence: 0,
      catalogHash: input.catalogHash,
      intentRevision: input.intentRevision,
      runtimeState: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    this.runs.set(run.runId, run);
    this.attempts.set(attemptKey(run.runId, attempt.attemptId), attempt);
    this.events.set(run.runId, []);
    return run;
  }

  async createRunAttempt(input: CreateRunAttemptInput): Promise<CreateRunAttemptResult> {
    const run = this.runs.get(input.runId);
    if (!run || run.latestAttemptNumber !== input.expectedLatestAttemptNumber) {
      return {
        kind: "conflict",
        code: "run_attempt_conflict",
        latestAttemptNumber: run?.latestAttemptNumber ?? -1,
      };
    }
    const latestAttempt = this.attemptForRun(input.runId, run.activeAttemptId);
    if (latestAttempt && this.isC2bPristineAttempt(input.runId, latestAttempt.attemptId)) {
      return { kind: "conflict", code: "run_attempt_conflict", latestAttemptNumber: run.latestAttemptNumber };
    }
    if (
      !latestAttempt ||
      latestAttempt.attemptNumber !== run.latestAttemptNumber ||
      this.attempts.has(attemptKey(input.runId, input.attemptId)) ||
      input.sessionId !== run.sessionId ||
      input.turnId !== run.turnId ||
      input.catalogHash !== latestAttempt.catalogHash ||
      input.intentRevision !== latestAttempt.intentRevision
    ) {
      return {
        kind: "conflict",
        code: "run_attempt_conflict",
        latestAttemptNumber: run.latestAttemptNumber,
      };
    }
    const activeLease = this.activeLeaseForRun(input.runId);
    if (activeLease) {
      return {
        kind: "conflict",
        code: "lease_held",
        latestAttemptNumber: run.latestAttemptNumber,
        expiresAt: activeLease.expiresAt,
      };
    }
    const attemptNumber = run.latestAttemptNumber + 1;
    const lastEventSequence = this.events.get(input.runId)?.at(-1)?.sequence ?? 0;
    const attempt: PersistedRunAttempt = {
      schemaVersion: "meliora.persisted-run-attempt.v1",
      sessionId: input.sessionId,
      turnId: input.turnId,
      runId: input.runId,
      attemptId: input.attemptId,
      attemptNumber,
      status: "created",
      lastEventSequence,
      catalogHash: input.catalogHash,
      intentRevision: input.intentRevision,
      runtimeState: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    const lease = this.newLease(input.ownerId, input.ttlMs);
    const updatedRun: PersistedRunRecord = {
      ...run,
      activeAttemptId: input.attemptId,
      latestAttemptNumber: attemptNumber,
      updatedAt: input.createdAt,
    };
    this.attempts.set(attemptKey(input.runId, input.attemptId), attempt);
    this.runs.set(input.runId, updatedRun);
    this.leases.set(attemptKey(input.runId, input.attemptId), lease);
    return { kind: "created", attempt, lease: { leaseToken: lease.token, expiresAt: lease.expiresAt } };
  }

  async appendEvents(input: AppendEventsInput): Promise<AppendEventsResult> {
    if (!Number.isInteger(input.expectedSequence) || input.expectedSequence < 0) {
      return { kind: "conflict", code: "event_sequence_conflict" };
    }
    for (const event of input.events) {
      assertPersistableNewEvent(event);
    }
    const attempt = this.attempts.get(attemptKey(input.runId, input.attemptId));
    if (!attempt) return { kind: "conflict", code: "run_attempt_conflict" };
    const leaseConflict = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
    if (leaseConflict) return { kind: "conflict", code: leaseConflict };
    if (attempt.lastEventSequence !== input.expectedSequence) {
      return { kind: "conflict", code: "event_sequence_conflict", currentSequence: attempt.lastEventSequence };
    }
    const previous = this.events.get(input.runId) ?? [];
    const appended = input.events.map((event, index) =>
      toStoredEvent(event, input.runId, input.attemptId, input.expectedSequence + index + 1));
    const lastSequence = input.expectedSequence + appended.length;
    this.events.set(input.runId, deepCopy([...previous, ...appended]));
    this.attempts.set(attemptKey(input.runId, input.attemptId), {
      ...attempt,
      lastEventSequence: lastSequence,
      updatedAt: this.clock().toISOString(),
    });
    return { kind: "appended", events: deepCopy(appended), lastSequence };
  }

  async readEvents(input: ReadEventsInput): Promise<EventPage> {
    const after = input.afterSequence ?? 0;
    const eligible = (this.events.get(input.runId) ?? []).filter((event) => event.sequence > after);
    const events = deepCopy(eligible.slice(0, input.limit));
    return {
      events,
      nextSequence: eligible.length > events.length ? events.at(-1)?.sequence ?? null : null,
    };
  }

  async readEventLogPage(input: ReadEventLogPageInput): Promise<EventLogPage> {
    const after = input.afterSequence ?? 0;
    if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(input.limit) || input.limit < 1) {
      throw new TypeError("invalid_event_log_page");
    }
    const run = this.runs.get(input.runId);
    if (!run) return { kind: "not_found", code: "run_not_found" };

    // This synchronous section is the Memory adapter's read view: capture the
    // head before selecting the page, and deep-copy before yielding.
    const source = this.events.get(input.runId) ?? [];
    const currentHead = source.at(-1)?.sequence ?? 0;
    const activeAttempt = this.attempts.get(attemptKey(input.runId, run.activeAttemptId));
    if (!activeAttempt || activeAttempt.lastEventSequence !== currentHead) {
      return { kind: "conflict", code: "event_watermark_conflict" };
    }
    const throughSequence = input.throughSequence ?? currentHead;
    if (!Number.isSafeInteger(throughSequence) || throughSequence < 0 || throughSequence > currentHead) {
      return { kind: "conflict", code: "event_watermark_conflict" };
    }
    if (after > throughSequence) return { kind: "conflict", code: "event_watermark_conflict" };
    const eligible = source.filter((event) => event.sequence > after && event.sequence <= throughSequence);
    const events = deepCopy(eligible.slice(0, input.limit));
    return {
      kind: "found",
      events,
      nextSequence: eligible.length > events.length ? events.at(-1)?.sequence ?? null : null,
      throughSequence,
    };
  }

  async writeSnapshot(input: WriteSnapshotInput): Promise<void> {
    if (input.snapshot.state.terminalModelStepResult !== undefined) throw new Error("terminal_model_step_commit_required");
    this.assertSnapshotIntegrity(input.snapshot);
    if (!Number.isInteger(input.snapshot.throughSequence) || input.snapshot.throughSequence < 0) {
      throw new Error("snapshot_sequence_conflict");
    }
    const attempt = this.attempts.get(attemptKey(input.snapshot.runId, input.snapshot.attemptId));
    if (!attempt || attempt.lastEventSequence !== input.expectedSequence || input.snapshot.throughSequence > input.expectedSequence) throw new Error("snapshot_sequence_conflict");
    const leaseConflict = this.leaseConflict(input.snapshot.runId, input.snapshot.attemptId, input.leaseToken);
    if (leaseConflict) throw new Error(leaseConflict);
    const prior = this.snapshots.get(input.snapshot.runId);
    if (prior?.throughSequence === input.snapshot.throughSequence) {
      if (
        prior.snapshotId !== input.snapshot.snapshotId
        || prior.attemptId !== input.snapshot.attemptId
        || canonicalJson(prior.state) !== canonicalJson(input.snapshot.state)
      ) throw new Error("snapshot_content_conflict");
      return;
    }
    if (prior && prior.throughSequence > input.snapshot.throughSequence) throw new Error("snapshot_sequence_conflict");
    this.snapshots.set(input.snapshot.runId, deepCopy(input.snapshot));
  }

  async commitTerminalModelStepResultAndSnapshot(
    input: CommitTerminalModelStepResultAndSnapshotInput,
  ): Promise<CommitTerminalModelStepResultAndSnapshotResult> {
    assertValidGeneratedId(input.runId); assertValidGeneratedId(input.attemptId); assertValidGeneratedId(input.modelStepId);
    assertValidModelStepFingerprint(input.requestFingerprint); assertValidCommandTimestamp(input.finishedAt);
    assertPersistableBytes(input.normalizedResult.content, "terminal_model_step_result.content");
    assertPersistableJson(input.normalizedResult.metadata ?? null, "terminal_model_step_result.metadata");
    const artifact: ArtifactRef = {
      artifactId: input.normalizedResult.artifactId, contentHash: input.normalizedResult.contentHash,
      mediaType: PRIVATE_TERMINAL_MODEL_STEP_RESULT_MEDIA_TYPE, byteLength: input.normalizedResult.content.byteLength, visibility: "private",
    };
    const terminal = input.snapshot.state.terminalModelStepResult;
    if (
      hashBytes(input.normalizedResult.content) !== input.normalizedResult.contentHash
      || input.snapshot.runId !== input.runId || input.snapshot.attemptId !== input.attemptId
      || input.snapshot.throughSequence > input.expectedSequence || !terminal
      || !sameDocument(terminal, { attemptId: input.attemptId, modelStepId: input.modelStepId, requestFingerprint: input.requestFingerprint, artifact })
    ) return { kind: "conflict", code: "terminal_model_step_result_conflict" };
    assertValidRunSnapshot(input.snapshot);
    const attempt = this.attemptForRun(input.runId, input.attemptId);
    if (!attempt || this.runs.get(input.runId)?.activeAttemptId !== input.attemptId) return { kind: "conflict", code: "run_attempt_conflict" };
    const leaseConflict = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
    if (leaseConflict) return { kind: "conflict", code: leaseConflict };
    if (attempt.lastEventSequence !== input.expectedSequence) return { kind: "conflict", code: "snapshot_sequence_conflict" };
    const stepKey = modelStepKey(input.runId, input.modelStepId);
    const step = this.modelSteps.get(stepKey);
    if (!step || step.attemptId !== input.attemptId || step.requestFingerprint !== input.requestFingerprint) return { kind: "conflict", code: "model_step_conflict" };
    const stateHash = hashBytes(canonicalJson(input.snapshot.state));
    const snapshotEnvelopeHash = hashBytes(canonicalJson(input.snapshot));
    const previousResult = this.terminalModelStepResults.get(stepKey);
    const previousSnapshot = this.snapshots.get(input.runId);
    if (previousResult || step.status === "terminal") {
      const priorArtifact = this.artifacts.get(artifact.artifactId);
      const priorHistory = previousResult ? this.terminalSnapshotHistory.get(previousResult.snapshotId) : undefined;
      const exact = !!previousResult && !!priorHistory && step.status === "terminal"
        && step.finishedAt === input.finishedAt
        && sameDocument(previousResult, { ...terminal, snapshotId: input.snapshot.snapshotId, commitOrdinal: priorHistory.commitOrdinal, throughSequence: input.snapshot.throughSequence, stateHash, snapshotEnvelopeHash, finishedAt: input.finishedAt })
        && previousResult.commitOrdinal === priorHistory.commitOrdinal
        && sameDocument(priorHistory.snapshot, input.snapshot)
        && !!priorArtifact && sameDocument({ ...priorArtifact, content: Array.from(priorArtifact.content) }, {
          ...artifact, createdAt: input.finishedAt, content: Array.from(input.normalizedResult.content), ...(input.normalizedResult.metadata === undefined ? {} : { metadata: input.normalizedResult.metadata }),
        });
      if (exact) this.assertTerminalResultSnapshotInvariant(input.runId, previousSnapshot ?? null);
      return exact
        ? { kind: "replay", checkpoint: step, artifact: artifact as PrivateArtifactRef, snapshot: deepCopy(input.snapshot) }
        : { kind: "conflict", code: "terminal_model_step_result_conflict" };
    }
    if (step.status !== "started" || Date.parse(input.finishedAt) < Date.parse(step.startedAt) || this.artifacts.has(artifact.artifactId) || this.terminalSnapshotHistory.has(input.snapshot.snapshotId)) {
      return { kind: "conflict", code: step.status === "started" ? "terminal_model_step_result_conflict" : "model_step_conflict" };
    }
    this.assertTerminalResultSnapshotInvariant(input.runId, previousSnapshot ?? null);
    if (previousSnapshot && previousSnapshot.throughSequence > input.snapshot.throughSequence) {
      return { kind: "conflict", code: "terminal_model_step_result_conflict" };
    }
    const commitOrdinal = Math.max(0, ...[...this.terminalSnapshotHistory.values()]
      .filter((history) => history.snapshot.runId === input.runId)
      .map((history) => history.commitOrdinal)) + 1;
    // All possibly failing validation is above. These synchronous map writes are the
    // Memory adapter's critical section and mirror SQLite's BEGIN IMMEDIATE unit.
    const checkpoint: StoredModelStepCheckpoint = { ...step, status: "terminal", finishedAt: input.finishedAt };
    const storedArtifact: Artifact = { ...artifact, createdAt: input.finishedAt, content: new Uint8Array(input.normalizedResult.content), ...(input.normalizedResult.metadata === undefined ? {} : { metadata: deepCopy(input.normalizedResult.metadata) }) };
    const priorArtifact = this.artifacts.get(artifact.artifactId); const priorStep = this.modelSteps.get(stepKey);
    const priorResult = this.terminalModelStepResults.get(stepKey); const priorSnapshot = this.snapshots.get(input.runId);
    const priorHistory = this.terminalSnapshotHistory.get(input.snapshot.snapshotId);
    try {
      this.onAtomicTerminalWrite?.("artifact"); this.artifacts.set(artifact.artifactId, storedArtifact);
      this.onAtomicTerminalWrite?.("checkpoint"); this.modelSteps.set(stepKey, checkpoint);
      this.onAtomicTerminalWrite?.("terminal_result"); this.terminalSnapshotHistory.set(input.snapshot.snapshotId, { snapshot: deepCopy(input.snapshot), commitOrdinal });
      this.terminalModelStepResults.set(stepKey, { ...deepCopy(terminal), snapshotId: input.snapshot.snapshotId, commitOrdinal, throughSequence: input.snapshot.throughSequence, stateHash, snapshotEnvelopeHash, finishedAt: input.finishedAt });
      this.onAtomicTerminalWrite?.("snapshot"); this.snapshots.set(input.runId, deepCopy(input.snapshot));
    } catch (error) {
      if (priorArtifact) this.artifacts.set(artifact.artifactId, priorArtifact); else this.artifacts.delete(artifact.artifactId);
      if (priorStep) this.modelSteps.set(stepKey, priorStep); else this.modelSteps.delete(stepKey);
      if (priorResult) this.terminalModelStepResults.set(stepKey, priorResult); else this.terminalModelStepResults.delete(stepKey);
      if (priorHistory) this.terminalSnapshotHistory.set(input.snapshot.snapshotId, priorHistory); else this.terminalSnapshotHistory.delete(input.snapshot.snapshotId);
      if (priorSnapshot) this.snapshots.set(input.runId, priorSnapshot); else this.snapshots.delete(input.runId);
      throw error;
    }
    return { kind: "committed", checkpoint, artifact: artifact as PrivateArtifactRef, snapshot: deepCopy(input.snapshot) };
  }

  async readSnapshot(runId: string): Promise<RunSnapshot | null> {
    const snapshot = this.snapshots.get(runId);
    if (!snapshot) {
      this.assertTerminalResultSnapshotInvariant(runId, null);
      return null;
    }
    this.assertSnapshotIntegrity(snapshot);
    this.assertTerminalResultSnapshotInvariant(runId, snapshot);
    return deepCopy(snapshot);
  }

  async reserveInvocation(input: InvocationReservationInput): Promise<ReservationResult> {
    if (input.invocation.status !== "reserved") return { kind: "conflict", code: "invocation_reservation_conflict" };
    if (!this.attemptForRun(input.invocation.runId, input.invocation.attemptId)) {
      return { kind: "conflict", code: "run_attempt_conflict" };
    }
    const idempotencyKey = `${input.invocation.runId}\u0000${input.invocation.idempotencyKey}`;
    const replayReservationId = this.reservationByRunIdempotencyKey.get(idempotencyKey);
    if (replayReservationId) {
      const reservation = this.reservations.get(replayReservationId)!;
      const invocation = this.invocations.get(invocationKey(reservation.runId, reservation.attemptId, reservation.invocationId))!;
      if (!sameInvocationRequest(invocation, input.invocation)) {
        return { kind: "conflict", code: "idempotency_key_conflict" };
      }
      const receiptId = this.receiptByReservation.get(reservation.reservationId);
      return {
        kind: "replay",
        reservationId: reservation.reservationId,
        invocation,
        receipt: receiptId ? this.receipts.get(receiptKey(reservation.runId, reservation.attemptId, receiptId)) ?? null : null,
      };
    }
    const leaseConflict = this.leaseConflict(input.invocation.runId, input.invocation.attemptId, input.leaseToken);
    if (leaseConflict) return { kind: "conflict", code: leaseConflict };
    const key = invocationKey(input.invocation.runId, input.invocation.attemptId, input.invocation.invocationId);
    if (this.invocations.has(key)) return { kind: "conflict", code: "invocation_reservation_conflict" };
    const reservationId = this.nextReservationId();
    const reservation: StoredInvocationReservation = {
      reservationId,
      runId: input.invocation.runId,
      attemptId: input.invocation.attemptId,
      invocationId: input.invocation.invocationId,
      idempotencyKey: input.invocation.idempotencyKey,
      status: input.invocation.status,
      reservedAt: input.reservedAt,
    };
    this.invocations.set(key, deepCopy(input.invocation));
    this.reservations.set(reservationId, deepCopy(reservation));
    this.reservationByRunIdempotencyKey.set(idempotencyKey, reservationId);
    return { kind: "owner", reservationId };
  }

  async beginInvocationExecution(input: BeginInvocationExecutionInput): Promise<BeginInvocationExecutionResult> {
    if (!this.attemptForRun(input.runId, input.attemptId) || this.runs.get(input.runId)?.activeAttemptId !== input.attemptId) return { kind: "conflict", code: "run_attempt_conflict" };
    const leaseConflict = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
    if (leaseConflict) return { kind: "conflict", code: leaseConflict };
    const reservation = this.reservations.get(input.reservationId);
    if (!reservation || reservation.runId !== input.runId || reservation.attemptId !== input.attemptId) return { kind: "conflict", code: "invocation_execution_conflict" };
    const receiptId = this.receiptByReservation.get(input.reservationId);
    if (receiptId) return { kind: "receipt_replay", receiptId };
    if (reservation.status === "executing" || reservation.status === "outcome_unknown") {
      return reservation.status === "executing" ? { kind: "already_executing_or_unknown", executionStartedAt: reservation.executionStartedAt } : { kind: "already_executing_or_unknown" };
    }
    if (reservation.status !== "reserved" || reservation.executionStartedAt !== undefined) return { kind: "conflict", code: "invocation_execution_conflict" };
    const invocation = this.invocations.get(invocationKey(input.runId, input.attemptId, reservation.invocationId));
    if (!invocation) return { kind: "conflict", code: "invocation_execution_conflict" };
    const executionStartedAt = this.clock().toISOString();
    this.invocations.set(invocationKey(input.runId, input.attemptId, reservation.invocationId), { ...invocation, status: "executing" });
    this.reservations.set(input.reservationId, { ...reservation, status: "executing", executionStartedAt });
    return { kind: "started", executionStartedAt };
  }

  async readInvocation(input: ReadInvocationInput): Promise<NormalizedToolInvocation | null> {
    const invocation = this.invocations.get(invocationKey(input.runId, input.attemptId, input.invocationId));
    return invocation ? deepCopy(invocation) : null;
  }

  async readReservation(input: ReadReservationInput): Promise<StoredInvocationReservation | null> {
    const invocation = await this.readInvocation(input);
    if (!invocation) return null;
    const reservationId = this.reservationByRunIdempotencyKey.get(`${input.runId}\u0000${invocation.idempotencyKey}`);
    const reservation = reservationId ? this.reservations.get(reservationId) : undefined;
    return reservation ? deepCopy(reservation) : null;
  }

  async readInvocationByIdempotencyKey(
    input: ReadInvocationByIdempotencyKeyInput,
  ): Promise<InvocationReconciliationRecord | null> {
    const reservationId = this.reservationByRunIdempotencyKey.get(`${input.runId}\u0000${input.idempotencyKey}`);
    if (!reservationId) return null;
    const reservation = this.reservations.get(reservationId);
    if (!reservation || reservation.runId !== input.runId) return null;
    const invocation = this.invocations.get(invocationKey(reservation.runId, reservation.attemptId, reservation.invocationId));
    if (!invocation) return null;
    const receiptId = this.receiptByReservation.get(reservation.reservationId);
    return deepCopy({
      reservation,
      invocation,
      receipt: receiptId ? this.receipts.get(receiptKey(reservation.runId, reservation.attemptId, receiptId)) ?? null : null,
    });
  }

  async commitReceipt(input: CommitReceiptInput): Promise<CommitReceiptResult> {
    const reservation = this.reservations.get(input.reservationId);
    if (!reservation || reservation.runId !== input.runId || reservation.attemptId !== input.attemptId || reservation.invocationId !== input.receipt.invocationId) {
      if (!this.attemptForRun(input.runId, input.attemptId) || this.runs.get(input.runId)?.activeAttemptId !== input.attemptId) {
        return { kind: "conflict", code: "run_attempt_conflict" };
      }
      return { kind: "conflict", code: "invocation_reservation_conflict" };
    }
    if (input.receipt.runId !== input.runId || input.receipt.attemptId !== input.attemptId) {
      return { kind: "conflict", code: "run_attempt_conflict" };
    }
    const invocation = this.invocations.get(invocationKey(input.runId, input.attemptId, reservation.invocationId));
    if (!invocation || !this.receiptMatchesInvocation(input.receipt, invocation)) {
      return { kind: "conflict", code: "receipt_conflict" };
    }
    const existingReceiptId = this.receiptByReservation.get(input.reservationId);
    if (existingReceiptId) {
      const existing = this.receipts.get(receiptKey(input.runId, input.attemptId, existingReceiptId))!;
      return sameDocument(existing, input.receipt)
        ? { kind: "replay", receiptId: existing.receiptId }
        : { kind: "conflict", code: "receipt_conflict" };
    }
    if (!this.attemptForRun(input.runId, input.attemptId) || this.runs.get(input.runId)?.activeAttemptId !== input.attemptId) {
      return { kind: "conflict", code: "run_attempt_conflict" };
    }
    const leaseConflict = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
    if (leaseConflict) return { kind: "conflict", code: leaseConflict };
    if (reservation.status !== "executing" || reservation.executionStartedAt === undefined || invocation.status !== "executing") {
      return { kind: "conflict", code: "invocation_execution_conflict" };
    }
    const key = receiptKey(input.runId, input.attemptId, input.receipt.receiptId);
    const receiptWithSameId = this.receipts.get(key);
    if (receiptWithSameId && !sameDocument(receiptWithSameId, input.receipt)) return { kind: "conflict", code: "receipt_conflict" };
    this.receipts.set(key, input.receipt);
    this.receiptByReservation.set(input.reservationId, input.receipt.receiptId);
    const invocationKeyValue = invocationKey(input.runId, input.attemptId, reservation.invocationId);
    this.invocations.set(invocationKeyValue, { ...invocation, status: input.receipt.status });
    this.reservations.set(input.reservationId, { ...reservation, status: input.receipt.status });
    return { kind: "committed", receiptId: input.receipt.receiptId };
  }

  async commitReceiptWithPublicEvents(
    input: CommitReceiptWithPublicEventsInput,
  ): Promise<CommitReceiptWithPublicEventsResult> {
    assertPersistableJson(JSON.parse(JSON.stringify(input.receipt)) as JsonValue, "receipt");
    const reservation = this.reservations.get(input.reservationId);
    const existingReceiptId = this.receiptByReservation.get(input.reservationId);
    if (existingReceiptId) {
      const existing = this.receipts.get(receiptKey(input.runId, input.attemptId, existingReceiptId));
      const binding = this.receiptPublicEventBindings.get(input.reservationId);
      if (!existing || !binding || !sameDocument(existing, input.receipt)
        || !this.isValidReceiptPublicEvents(existing, binding.events)) {
        return { kind: "conflict", code: "receipt_public_event_conflict" };
      }
      return { kind: "replay", receiptId: existingReceiptId, events: deepCopy(binding.events) };
    }
    if (!reservation || reservation.runId !== input.runId || reservation.attemptId !== input.attemptId
      || reservation.invocationId !== input.receipt.invocationId) return { kind: "conflict", code: "invocation_reservation_conflict" };
    const invocation = this.invocations.get(invocationKey(input.runId, input.attemptId, reservation.invocationId));
    if (!invocation || !this.receiptMatchesInvocation(input.receipt, invocation)) return { kind: "conflict", code: "receipt_conflict" };
    if (!this.attemptForRun(input.runId, input.attemptId) || this.runs.get(input.runId)?.activeAttemptId !== input.attemptId) return { kind: "conflict", code: "run_attempt_conflict" };
    const leaseConflict = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
    if (leaseConflict) return { kind: "conflict", code: leaseConflict };
    if (reservation.status !== "executing" || reservation.executionStartedAt === undefined || invocation.status !== "executing") return { kind: "conflict", code: "invocation_execution_conflict" };
    const current = this.attemptForRun(input.runId, input.attemptId)?.lastEventSequence;
    if (current !== input.expectedSequence) return { kind: "conflict", code: "event_sequence_conflict", currentSequence: current };
    if (!input.receipt.outputArtifactId || input.receipt.verificationArtifactIds.some((id) => id !== input.receipt.outputArtifactId)
      || (input.receipt.verificationArtifactIds.length > 0 && input.receipt.status !== "succeeded")) return { kind: "conflict", code: "receipt_public_event_conflict" };
    const createdAt = this.clock().toISOString();
    const events: StoredEvent[] = [{
      schemaVersion: "meliora.session-event.v1", eventId: `event-${randomUUID()}`,
      runId: input.runId, attemptId: input.attemptId, sequence: input.expectedSequence + 1,
      kind: "tool_result_presented", visibility: "public", createdAt, causationId: input.receipt.receiptId,
      payload: { invocationId: input.receipt.invocationId, status: input.receipt.status, summary: input.receipt.effectSummary,
        artifactRefs: [{ artifactId: input.receipt.outputArtifactId, visibility: "public" }] },
    }];
    if (input.receipt.verificationArtifactIds.length > 0) events.push({
      schemaVersion: "meliora.session-event.v1", eventId: `event-${randomUUID()}`,
      runId: input.runId, attemptId: input.attemptId, sequence: input.expectedSequence + 2,
      kind: "verification_updated", visibility: "public", createdAt, causationId: input.receipt.receiptId,
      payload: { verificationId: `verification:${input.receipt.receiptId}`, status: "passed",
        evidenceRefs: input.receipt.verificationArtifactIds.map((artifactId) => ({ artifactId, visibility: "public" })) },
    });
    if (!this.isValidReceiptPublicEvents(input.receipt, events)) return { kind: "conflict", code: "receipt_public_event_conflict" };
    // The in-memory adapter models the SQLite transaction by restoring every
    // affected durable map when a test hook (or an unexpected write) throws.
    const receipts = deepCopy([...this.receipts]);
    const receiptByReservation = deepCopy([...this.receiptByReservation]);
    const bindings = deepCopy([...this.receiptPublicEventBindings]);
    const invocations = deepCopy([...this.invocations]);
    const reservations = deepCopy([...this.reservations]);
    const runEvents = deepCopy(this.events.get(input.runId) ?? []);
    const attempt = deepCopy(this.attemptForRun(input.runId, input.attemptId)!);
    try {
      this.receipts.set(receiptKey(input.runId, input.attemptId, input.receipt.receiptId), deepCopy(input.receipt));
      this.onReceiptPublicEventWrite?.("receipt");
      this.receiptByReservation.set(input.reservationId, input.receipt.receiptId);
      this.events.set(input.runId, [...runEvents, ...deepCopy(events)]);
      this.onReceiptPublicEventWrite?.("event");
      this.receiptPublicEventBindings.set(input.reservationId, { receiptId: input.receipt.receiptId, expectedSequence: input.expectedSequence, events: deepCopy(events) });
      this.onReceiptPublicEventWrite?.("binding");
      this.invocations.set(invocationKey(input.runId, input.attemptId, invocation.invocationId), { ...invocation, status: input.receipt.status });
      this.onReceiptPublicEventWrite?.("invocation");
      this.reservations.set(input.reservationId, { ...reservation, status: input.receipt.status });
      this.attempts.set(attemptKey(input.runId, input.attemptId), { ...attempt, lastEventSequence: input.expectedSequence + events.length });
      this.onReceiptPublicEventWrite?.("attempt");
    } catch (error) {
      this.receipts.clear(); for (const [key, value] of receipts) this.receipts.set(key, value);
      this.receiptByReservation.clear(); for (const [key, value] of receiptByReservation) this.receiptByReservation.set(key, value);
      this.receiptPublicEventBindings.clear(); for (const [key, value] of bindings) this.receiptPublicEventBindings.set(key, value);
      this.invocations.clear(); for (const [key, value] of invocations) this.invocations.set(key, value);
      this.reservations.clear(); for (const [key, value] of reservations) this.reservations.set(key, value);
      this.events.set(input.runId, runEvents);
      this.attempts.set(attemptKey(input.runId, input.attemptId), attempt);
      throw error;
    }
    return { kind: "committed", receiptId: input.receipt.receiptId, events: deepCopy(events) };
  }

  async readReceipt(input: ReadReceiptInput): Promise<ToolReceipt | null> {
    return this.receipts.get(receiptKey(input.runId, input.attemptId, input.receiptId)) ?? null;
  }

  async readReceiptPublicEventBinding(
    input: ReadReceiptPublicEventBindingInput,
  ): Promise<ReadReceiptPublicEventBindingResult> {
    const receipt = this.receipts.get(receiptKey(input.runId, input.attemptId, input.receiptId));
    const found = [...this.receiptPublicEventBindings.entries()].find(([reservationId, binding]) => {
      const reservation = this.reservations.get(reservationId);
      return binding.receiptId === input.receiptId && reservation?.runId === input.runId
        && reservation.attemptId === input.attemptId;
    });
    if (!receipt || !found || found[1].expectedSequence < 0
      || !found[1].events.every((event, index) => event.runId === input.runId && event.attemptId === input.attemptId
        && event.sequence === found[1].expectedSequence + index + 1)
      || !this.isValidReceiptPublicEvents(receipt, found[1].events)) return { kind: "missing" };
    const actual = (this.events.get(input.runId) ?? []).filter((event) =>
      event.attemptId === input.attemptId && event.sequence > found[1].expectedSequence
        && event.sequence <= found[1].expectedSequence + found[1].events.length,
    );
    if (actual.length !== found[1].events.length || !sameDocument(actual, found[1].events)) return { kind: "missing" };
    return { kind: "found", events: deepCopy(found[1].events) };
  }

  async stagePublicToolResultDerivative(
    input: StagePublicToolResultDerivativeInput,
  ): Promise<StagePublicToolResultDerivativeResult> {
    assertPersistableBytes(input.content, "staged_public_derivative.content");
    if (input.mediaType !== "text/plain" || hashBytes(input.content) !== input.contentHash) {
      return { kind: "conflict", code: "public_artifact_provenance_conflict" };
    }
    const originKey = stagedPublicArtifactOriginKey(input.runId, input.attemptId, input.invocationId);
    const existingAlias = this.stagedPublicArtifactAliasByOrigin.get(originKey);
    if (existingAlias) {
      const existing = this.stagedPublicArtifacts.get(existingAlias);
      if (!existing || !this.isValidStagedPublicArtifact(existing)
        || existing.sessionId !== input.sessionId || existing.reservationId !== input.reservationId
        || existing.manifest.contentHash !== input.contentHash || existing.manifest.mediaType !== input.mediaType
        || existing.manifest.byteLength !== input.content.byteLength) {
        return { kind: "conflict", code: "public_artifact_provenance_conflict" };
      }
      const artifact = this.artifacts.get(existing.physicalArtifactId)!;
      if (artifact.content.byteLength !== input.content.byteLength || !sameDocument(Array.from(artifact.content), Array.from(input.content))) {
        return { kind: "conflict", code: "public_artifact_provenance_conflict" };
      }
      return { kind: "replay", manifest: deepCopy(existing.manifest) };
    }

    const run = this.runs.get(input.runId);
    const attempt = this.attemptForRun(input.runId, input.attemptId);
    if (!run || !attempt || run.activeAttemptId !== input.attemptId || run.sessionId !== input.sessionId || attempt.sessionId !== input.sessionId) {
      return { kind: "conflict", code: "run_attempt_conflict" };
    }
    const leaseConflict = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
    if (leaseConflict) return { kind: "conflict", code: leaseConflict };
    const reservation = this.reservations.get(input.reservationId);
    const invocation = this.invocations.get(invocationKey(input.runId, input.attemptId, input.invocationId));
    if (!reservation || !invocation || reservation.runId !== input.runId || reservation.attemptId !== input.attemptId
      || reservation.invocationId !== input.invocationId || reservation.status !== "executing"
      || reservation.executionStartedAt === undefined || invocation.status !== "executing") {
      return { kind: "conflict", code: "invocation_execution_conflict" };
    }

    const alias = `public-artifact-${this.nextPublicArtifactAliasNonce()}`;
    const physicalArtifactId = `staged-public-physical-${this.nextPublicArtifactPhysicalNonce()}`;
    if (this.stagedPublicArtifacts.has(alias) || this.artifacts.has(alias) || this.artifacts.has(physicalArtifactId)) {
      return { kind: "conflict", code: "public_artifact_provenance_conflict" };
    }
    const createdAt = this.clock().toISOString();
    const manifest: StagedPublicArtifactManifest = {
      artifactId: alias, visibility: "public", contentHash: input.contentHash, mediaType: "text/plain",
      byteLength: input.content.byteLength, createdAt, projectionKind: "tool_result",
    };
    const physicalArtifact: Artifact = {
      artifactId: physicalArtifactId, contentHash: input.contentHash, mediaType: "text/plain",
      byteLength: input.content.byteLength, visibility: "private", createdAt, content: new Uint8Array(input.content),
    };
    const provenance: StagedPublicArtifactProvenance = {
      manifest, physicalArtifactId, runId: input.runId, sessionId: input.sessionId,
      originAttemptId: input.attemptId, originInvocationId: input.invocationId, reservationId: input.reservationId,
    };
    // Validation completed before the synchronous critical section. These paired
    // writes model SQLite's BEGIN IMMEDIATE provenance transaction.
    this.artifacts.set(physicalArtifactId, physicalArtifact);
    this.stagedPublicArtifacts.set(alias, provenance);
    this.stagedPublicArtifactAliasByOrigin.set(originKey, alias);
    this.stagedPublicArtifactAliasByPhysicalId.set(physicalArtifactId, alias);
    return { kind: "staged", manifest: deepCopy(manifest) };
  }

  async resolveStagedPublicArtifact(
    input: ResolveStagedPublicArtifactInput,
  ): Promise<ResolveStagedPublicArtifactResult> {
    const provenance = this.stagedPublicArtifacts.get(input.artifactId);
    if (!provenance || provenance.runId !== input.runId || provenance.sessionId !== input.sessionId
      || !this.isValidStagedPublicArtifact(provenance)) return { kind: "not_found" };
    return { kind: "found", manifest: deepCopy(provenance.manifest) };
  }

  async authorizePublicArtifactRef(
    input: AuthorizePublicArtifactRefInput,
  ): Promise<AuthorizePublicArtifactRefResult> {
    const provenance = this.stagedPublicArtifacts.get(input.artifactId);
    if (!provenance || provenance.runId !== input.runId || provenance.sessionId !== input.sessionId
      || !this.isValidStagedPublicArtifact(provenance)) return { kind: "rejected" };
    const commandKey = this.commandScopeByRunId.get(input.runId);
    const command = commandKey ? this.commands.get(commandKey) : undefined;
    if (!command || command.localPrincipalId !== input.localPrincipalId
      || command.sessionId !== input.sessionId || command.runId !== input.runId) return { kind: "rejected" };
    const receiptId = this.receiptByReservation.get(provenance.reservationId);
    const receipt = receiptId
      ? this.receipts.get(receiptKey(input.runId, provenance.originAttemptId, receiptId))
      : undefined;
    const invocation = this.invocations.get(invocationKey(input.runId, provenance.originAttemptId, provenance.originInvocationId));
    if (!receipt || receipt.runId !== input.runId || receipt.attemptId !== provenance.originAttemptId
      || receipt.invocationId !== provenance.originInvocationId
      || receipt.outputArtifactId !== input.artifactId || !invocation
      || !this.receiptMatchesInvocation(receipt, invocation)) return { kind: "rejected" };
    const binding = this.receiptPublicEventBindings.get(provenance.reservationId);
    if (!binding || binding.receiptId !== receipt.receiptId
      || !binding.events.every((event, index) => event.runId === input.runId && event.attemptId === receipt.attemptId
        && event.sequence === binding.expectedSequence + index + 1)
      || !this.isValidReceiptPublicEvents(receipt, binding.events)) return { kind: "rejected" };
    if (input.eventBinding.kind === "tool_result_presented"
      && (input.eventBinding.invocationId !== provenance.originInvocationId
        || input.eventBinding.status !== receipt.status)) return { kind: "rejected" };
    if (input.eventBinding.kind === "verification_updated"
      && !receipt.verificationArtifactIds.includes(input.artifactId)) return { kind: "rejected" };
    return { kind: "authorized", manifest: deepCopy(provenance.manifest) };
  }

  async authorizePublicStoredEvent(
    input: AuthorizePublicStoredEventInput,
  ): Promise<AuthorizePublicStoredEventResult> {
    const commandKey = this.commandScopeByRunId.get(input.event.runId);
    const command = commandKey ? this.commands.get(commandKey) : undefined;
    if (!command || command.localPrincipalId !== input.localPrincipalId
      || command.sessionId !== input.sessionId) return { kind: "rejected" };
    if (input.event.kind !== "tool_result_presented" && input.event.kind !== "verification_updated") {
      return { kind: "authorized" };
    }
    const binding = [...this.receiptPublicEventBindings.entries()].find(([, candidate]) =>
      candidate.events.some((event) => sameDocument(event, input.event)));
    if (!binding) return { kind: "rejected" };
    const reservation = this.reservations.get(binding[0]);
    const receipt = reservation ? this.receipts.get(receiptKey(input.event.runId, reservation.attemptId, binding[1].receiptId)) : undefined;
    const invocation = reservation ? this.invocations.get(invocationKey(input.event.runId, reservation.attemptId, reservation.invocationId)) : undefined;
    if (!reservation || !receipt || !invocation || binding[1].receiptId !== receipt.receiptId
      || reservation.runId !== input.event.runId || reservation.attemptId !== input.event.attemptId
      || !binding[1].events.every((event, index) => event.runId === input.event.runId && event.attemptId === input.event.attemptId
        && event.sequence === binding[1].expectedSequence + index + 1)
      || !this.receiptMatchesInvocation(receipt, invocation)
      || !this.isValidReceiptPublicEvents(receipt, binding[1].events)) {
      return { kind: "rejected" };
    }
    return { kind: "authorized" };
  }

  async putArtifact(input: PutArtifactInput): Promise<ArtifactRef> {
    assertPersistableJson(input.metadata ?? null, "artifact.metadata");
    if (hashBytes(input.content) !== input.contentHash) throw new Error("artifact_content_hash_conflict");
    const prior = this.artifacts.get(input.artifactId);
    if (prior) {
      if (
        prior.contentHash !== input.contentHash
        || prior.mediaType !== input.mediaType
        || prior.visibility !== input.visibility
        || prior.createdAt !== input.createdAt
        || prior.content.byteLength !== input.content.byteLength
        || !sameDocument(prior.metadata ?? null, input.metadata ?? null)
      ) throw new Error("artifact_conflict");
      return deepCopy({ artifactId: prior.artifactId, contentHash: prior.contentHash, mediaType: prior.mediaType, byteLength: prior.byteLength, visibility: prior.visibility });
    }
    const artifact: Artifact = {
      artifactId: input.artifactId,
      contentHash: input.contentHash,
      mediaType: input.mediaType,
      byteLength: input.content.byteLength,
      visibility: input.visibility,
      createdAt: input.createdAt,
      content: new Uint8Array(input.content),
      metadata: input.metadata === undefined ? undefined : deepCopy(input.metadata),
    };
    this.artifacts.set(artifact.artifactId, deepCopy(artifact));
    const { content: _content, createdAt: _createdAt, metadata: _metadata, ...reference } = artifact;
    return deepCopy(reference);
  }

  async getArtifact(id: string): Promise<Artifact | null> {
    const artifact = this.artifacts.get(id);
    if (!artifact) return null;
    if (hashBytes(artifact.content) !== artifact.contentHash) throw new Error("artifact_hash_drift");
    return deepCopy(artifact);
  }

  async acquireLease(input: LeaseRequest): Promise<LeaseResult> {
    this.requireTtl(input.ttlMs);
    assertValidCommandTimestamp(input.requestedAt);
    if (!this.attemptForRun(input.runId, input.attemptId)) {
      return { kind: "conflict", code: "run_attempt_conflict" };
    }
    const run = this.runs.get(input.runId);
    if (!run || run.activeAttemptId !== input.attemptId) {
      return { kind: "conflict", code: "run_attempt_conflict" };
    }
    if (this.isC2bPristineAttempt(input.runId, input.attemptId)) {
      return { kind: "conflict", code: "run_attempt_conflict" };
    }
    const activeLease = this.activeLeaseForRun(input.runId);
    if (activeLease) return { kind: "held", expiresAt: activeLease.expiresAt };
    const lease = this.newLease(input.ownerId, input.ttlMs);
    this.leases.set(attemptKey(input.runId, input.attemptId), lease);
    return { kind: "acquired", leaseToken: lease.token, expiresAt: lease.expiresAt };
  }

  async renewLease(input: LeaseRenewal): Promise<boolean> {
    this.requireTtl(input.ttlMs);
    assertValidCommandTimestamp(input.renewedAt);
    const key = attemptKey(input.runId, input.attemptId);
    const lease = this.leases.get(key);
    if (!lease || lease.token !== input.leaseToken || this.isExpired(lease)) return false;
    this.leases.set(key, {
      ...lease,
      expiresAt: this.expiresAt(this.clock().toISOString(), input.ttlMs),
    });
    return true;
  }

  private newLease(ownerId: string, ttlMs: number): Lease {
    return { token: this.nextLeaseToken(), ownerId, expiresAt: this.expiresAt(this.clock().toISOString(), ttlMs) };
  }

  private expiresAt(requestedAt: string, ttlMs: number): string {
    return new Date(Date.parse(requestedAt) + ttlMs).toISOString();
  }

  private isExpired(lease: Lease): boolean {
    return this.clock().getTime() >= Date.parse(lease.expiresAt);
  }

  private activeLeaseForRun(runId: string): Lease | null {
    const prefix = `${runId}\u0000`;
    for (const [key, lease] of this.leases) {
      if (key.startsWith(prefix) && !this.isExpired(lease)) return lease;
    }
    return null;
  }

  private attemptForRun(runId: string, attemptId: string): PersistedRunAttempt | null {
    const attempt = this.attempts.get(attemptKey(runId, attemptId));
    return attempt?.runId === runId ? attempt : null;
  }

  /** Generic lease/attempt APIs must not bypass C.2b's proof-bearing reclaim. */
  private isC2bPristineAttempt(runId: string, attemptId: string): boolean {
    const run = this.runs.get(runId);
    const active = this.attemptForRun(runId, attemptId);
    const key = this.commandScopeByRunId.get(runId);
    const command = key === undefined ? undefined : this.commands.get(key);
    if (!run || !active || !command || run.activeAttemptId !== attemptId || run.latestAttemptNumber !== 2
      || active.attemptNumber !== 2
      || (command.status !== "reserved" && command.status !== "accepted")) return false;
    const initial = this.attemptForRun(runId, command.initialAttemptId);
    // Broad recovery-attempt identity, not the reclaim proof: malformed
    // history must close generic lease/attempt paths rather than reopen them.
    return command.attemptId === command.initialAttemptId
      && initial?.attemptNumber === 1
      && initial.attemptId !== active.attemptId;
  }

  private isValidStagedPublicArtifact(provenance: StagedPublicArtifactProvenance): boolean {
    const run = this.runs.get(provenance.runId);
    const attempt = this.attemptForRun(provenance.runId, provenance.originAttemptId);
    const reservation = this.reservations.get(provenance.reservationId);
    const invocation = this.invocations.get(invocationKey(
      provenance.runId,
      provenance.originAttemptId,
      provenance.originInvocationId,
    ));
    const artifact = this.artifacts.get(provenance.physicalArtifactId);
    return !!run && !!attempt && run.sessionId === provenance.sessionId && attempt.sessionId === provenance.sessionId
      && !!reservation && reservation.runId === provenance.runId && reservation.attemptId === provenance.originAttemptId
      && reservation.invocationId === provenance.originInvocationId && !!invocation
      && invocation.runId === provenance.runId && invocation.attemptId === provenance.originAttemptId
      && invocation.invocationId === provenance.originInvocationId
      && this.stagedPublicArtifactAliasByOrigin.get(stagedPublicArtifactOriginKey(
        provenance.runId, provenance.originAttemptId, provenance.originInvocationId,
      )) === provenance.manifest.artifactId
      && this.stagedPublicArtifacts.get(provenance.manifest.artifactId) === provenance
      && this.stagedPublicArtifactAliasByPhysicalId.get(provenance.physicalArtifactId) === provenance.manifest.artifactId
      && !!artifact && artifact.visibility === "private" && artifact.mediaType === "text/plain"
      && artifact.createdAt === provenance.manifest.createdAt && artifact.contentHash === provenance.manifest.contentHash
      && artifact.content.byteLength === artifact.byteLength && artifact.byteLength === provenance.manifest.byteLength
      && hashBytes(artifact.content) === artifact.contentHash
      && provenance.manifest.visibility === "public" && provenance.manifest.projectionKind === "tool_result"
      && provenance.manifest.mediaType === artifact.mediaType;
  }

  private isValidReceiptPublicEvents(receipt: ToolReceipt, events: readonly StoredEvent[]): boolean {
    if (!receipt.outputArtifactId || receipt.verificationArtifactIds.some((id) => id !== receipt.outputArtifactId)
      || (receipt.verificationArtifactIds.length > 0 && receipt.status !== "succeeded")) return false;
    if (events.length !== (receipt.verificationArtifactIds.length > 0 ? 2 : 1)) return false;
    const tool = events[0];
    if (!tool || tool.visibility !== "public" || tool.kind !== "tool_result_presented" || !this.receiptAliasAuthorized(receipt)) return false;
    const payload = tool.payload as Record<string, unknown>;
    if (payload.invocationId !== receipt.invocationId || payload.status !== receipt.status || payload.summary !== receipt.effectSummary
      || !sameDocument(payload.artifactRefs, [{ artifactId: receipt.outputArtifactId, visibility: "public" }])) return false;
    if (receipt.verificationArtifactIds.length === 0) return true;
    const verification = events[1]; const verificationPayload = verification?.payload as Record<string, unknown>;
    return !!verification && verification.visibility === "public" && verification.kind === "verification_updated"
      && verificationPayload.status === "passed"
      && sameDocument(verificationPayload.evidenceRefs, receipt.verificationArtifactIds.map((artifactId) => ({ artifactId, visibility: "public" })));
  }

  private receiptAliasAuthorized(receipt: ToolReceipt): boolean {
    if (!receipt.outputArtifactId) return false;
    const provenance = this.stagedPublicArtifacts.get(receipt.outputArtifactId);
    return !!provenance && this.isValidStagedPublicArtifact(provenance)
      && provenance.originInvocationId === receipt.invocationId && provenance.originAttemptId === receipt.attemptId;
  }

  private receiptMatchesInvocation(receipt: ToolReceipt, invocation: NormalizedToolInvocation): boolean {
    return receipt.invocationId === invocation.invocationId &&
      receipt.runId === invocation.runId &&
      receipt.attemptId === invocation.attemptId &&
      receipt.toolName === invocation.toolName &&
      receipt.toolVersion === invocation.toolVersion &&
      receipt.argumentsHash === invocation.argumentsHash &&
      receipt.catalogHash === invocation.catalogHash;
  }

  private assertRecoveryLimit(limit: number, maximum: number, message: string): void {
    if (!Number.isInteger(limit) || limit < 1 || limit > maximum) throw new TypeError(message);
  }

  private requireTtl(ttlMs: number): void {
    if (!Number.isInteger(ttlMs) || ttlMs < 1) throw new TypeError("lease_ttl_invalid");
  }

  private assertSnapshotIntegrity(snapshot: RunSnapshot): void {
    assertValidRunSnapshot(snapshot);
    const terminal = snapshot.state.terminalModelStepResult;
    if (!terminal) return;
    const checkpoint = this.modelSteps.get(modelStepKey(snapshot.runId, terminal.modelStepId));
    if (
      terminal.attemptId !== snapshot.attemptId
      || !checkpoint
      || checkpoint.status !== "terminal"
      || checkpoint.attemptId !== terminal.attemptId
      || checkpoint.requestFingerprint !== terminal.requestFingerprint
    ) throw new Error("snapshot_integrity_conflict");
  }

  /** The terminal result row and private Snapshot binding must exist together. */
  private assertTerminalResultSnapshotInvariant(
    runId: string,
    snapshot: RunSnapshot | null,
  ): TerminalModelStepResultRef | null {
    const rows = [...this.terminalModelStepResults.entries()]
      .filter(([key]) => key.startsWith(`${runId}\u0000`));
    const histories = [...this.terminalSnapshotHistory.values()]
      .filter((history) => history.snapshot.runId === runId);
    if (rows.length !== histories.length) throw new Error("snapshot_integrity_conflict");
    if (rows.length === 0) {
      if (snapshot?.state.terminalModelStepResult) throw new Error("snapshot_integrity_conflict");
      return null;
    }
    for (const [, result] of rows) {
      const history = this.terminalSnapshotHistory.get(result.snapshotId);
      const artifact = this.artifacts.get(result.artifact.artifactId);
      const checkpoint = this.modelSteps.get(modelStepKey(runId, result.modelStepId));
      if (!history || history.commitOrdinal !== result.commitOrdinal || history.commitOrdinal <= 0 || history.snapshot.attemptId !== result.attemptId || history.snapshot.throughSequence !== result.throughSequence
        || result.stateHash !== hashBytes(canonicalJson(history.snapshot.state))
        || result.snapshotEnvelopeHash !== hashBytes(canonicalJson(history.snapshot))
        || !sameDocument(history.snapshot.state.terminalModelStepResult, { attemptId: result.attemptId, modelStepId: result.modelStepId, requestFingerprint: result.requestFingerprint, artifact: result.artifact })
        || !checkpoint || checkpoint.status !== "terminal" || checkpoint.finishedAt !== result.finishedAt
        || !artifact || hashBytes(artifact.content) !== artifact.contentHash
        || !sameDocument({ artifactId: artifact.artifactId, contentHash: artifact.contentHash, mediaType: artifact.mediaType, byteLength: artifact.byteLength, visibility: artifact.visibility }, result.artifact)
      ) throw new Error("snapshot_integrity_conflict");
      this.assertSnapshotIntegrity(history.snapshot);
    }
    if (new Set(histories.map((history) => history.commitOrdinal)).size !== histories.length) throw new Error("snapshot_integrity_conflict");
    const latestHistory = histories.reduce((latest, history) => history.commitOrdinal > latest.commitOrdinal ? history : latest);
    const latest = rows.find(([, row]) => row.snapshotId === latestHistory.snapshot.snapshotId)?.[1];
    if (!latest) throw new Error("snapshot_integrity_conflict");
    if (!snapshot || latest.commitOrdinal !== latestHistory.commitOrdinal || latest.snapshotEnvelopeHash !== hashBytes(canonicalJson(snapshot)) || !sameDocument(snapshot, latestHistory.snapshot)) throw new Error("snapshot_integrity_conflict");
    return { attemptId: latest.attemptId, modelStepId: latest.modelStepId, requestFingerprint: latest.requestFingerprint, artifact: latest.artifact };
  }

  private leaseConflict(runId: string, attemptId: string, leaseToken: string): "lease_not_held" | "lease_expired" | null {
    const lease = this.leases.get(attemptKey(runId, attemptId));
    if (!lease || lease.token !== leaseToken) return "lease_not_held";
    return this.isExpired(lease) ? "lease_expired" : null;
  }
}
