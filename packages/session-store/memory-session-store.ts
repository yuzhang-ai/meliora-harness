import type {
  AppendEventsInput,
  AppendEventsResult,
  Artifact,
  ArtifactRef,
  BeginInvocationExecutionInput,
  BeginInvocationExecutionResult,
  CommitReceiptInput,
  CommitReceiptResult,
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
  InvocationReservationInput,
  LeaseRenewal,
  LeaseRequest,
  LeaseResult,
  PersistedRunAttempt,
  PersistedRunRecord,
  PutArtifactInput,
  ReadLatestModelStepInput,
  ReadModelStepInput,
  ReadPrivateUserInputInput,
  ReadEventsInput,
  ReadInvocationInput,
  ReadInvocationByIdempotencyKeyInput,
  ReadReceiptInput,
  ReadReservationInput,
  RecoveryBundle,
  RecoveryBundleInput,
  RecoveryBundleResult,
  RecoveryCommandPage,
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
} from "./contracts";
import { randomUUID } from "node:crypto";
import { assertValidRunSnapshot, PRIVATE_TERMINAL_MODEL_STEP_RESULT_MEDIA_TYPE } from "./contracts";
import type { NormalizedToolInvocation, ToolReceipt } from "../tool-runtime/contracts";
import {
  assertValidCommandTimestamp,
  assertValidGeneratedId,
  assertValidIdempotencyKey,
  assertValidLocalPrincipalId,
  assertValidModelStepFingerprint,
  assertValidReserveRunCommandInput,
  assertValidSafeCode,
  assertValidWorkspaceId,
  canTransitionRunCommand,
  privateUserInputContentHash,
} from "./run-command-contract";
import { assertPersistableBytes, assertPersistableJson } from "./src/sensitive-data";
import { canonicalJson, hashBytes } from "./src/integrity";

type Lease = Readonly<{ token: string; ownerId: string; expiresAt: string }>;

type MemorySessionStoreOptions = Readonly<{
  clock?: () => Date;
  nextLeaseToken?: () => string;
  nextReservationId?: () => string;
  /** Test-only hooks. Public aliases and private physical IDs have separate nonce sources. */
  nextPublicArtifactAliasNonce?: () => string;
  nextPublicArtifactPhysicalNonce?: () => string;
  /** Test-only adapter hook; validates atomic rollback without changing the Port. */
  onAtomicTerminalWrite?: (stage: "artifact" | "checkpoint" | "terminal_result" | "snapshot") => void;
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
  private readonly onAtomicTerminalWrite?: MemorySessionStoreOptions["onAtomicTerminalWrite"];

  constructor(options: MemorySessionStoreOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.nextLeaseToken = options.nextLeaseToken ?? (() => `lease-${++this.leaseSequence}`);
    this.nextReservationId = options.nextReservationId ?? (() => `reservation-${++this.reservationSequence}`);
    this.nextPublicArtifactAliasNonce = options.nextPublicArtifactAliasNonce ?? (() => randomUUID());
    this.nextPublicArtifactPhysicalNonce = options.nextPublicArtifactPhysicalNonce ?? (() => randomUUID());
    this.onAtomicTerminalWrite = options.onAtomicTerminalWrite;
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
    if (
      event.schemaVersion !== "meliora.session-event.v1"
      || event.kind !== expectedKind
      || event.visibility !== "public"
    ) {
      return { kind: "conflict", code: "command_status_conflict" };
    }
    assertValidGeneratedId(event.eventId);
    assertValidCommandTimestamp(event.createdAt);
    assertPersistableJson(event.payload, "terminal_event.payload");

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
    const expectedEvent: StoredEvent = {
      ...event,
      runId: input.runId,
      attemptId: input.attemptId,
      sequence: input.expectedSequence + 1,
    };
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

  async readPrivateUserInput(input: ReadPrivateUserInputInput): Promise<StoredPrivateUserInput | null> {
    const record = this.privateUserInputs.get(input.turnId);
    return record?.sessionId === input.sessionId ? deepCopy(record) : null;
  }

  async listRecoverableCommands(input: Readonly<{ limit: number }>): Promise<RecoveryCommandPage> {
    this.assertRecoveryLimit(input.limit, 64, "invalid_recovery_command_limit");
    const commands: RecoverableCommandRef[] = [...this.commands.values()]
      .filter((command) => command.status !== "terminal")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.runId.localeCompare(right.runId))
      .map((command) => ({ runId: command.runId, initialAttemptId: command.initialAttemptId, status: command.status, createdAt: command.createdAt }));
    return { commands: deepCopy(commands.slice(0, input.limit)), sweepComplete: commands.length <= input.limit };
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
      assertValidGeneratedId(event.eventId);
      assertValidCommandTimestamp(event.createdAt);
      assertPersistableJson(event.payload, "event.payload");
    }
    const attempt = this.attempts.get(attemptKey(input.runId, input.attemptId));
    if (!attempt) return { kind: "conflict", code: "run_attempt_conflict" };
    const leaseConflict = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
    if (leaseConflict) return { kind: "conflict", code: leaseConflict };
    if (attempt.lastEventSequence !== input.expectedSequence) {
      return { kind: "conflict", code: "event_sequence_conflict", currentSequence: attempt.lastEventSequence };
    }
    const previous = this.events.get(input.runId) ?? [];
    const appended = input.events.map((event, index): StoredEvent => ({
      ...event,
      runId: input.runId,
      attemptId: input.attemptId,
      sequence: input.expectedSequence + index + 1,
    }));
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

  async readReceipt(input: ReadReceiptInput): Promise<ToolReceipt | null> {
    return this.receipts.get(receiptKey(input.runId, input.attemptId, input.receiptId)) ?? null;
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
