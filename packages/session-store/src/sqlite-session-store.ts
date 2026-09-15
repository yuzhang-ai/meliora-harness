import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import type { JsonValue } from "../../model-protocol/contracts.js";
import type { NormalizedToolInvocation, ToolReceipt } from "../../tool-runtime/contracts.js";
import type {
  AppendEventsInput, AppendEventsResult, Artifact, ArtifactRef, BeginInvocationExecutionInput,
  BeginInvocationExecutionResult, CommitReceiptInput, CommitReceiptResult,
  CommitReceiptWithPublicEventsInput, CommitReceiptWithPublicEventsResult,
  CommitTerminalModelStepResultAndSnapshotInput, CommitTerminalModelStepResultAndSnapshotResult,
  CreateRunAttemptInput, CreateRunAttemptResult, CreateRunInput, CreateSessionInput, CreateTurnInput,
  EventPage, EventLogPage, FinishModelStepInput, FinishModelStepResult, InvocationReconciliationRecord, NewEvent,
  InvocationReservationInput, LeaseRenewal, LeaseRequest, LeaseResult, PersistedRunAttempt,
  PersistedRunRecord, PutArtifactInput, ReadEventLogPageInput, ReadEventsInput, ReadLatestModelStepInput, ReadModelStepInput,
  ReadInvocationByIdempotencyKeyInput, ReadInvocationInput, ReadReceiptInput, ReadReceiptPublicEventBindingInput,
  ReadReceiptPublicEventBindingResult, ReadReservationInput,
  ReadPrivateUserInputInput, ReserveRunCommandInput, ReserveRunCommandResult, ReservationResult,
  RecoverableCommandRef, RecoveryBundle, RecoveryBundleInput, RecoveryBundleResult, RecoveryCommandPage, RecoveryCommandScanInput,
  RecoverAndSettleRunCommandWithTerminalEventInput, RecoverAndSettleRunCommandWithTerminalEventResult,
  ClaimInitialPreDispatchRunCommandForRecoveryInput, ClaimInitialPreDispatchRunCommandForRecoveryResult,
  ReclaimInitialPreDispatchExecutionAuthorityInput, ReclaimInitialPreDispatchExecutionAuthorityResult,
  RunCommandScope, RunCommandStatus, RunSnapshot, SessionRecord, SessionStorePort, StartModelStepInput,
  StartModelStepResult, StoredEvent, StoredInvocationReservation, StoredModelStepCheckpoint,
  StoredPrivateUserInput, StoredRunCommand, SettleRunCommandWithTerminalEventInput,
  SettleRunCommandWithTerminalEventResult, TransitionRunCommandInput, TransitionRunCommandResult,
  TurnRecord, WriteSnapshotInput, PrivateArtifactRef,
  StagePublicToolResultDerivativeInput, StagePublicToolResultDerivativeResult,
  ResolveStagedPublicArtifactInput, ResolveStagedPublicArtifactResult, StagedPublicArtifactManifest,
  AuthorizePublicArtifactRefInput, AuthorizePublicArtifactRefResult,
  AuthorizePublicStoredEventInput, AuthorizePublicStoredEventResult,
} from "../contracts.js";
import { assertValidRunSnapshot, PRIVATE_TERMINAL_MODEL_STEP_RESULT_MEDIA_TYPE } from "../contracts.js";
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
} from "../run-command-contract.js";
import { IdempotencyConflictError, SequenceConflictError, StoreIntegrityError } from "./errors.js";
import { canonicalJson, hashBytes } from "./integrity.js";
import { assertPersistableBytes, assertPersistableJson, assertPersistableText } from "./sensitive-data.js";

type Migration = Readonly<{ version: number; name: string; sql: string; checksum: string }>;
const loadMigration = (version: number, name: string): Migration => {
  const sql = readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
  return { version, name, sql, checksum: hashBytes(sql) };
};
const MIGRATIONS = [
  loadMigration(1, "0001_initial.sql"),
  loadMigration(2, "0002_durable_commands.sql"),
  loadMigration(3, "0003_private_recovery_primitives.sql"),
  loadMigration(4, "0004_public_artifact_provenance.sql"),
  loadMigration(5, "0005_receipt_public_events.sql"),
] as const;
const LATEST_MIGRATION_VERSION = MIGRATIONS.at(-1)!.version;
const RECOVERY_TERMINAL_EVENT_KEYS = new Set([
  "schemaVersion", "eventId", "kind", "visibility", "payload", "createdAt",
]);
const INITIAL_PRE_DISPATCH_STATUSES = ["preparing", "model_streaming"] as const;

/** Mirrors the ReadOnlyRunLoop's exact durable prefix before startModelStep. */
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
type Options = Readonly<{
  clock?: () => Date;
  nonce?: () => string;
  /** Test-only adapter hook; transaction rollback is the production guarantee. */
  onAtomicTerminalWrite?: (stage: "artifact" | "checkpoint" | "terminal_result" | "snapshot") => void;
  /** Test-only fault injector; SQLite transaction rollback is the guarantee. */
  onRecoveryAtomicWrite?: (stage: "attempt" | "lease" | "event" | "command" | "takeover_attempt" | "takeover_lease" | "takeover_run") => void;
}>;
type LeaseConflict = "lease_not_held" | "lease_expired";
type Row = Record<string, any>;

const requireId = (value: string, name: string): void => {
  if (!value || value.length > 200 || /[\u0000-\u001f]/u.test(value)) throw new TypeError(`${name} must be a non-empty bounded identifier.`);
};
const requireTimestamp = (value: string, name: string): void => {
  if (!Number.isFinite(Date.parse(value))) throw new TypeError(`${name} must be an ISO timestamp.`);
};
const json = (value: unknown): string => canonicalJson(JSON.parse(JSON.stringify(value)) as JsonValue);
const sameJson = (left: unknown, right: unknown): boolean => json(left) === json(right);
const isUniqueConstraint = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY";
};
const prepareDatabasePath = (databasePath: string): string => {
  if (databasePath === ":memory:") return databasePath;
  const resolved = resolve(databasePath);
  const parent = dirname(resolved);
  mkdirSync(parent, { recursive: true });
  if (lstatSync(parent).isSymbolicLink()) throw new Error("sqlite_parent_symlink_rejected");
  const realParent = realpathSync(parent);
  if (dirname(resolve(realParent, "database.sqlite")) !== realParent) throw new Error("sqlite_parent_resolution_failed");
  try {
    const target = lstatSync(resolved);
    if (target.isSymbolicLink() || !target.isFile()) throw new Error("sqlite_target_not_regular_file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return resolved;
};

export class SqliteSessionStore implements SessionStorePort {
  private readonly db: Database.Database;
  private readonly clock: () => Date;
  private readonly nonce: () => string;
  private readonly onAtomicTerminalWrite?: Options["onAtomicTerminalWrite"];
  private readonly onRecoveryAtomicWrite?: Options["onRecoveryAtomicWrite"];

  constructor(databasePath: string, options: Options = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.nonce = options.nonce ?? randomUUID;
    this.onAtomicTerminalWrite = options.onAtomicTerminalWrite;
    this.onRecoveryAtomicWrite = options.onRecoveryAtomicWrite;
    this.db = new Database(prepareDatabasePath(databasePath));
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = FULL");
    this.db.pragma("busy_timeout = 5000");
    try {
      this.applyMigrations();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  private applyMigrations(): void {
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)");
    this.verifyMigrationHistory();
    for (const migration of MIGRATIONS) {
      this.db.transaction(() => {
        const version = this.verifyMigrationHistory();
        if (version >= migration.version) return;
        if (version !== migration.version - 1) throw new StoreIntegrityError("migration_history_missing");
        this.db.exec(migration.sql);
        if (migration.version === 3) this.migrateLegacyInvocationExecutionBoundary();
        this.db.prepare("INSERT INTO schema_migrations VALUES (?,?,?,?)")
          .run(migration.version, migration.name, migration.checksum, this.clock().toISOString());
        this.db.pragma(`user_version = ${migration.version}`);
      }).immediate();
    }
    this.verifyMigrationHistory();
  }

  /** V2 cannot prove an execution boundary. Never convert it into a permit. */
  private migrateLegacyInvocationExecutionBoundary(): void {
    const rows = this.db.prepare(`
      SELECT i.reservation_id,i.invocation_json FROM invocations i
      LEFT JOIN receipts r ON r.reservation_id=i.reservation_id
      WHERE r.reservation_id IS NULL AND i.status IN ('reserved','executing')
    `).all() as Row[];
    for (const row of rows) {
      const invocation = JSON.parse(row.invocation_json) as Record<string, unknown>;
      const normalized = { ...invocation, status: "outcome_unknown" };
      const body = json(normalized);
      this.db.prepare("UPDATE invocations SET status='outcome_unknown',invocation_json=?,invocation_hash=?,execution_started_at=NULL WHERE reservation_id=?")
        .run(body, hashBytes(body), row.reservation_id);
    }
  }

  private verifyMigrationHistory(): number {
    const version = this.db.pragma("user_version", { simple: true }) as number;
    if (!Number.isInteger(version) || version < 0) throw new StoreIntegrityError("migration_history_drift");
    if (version > LATEST_MIGRATION_VERSION) throw new StoreIntegrityError("database_schema_is_newer");
    const rows = this.db.prepare("SELECT version,name,checksum FROM schema_migrations ORDER BY version").all() as Row[];
    if (rows.length !== version) throw new StoreIntegrityError("migration_history_missing");
    for (let index = 0; index < version; index += 1) {
      const expected = MIGRATIONS[index];
      const actual = rows[index];
      if (!expected || actual?.version !== expected.version || actual.name !== expected.name || actual.checksum !== expected.checksum) {
        throw new StoreIntegrityError("migration_history_drift");
      }
    }
    return version;
  }

  async reserveRunCommand(input: ReserveRunCommandInput): Promise<ReserveRunCommandResult> {
    assertValidReserveRunCommandInput(input);
    const inputHash = privateUserInputContentHash(input.userMessage);
    try {
      return this.db.transaction((): ReserveRunCommandResult => {
        const prior = this.db.prepare(
          "SELECT * FROM run_commands WHERE local_principal_id=? AND workspace_id=? AND idempotency_key=?",
        ).get(input.localPrincipalId, input.workspaceId, input.idempotencyKey) as Row | undefined;
        if (prior) {
          if (prior.canonical_request_hash !== input.canonicalRequestHash) {
            return { kind: "conflict", code: "idempotency_key_conflict" };
          }
          return { kind: "replay", command: this.toRunCommand(prior) };
        }

        const identityCollision = this.db.prepare(`
          SELECT 1 FROM sessions WHERE session_id=?
          UNION ALL SELECT 1 FROM turns WHERE turn_id=?
          UNION ALL SELECT 1 FROM runs WHERE run_id=?
          UNION ALL SELECT 1 FROM run_attempts WHERE attempt_id=?
          UNION ALL SELECT 1 FROM run_commands WHERE turn_id=? OR run_id=?
          LIMIT 1
        `).get(input.sessionId, input.turnId, input.runId, input.attemptId, input.turnId, input.runId);
        if (identityCollision) return { kind: "conflict", code: "command_identity_conflict" };

        this.db.prepare("INSERT INTO sessions VALUES (?,?,?,?)")
          .run(input.sessionId, input.workspaceId, input.reservedAt, input.reservedAt);
        this.db.prepare("INSERT INTO turns VALUES (?,?,?,?,?)")
          .run(input.turnId, input.sessionId, input.intentRevision, input.reservedAt, input.reservedAt);
        this.db.prepare("INSERT INTO runs VALUES (?,?,?,?,?,?,?)")
          .run(input.runId, input.turnId, input.sessionId, input.attemptId, 1, input.reservedAt, input.reservedAt);
        this.db.prepare("INSERT INTO run_attempts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
          .run(input.attemptId, input.runId, input.sessionId, input.turnId, 1, "created", 0, input.catalogHash, input.intentRevision, "null", input.reservedAt, input.reservedAt);
        this.db.prepare(`
          INSERT INTO run_commands (
            local_principal_id,workspace_id,idempotency_key,canonical_request_hash,
            session_id,turn_id,run_id,attempt_id,status,terminal_status,terminal_code,
            created_at,updated_at,accepted_at,dispatched_at,terminal_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          input.localPrincipalId, input.workspaceId, input.idempotencyKey, input.canonicalRequestHash,
          input.sessionId, input.turnId, input.runId, input.attemptId, "reserved", null, null,
          input.reservedAt, input.reservedAt, null, null, null,
        );
        this.db.prepare(`
          INSERT INTO run_command_inputs (
            run_id,session_id,turn_id,schema_version,role,visibility,content,content_hash,created_at
          ) VALUES (?,?,?,?,?,?,?,?,?)
        `).run(
          input.runId, input.sessionId, input.turnId, "meliora.private-user-input.v1", "user", "private",
          input.userMessage, inputHash, input.reservedAt,
        );
        const created = this.db.prepare("SELECT * FROM run_commands WHERE run_id=?").get(input.runId) as Row;
        return { kind: "owner", command: this.toRunCommand(created) };
      }).immediate();
    } catch (error) {
      if (isUniqueConstraint(error)) return { kind: "conflict", code: "command_identity_conflict" };
      throw error;
    }
  }

  async readRunCommand(input: RunCommandScope): Promise<StoredRunCommand | null> {
    this.validateRunCommandScope(input);
    const row = this.db.prepare(
      "SELECT * FROM run_commands WHERE local_principal_id=? AND workspace_id=? AND idempotency_key=?",
    ).get(input.localPrincipalId, input.workspaceId, input.idempotencyKey) as Row | undefined;
    return row ? this.toRunCommand(row) : null;
  }

  async transitionRunCommand(input: TransitionRunCommandInput): Promise<TransitionRunCommandResult> {
    this.validateRunCommandScope(input);
    assertValidGeneratedId(input.runId);
    assertValidGeneratedId(input.attemptId);
    assertValidCommandTimestamp(input.updatedAt);
    if ((input as { nextStatus: RunCommandStatus }).nextStatus === "dispatched") {
      return { kind: "conflict", code: "command_status_conflict" };
    }
    if (input.nextStatus === "terminal") {
      if (!input.terminalStatus) return { kind: "conflict", code: "command_status_conflict" };
      if (input.terminalCode !== undefined) assertValidSafeCode(input.terminalCode);
    } else if (input.terminalStatus !== undefined || input.terminalCode !== undefined) {
      return { kind: "conflict", code: "command_status_conflict" };
    }
    return this.db.transaction((): TransitionRunCommandResult => {
      const row = this.db.prepare(
        "SELECT * FROM run_commands WHERE local_principal_id=? AND workspace_id=? AND idempotency_key=?",
      ).get(input.localPrincipalId, input.workspaceId, input.idempotencyKey) as Row | undefined;
      if (!row) return { kind: "not_found", code: "run_command_not_found" };
      if (row.run_id !== input.runId || !this.isActiveAttempt(input.runId, input.attemptId)) {
        return { kind: "conflict", code: "run_attempt_conflict" };
      }
      const lease = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
      if (lease) return { kind: "conflict", code: lease };
      if (row.status === input.nextStatus) {
        const terminalMatches = input.nextStatus !== "terminal"
          || (row.terminal_status === input.terminalStatus && row.terminal_code === (input.terminalCode ?? null));
        return terminalMatches
          ? { kind: "replay", command: this.toRunCommand(row) }
          : { kind: "conflict", code: "command_status_conflict" };
      }
      if (row.status !== input.expectedStatus || !canTransitionRunCommand(row.status, input.nextStatus)) {
        return { kind: "conflict", code: "command_status_conflict" };
      }
      if (Date.parse(input.updatedAt) < Date.parse(row.updated_at)) {
        return { kind: "conflict", code: "command_status_conflict" };
      }

      const acceptedAt = input.nextStatus === "accepted" ? input.updatedAt : row.accepted_at;
      const terminalAt = input.nextStatus === "terminal" ? input.updatedAt : null;
      this.db.prepare(`
        UPDATE run_commands
        SET status=?,terminal_status=?,terminal_code=?,updated_at=?,accepted_at=?,dispatched_at=?,terminal_at=?
        WHERE run_id=? AND status=?
      `).run(
        input.nextStatus,
        input.nextStatus === "terminal" ? input.terminalStatus : null,
        input.nextStatus === "terminal" ? input.terminalCode ?? null : null,
        input.updatedAt, acceptedAt, row.dispatched_at, terminalAt, row.run_id, input.expectedStatus,
      );
      const updated = this.db.prepare("SELECT * FROM run_commands WHERE run_id=?").get(row.run_id) as Row;
      return { kind: "updated", command: this.toRunCommand(updated) };
    }).immediate();
  }

  async settleRunCommandWithTerminalEvent(
    input: SettleRunCommandWithTerminalEventInput,
  ): Promise<SettleRunCommandWithTerminalEventResult> {
    this.validateRunCommandScope(input);
    assertValidGeneratedId(input.runId);
    assertValidGeneratedId(input.attemptId);
    assertValidCommandTimestamp(input.updatedAt);
    if (input.terminalCode !== undefined) assertValidSafeCode(input.terminalCode);
    if (!Number.isInteger(input.expectedSequence) || input.expectedSequence < 0) {
      return { kind: "conflict", code: "event_sequence_conflict" };
    }
    const event = input.terminalEvent;
    assertPersistableNewEvent(event);
    if (
      event.schemaVersion !== "meliora.session-event.v1"
      || event.kind !== `run_${input.terminalStatus}`
      || event.visibility !== "public"
    ) {
      return { kind: "conflict", code: "command_status_conflict" };
    }
    return this.db.transaction((): SettleRunCommandWithTerminalEventResult => {
      const commandRow = this.db.prepare(
        "SELECT * FROM run_commands WHERE local_principal_id=? AND workspace_id=? AND idempotency_key=?",
      ).get(input.localPrincipalId, input.workspaceId, input.idempotencyKey) as Row | undefined;
      if (!commandRow) return { kind: "not_found", code: "run_command_not_found" };
      if (commandRow.run_id !== input.runId || !this.isActiveAttempt(input.runId, input.attemptId)) {
        return { kind: "conflict", code: "run_attempt_conflict" };
      }
      const lease = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
      if (lease) return { kind: "conflict", code: lease };
      const attempt = this.db.prepare(
        "SELECT * FROM run_attempts WHERE run_id=? AND attempt_id=?",
      ).get(input.runId, input.attemptId) as Row;
      const expectedEvent = toStoredEvent(event, input.runId, input.attemptId, input.expectedSequence + 1);
      const eventRow = this.db.prepare("SELECT * FROM events WHERE event_id=?")
        .get(event.eventId) as Row | undefined;

      if (commandRow.status === "terminal") {
        if (
          commandRow.terminal_status !== input.terminalStatus
          || commandRow.terminal_code !== (input.terminalCode ?? null)
          || attempt.last_event_sequence !== input.expectedSequence + 1
          || !eventRow
          || !sameJson(this.toEvent(eventRow), expectedEvent)
        ) return { kind: "conflict", code: "command_status_conflict" };
        return { kind: "replay", command: this.toRunCommand(commandRow), event: this.toEvent(eventRow) };
      }
      if (commandRow.status !== input.expectedCommandStatus || !canTransitionRunCommand(commandRow.status, "terminal")) {
        return { kind: "conflict", code: "command_status_conflict" };
      }
      if (Date.parse(input.updatedAt) < Date.parse(commandRow.updated_at)) {
        return { kind: "conflict", code: "command_status_conflict" };
      }
      if (attempt.last_event_sequence !== input.expectedSequence) {
        return { kind: "conflict", code: "event_sequence_conflict", currentSequence: attempt.last_event_sequence };
      }
      if (eventRow) return { kind: "conflict", code: "command_status_conflict" };

      const payload = canonicalJson(expectedEvent.payload);
      this.db.prepare("INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(
        expectedEvent.eventId, expectedEvent.runId, expectedEvent.attemptId, expectedEvent.sequence,
        expectedEvent.schemaVersion, expectedEvent.kind, expectedEvent.visibility, payload,
        hashBytes(json(expectedEvent)), expectedEvent.createdAt, expectedEvent.causationId ?? null,
        expectedEvent.correlationId ?? null,
      );
      this.db.prepare(
        "UPDATE run_attempts SET last_event_sequence=?,updated_at=? WHERE run_id=? AND attempt_id=?",
      ).run(expectedEvent.sequence, input.updatedAt, input.runId, input.attemptId);
      this.db.prepare(`
        UPDATE run_commands
        SET status='terminal',terminal_status=?,terminal_code=?,updated_at=?,terminal_at=?
        WHERE run_id=? AND status=?
      `).run(
        input.terminalStatus, input.terminalCode ?? null, input.updatedAt, input.updatedAt,
        input.runId, input.expectedCommandStatus,
      );
      const settled = this.db.prepare("SELECT * FROM run_commands WHERE run_id=?")
        .get(input.runId) as Row;
      return { kind: "settled", command: this.toRunCommand(settled), event: expectedEvent };
    }).immediate();
  }

  async recoverAndSettleRunCommandWithTerminalEvent(
    input: RecoverAndSettleRunCommandWithTerminalEventInput,
  ): Promise<RecoverAndSettleRunCommandWithTerminalEventResult> {
    this.validateRunCommandScope(input);
    assertValidGeneratedId(input.runId);
    assertValidGeneratedId(input.expectedActiveAttemptId);
    assertValidSafeCode(input.terminalCode);
    requireTimestamp(input.updatedAt, "updatedAt");
    if (input.expectedCommandStatus !== "dispatched") return { kind: "conflict", code: "command_status_conflict" };
    const recovery = input.recoveryAttempt;
    assertValidGeneratedId(recovery.attemptId);
    assertValidGeneratedId(recovery.ownerId);
    assertPersistableText(recovery.attemptId, "recovery_attempt.attemptId");
    assertPersistableText(recovery.ownerId, "recovery_attempt.ownerId");
    requireTimestamp(recovery.createdAt, "recoveryAttempt.createdAt");
    requireTimestamp(recovery.requestedAt, "recoveryAttempt.requestedAt");
    this.requireTtl(recovery.ttlMs);
    if (!Number.isInteger(input.expectedLatestAttemptNumber) || input.expectedLatestAttemptNumber < 1
      || !Number.isInteger(input.expectedSequence) || input.expectedSequence < 0
      || recovery.runId !== input.runId || recovery.expectedLatestAttemptNumber !== input.expectedLatestAttemptNumber) return { kind: "conflict", code: "run_attempt_conflict" };
    const event = input.terminalEvent;
    assertPersistableNewEvent(event);
    if (event.schemaVersion !== "meliora.session-event.v1" || event.kind !== "run_blocked" || event.visibility !== "public") {
      return { kind: "conflict", code: "command_status_conflict" };
    }
    if (Object.keys(event).some((key) => !RECOVERY_TERMINAL_EVENT_KEYS.has(key))) {
      return { kind: "conflict", code: "command_status_conflict" };
    }
    if (recovery.createdAt !== recovery.requestedAt || recovery.createdAt !== input.updatedAt || recovery.createdAt !== event.createdAt) {
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

    return this.db.transaction((): RecoverAndSettleRunCommandWithTerminalEventResult => {
      const commandRow = this.db.prepare(
        "SELECT * FROM run_commands WHERE local_principal_id=? AND workspace_id=? AND idempotency_key=?",
      ).get(input.localPrincipalId, input.workspaceId, input.idempotencyKey) as Row | undefined;
      if (!commandRow) return { kind: "not_found", code: "run_command_not_found" };
      const run = this.db.prepare("SELECT * FROM runs WHERE run_id=?").get(input.runId) as Row | undefined;
      if (!run || commandRow.run_id !== input.runId
        || run.active_attempt_id !== input.expectedActiveAttemptId
        || run.latest_attempt_number !== input.expectedLatestAttemptNumber
        || run.session_id !== recovery.sessionId || run.turn_id !== recovery.turnId) {
        return { kind: "conflict", code: "run_attempt_conflict" };
      }
      const active = this.db.prepare("SELECT * FROM run_attempts WHERE run_id=? AND attempt_id=?")
        .get(input.runId, run.active_attempt_id) as Row | undefined;
      if (!active || active.attempt_number !== input.expectedLatestAttemptNumber
        || active.catalog_hash !== recovery.catalogHash || active.intent_revision !== recovery.intentRevision
        || !!this.db.prepare("SELECT 1 FROM run_attempts WHERE run_id=? AND attempt_id=?").get(input.runId, recovery.attemptId)) {
        return { kind: "conflict", code: "run_attempt_conflict" };
      }
      const activeLease = this.db.prepare("SELECT expires_at FROM run_leases WHERE run_id=? AND expires_at>?")
        .get(input.runId, this.clock().toISOString()) as Row | undefined;
      if (activeLease) return { kind: "conflict", code: "lease_held" };
      if (commandRow.status !== input.expectedCommandStatus || Date.parse(input.updatedAt) < Date.parse(commandRow.updated_at)) {
        return { kind: "conflict", code: "command_status_conflict" };
      }
      if (active.last_event_sequence !== input.expectedSequence) {
        return { kind: "conflict", code: "event_sequence_conflict", currentSequence: active.last_event_sequence };
      }
      if (this.db.prepare("SELECT 1 FROM events WHERE event_id=?").get(event.eventId)) {
        return { kind: "conflict", code: "command_status_conflict" };
      }
      const attemptNumber = run.latest_attempt_number + 1;
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
      const leaseToken = this.nonce();
      const expiresAt = new Date(this.clock().getTime() + recovery.ttlMs).toISOString();
      this.db.prepare("INSERT INTO run_attempts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(
        recovery.attemptId, input.runId, run.session_id, run.turn_id, attemptNumber, "created", expectedEvent.sequence,
        active.catalog_hash, active.intent_revision, "null", recovery.createdAt, input.updatedAt,
      );
      this.onRecoveryAtomicWrite?.("attempt");
      this.db.prepare("UPDATE runs SET active_attempt_id=?,latest_attempt_number=?,updated_at=? WHERE run_id=?").run(
        recovery.attemptId, attemptNumber, recovery.createdAt, input.runId,
      );
      this.db.prepare("INSERT INTO run_leases VALUES (?,?,?,?,?)").run(
        input.runId, recovery.attemptId, recovery.ownerId, hashBytes(leaseToken), expiresAt,
      );
      this.onRecoveryAtomicWrite?.("lease");
      const payload = canonicalJson(expectedEvent.payload);
      this.db.prepare("INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(
        expectedEvent.eventId, expectedEvent.runId, expectedEvent.attemptId, expectedEvent.sequence,
        expectedEvent.schemaVersion, expectedEvent.kind, expectedEvent.visibility, payload,
        hashBytes(json(expectedEvent)), expectedEvent.createdAt, expectedEvent.causationId ?? null, expectedEvent.correlationId ?? null,
      );
      this.onRecoveryAtomicWrite?.("event");
      const commandUpdate = this.db.prepare(`
        UPDATE run_commands SET status='terminal',terminal_status='blocked',terminal_code=?,updated_at=?,terminal_at=?
        WHERE run_id=? AND status='dispatched'
      `).run(input.terminalCode, input.updatedAt, input.updatedAt, input.runId);
      if (commandUpdate.changes !== 1) throw new StoreIntegrityError("recovery_command_cas_conflict");
      this.onRecoveryAtomicWrite?.("command");
      const command = this.db.prepare("SELECT * FROM run_commands WHERE run_id=?").get(input.runId) as Row;
      const attempt = this.db.prepare("SELECT * FROM run_attempts WHERE run_id=? AND attempt_id=?")
        .get(input.runId, recovery.attemptId) as Row;
      return { kind: "settled", command: this.toRunCommand(command), event: expectedEvent, attempt: this.toAttempt(attempt) };
    }).immediate();
  }

  async claimInitialPreDispatchRunCommandForRecovery(
    input: ClaimInitialPreDispatchRunCommandForRecoveryInput,
  ): Promise<ClaimInitialPreDispatchRunCommandForRecoveryResult> {
    this.validateRunCommandScope(input);
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
    requireTimestamp(recovery.createdAt, "recoveryAttempt.createdAt");
    requireTimestamp(recovery.requestedAt, "recoveryAttempt.requestedAt");
    this.requireTtl(recovery.ttlMs);
    if (recovery.runId !== input.runId
      || recovery.expectedLatestAttemptNumber !== 1
      || recovery.attemptId === input.expectedInitialAttemptId
      || recovery.createdAt !== recovery.requestedAt) {
      return { kind: "conflict", code: "run_attempt_conflict" };
    }

    return this.db.transaction((): ClaimInitialPreDispatchRunCommandForRecoveryResult => {
      const commandRow = this.db.prepare(
        "SELECT * FROM run_commands WHERE local_principal_id=? AND workspace_id=? AND idempotency_key=?",
      ).get(input.localPrincipalId, input.workspaceId, input.idempotencyKey) as Row | undefined;
      if (!commandRow) return { kind: "not_found", code: "run_command_not_found" };
      const run = this.db.prepare("SELECT * FROM runs WHERE run_id=?").get(input.runId) as Row | undefined;
      if (!run || commandRow.run_id !== input.runId
        || commandRow.attempt_id !== input.expectedInitialAttemptId
        || run.active_attempt_id !== input.expectedInitialAttemptId
        || run.latest_attempt_number !== 1
        || commandRow.session_id !== run.session_id || commandRow.turn_id !== run.turn_id
        || recovery.sessionId !== run.session_id || recovery.turnId !== run.turn_id) {
        return { kind: "conflict", code: "run_attempt_conflict" };
      }
      const initialAttempt = this.db.prepare("SELECT * FROM run_attempts WHERE run_id=? AND attempt_id=?")
        .get(input.runId, input.expectedInitialAttemptId) as Row | undefined;
      const session = this.db.prepare("SELECT * FROM sessions WHERE session_id=?").get(run.session_id) as Row | undefined;
      const turn = this.db.prepare("SELECT * FROM turns WHERE turn_id=?").get(run.turn_id) as Row | undefined;
      const privateInput = this.db.prepare("SELECT * FROM run_command_inputs WHERE run_id=?").get(input.runId) as Row | undefined;
      const attemptCount = (this.db.prepare("SELECT COUNT(*) AS count FROM run_attempts WHERE run_id=?")
        .get(input.runId) as Row).count as number;
      if (!initialAttempt || initialAttempt.attempt_number !== 1
        // Attempt #1 is written by this adapter as the canonical literal
        // `null`. A parse-only check would let noncanonical / damaged storage
        // masquerade as the proven pristine pre-dispatch state.
        || initialAttempt.status !== "created" || initialAttempt.runtime_state_json !== "null"
        || initialAttempt.session_id !== run.session_id || initialAttempt.turn_id !== run.turn_id
        || initialAttempt.catalog_hash !== recovery.catalogHash || initialAttempt.intent_revision !== recovery.intentRevision
        || !session || session.session_id !== run.session_id || session.workspace_id !== commandRow.workspace_id
        || session.created_at !== commandRow.created_at || session.updated_at !== commandRow.created_at
        || !turn || turn.turn_id !== run.turn_id || turn.session_id !== run.session_id || turn.intent_revision !== initialAttempt.intent_revision
        || turn.created_at !== commandRow.created_at || turn.updated_at !== commandRow.created_at
        || !privateInput || privateInput.schema_version !== "meliora.private-user-input.v1"
        || privateInput.session_id !== run.session_id || privateInput.turn_id !== run.turn_id
        || privateInput.role !== "user" || privateInput.visibility !== "private"
        || privateInput.created_at !== commandRow.created_at || privateInput.content_hash !== privateUserInputContentHash(privateInput.content)
        || commandRow.canonical_request_hash !== canonicalRunCommandRequestHash({ workspaceId: commandRow.workspace_id, message: privateInput.content })
        || run.created_at !== commandRow.created_at || initialAttempt.created_at !== commandRow.created_at
        || this.db.prepare("SELECT 1 FROM run_attempts WHERE run_id=? AND attempt_id=?").get(input.runId, recovery.attemptId)) {
        return { kind: "conflict", code: "initial_recovery_not_safe" };
      }
      if (commandRow.status !== input.expectedCommandStatus) return { kind: "conflict", code: "command_status_conflict" };
      if (Date.parse(recovery.createdAt) < Date.parse(commandRow.updated_at)) return { kind: "conflict", code: "initial_recovery_not_safe" };

      // A crash can happen between durable reservation and the first lease
      // acquisition, so no initial lease is a valid no-worker proof. A lease
      // row with an invalid timestamp is data drift, while a live lease on
      // any Attempt of the Run is still authoritative.
      const leaseRows = this.db.prepare("SELECT expires_at FROM run_leases WHERE run_id=?")
        .all(input.runId) as Row[];
      for (const lease of leaseRows) {
        const expiresAt = Date.parse(lease.expires_at);
        if (!Number.isFinite(expiresAt)) return { kind: "conflict", code: "initial_recovery_not_safe" };
        if (expiresAt > this.clock().getTime()) return { kind: "conflict", code: "lease_held" };
      }
      if (attemptCount !== 1) return { kind: "conflict", code: "initial_recovery_not_safe" };
      if (initialAttempt.last_event_sequence !== input.expectedSequence) {
        return { kind: "conflict", code: "event_sequence_conflict", currentSequence: initialAttempt.last_event_sequence };
      }

      const eventRows = this.db.prepare("SELECT * FROM events WHERE run_id=? ORDER BY sequence ASC")
        .all(input.runId) as Row[];
      const events = eventRows.map((row) => this.toEvent(row));
      const hasUnsafeHistory =
        this.db.prepare("SELECT 1 FROM model_steps WHERE run_id=? LIMIT 1").get(input.runId) !== undefined
        || this.db.prepare("SELECT 1 FROM model_step_terminal_results WHERE run_id=? LIMIT 1").get(input.runId) !== undefined
        || this.db.prepare("SELECT 1 FROM run_snapshots WHERE run_id=? LIMIT 1").get(input.runId) !== undefined
        || this.db.prepare("SELECT 1 FROM run_snapshot_history WHERE run_id=? LIMIT 1").get(input.runId) !== undefined
        || this.db.prepare("SELECT 1 FROM invocations WHERE run_id=? LIMIT 1").get(input.runId) !== undefined
        || this.db.prepare("SELECT 1 FROM receipts WHERE run_id=? LIMIT 1").get(input.runId) !== undefined
        || this.db.prepare("SELECT 1 FROM receipt_public_event_bindings WHERE run_id=? LIMIT 1").get(input.runId) !== undefined
        || this.db.prepare("SELECT 1 FROM staged_public_artifact_provenance WHERE run_id=? LIMIT 1").get(input.runId) !== undefined;
      if (!hasOnlyInitialPreDispatchPrefix(events, input.runId, input.expectedInitialAttemptId, input.expectedCommandStatus, input.expectedSequence)
        || hasUnsafeHistory) return { kind: "conflict", code: "initial_recovery_not_safe" };

      const attemptNumber = 2;
      const leaseToken = this.nonce();
      const expiresAt = new Date(this.clock().getTime() + recovery.ttlMs).toISOString();
      this.db.prepare("INSERT INTO run_attempts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(
        recovery.attemptId, input.runId, run.session_id, run.turn_id, attemptNumber, "created", input.expectedSequence,
        initialAttempt.catalog_hash, initialAttempt.intent_revision, "null", recovery.createdAt, recovery.createdAt,
      );
      this.onRecoveryAtomicWrite?.("takeover_attempt");
      this.db.prepare("UPDATE runs SET active_attempt_id=?,latest_attempt_number=?,updated_at=? WHERE run_id=?").run(
        recovery.attemptId, attemptNumber, recovery.createdAt, input.runId,
      );
      this.onRecoveryAtomicWrite?.("takeover_run");
      this.db.prepare("INSERT INTO run_leases VALUES (?,?,?,?,?)").run(
        input.runId, recovery.attemptId, recovery.ownerId, hashBytes(leaseToken), expiresAt,
      );
      this.onRecoveryAtomicWrite?.("takeover_lease");
      const command = this.toRunCommand(commandRow);
      const attemptRow = this.db.prepare("SELECT * FROM run_attempts WHERE run_id=? AND attempt_id=?")
        .get(input.runId, recovery.attemptId) as Row;
      return { kind: "claimed", command, attempt: this.toAttempt(attemptRow), lease: { leaseToken, expiresAt }, continuation: continuationForPrefix(input.expectedSequence) };
    }).immediate();
  }

  async reclaimInitialPreDispatchExecutionAuthority(
    input: ReclaimInitialPreDispatchExecutionAuthorityInput,
  ): Promise<ReclaimInitialPreDispatchExecutionAuthorityResult> {
    this.validateRunCommandScope(input);
    assertValidGeneratedId(input.runId);
    assertValidGeneratedId(input.expectedInitialAttemptId);
    assertValidGeneratedId(input.expectedActiveAttemptId);
    assertValidGeneratedId(input.ownerId);
    assertPersistableText(input.ownerId, "reclaim.ownerId");
    requireTimestamp(input.requestedAt, "reclaim.requestedAt");
    this.requireTtl(input.ttlMs);
    if (input.expectedLatestAttemptNumber !== 2 || input.expectedActiveAttemptId === input.expectedInitialAttemptId
      || (input.expectedCommandStatus !== "reserved" && input.expectedCommandStatus !== "accepted")
      || !Number.isInteger(input.expectedSequence) || input.expectedSequence < 0) {
      return { kind: "conflict", code: "initial_recovery_not_safe" };
    }
    return this.db.transaction((): ReclaimInitialPreDispatchExecutionAuthorityResult => {
      const command = this.db.prepare("SELECT * FROM run_commands WHERE local_principal_id=? AND workspace_id=? AND idempotency_key=?")
        .get(input.localPrincipalId, input.workspaceId, input.idempotencyKey) as Row | undefined;
      if (!command) return { kind: "not_found", code: "run_command_not_found" };
      const run = this.db.prepare("SELECT * FROM runs WHERE run_id=?").get(input.runId) as Row | undefined;
      const initial = this.db.prepare("SELECT * FROM run_attempts WHERE run_id=? AND attempt_id=?")
        .get(input.runId, input.expectedInitialAttemptId) as Row | undefined;
      const active = this.db.prepare("SELECT * FROM run_attempts WHERE run_id=? AND attempt_id=?")
        .get(input.runId, input.expectedActiveAttemptId) as Row | undefined;
      const session = run ? this.db.prepare("SELECT * FROM sessions WHERE session_id=?").get(run.session_id) as Row | undefined : undefined;
      const turn = run ? this.db.prepare("SELECT * FROM turns WHERE turn_id=?").get(run.turn_id) as Row | undefined : undefined;
      const privateInput = this.db.prepare("SELECT * FROM run_command_inputs WHERE run_id=?").get(input.runId) as Row | undefined;
      const attemptCount = (this.db.prepare("SELECT COUNT(*) AS count FROM run_attempts WHERE run_id=?").get(input.runId) as Row).count as number;
      if (!run || !initial || !active
        || command.run_id !== input.runId || command.attempt_id !== input.expectedInitialAttemptId
        || run.active_attempt_id !== input.expectedActiveAttemptId || run.latest_attempt_number !== 2
        || initial.attempt_number !== 1 || active.attempt_number !== 2
        || initial.status !== "created" || active.status !== "created" || initial.runtime_state_json !== "null" || active.runtime_state_json !== "null"
        || initial.session_id !== run.session_id || initial.turn_id !== run.turn_id || active.session_id !== run.session_id || active.turn_id !== run.turn_id
        || command.session_id !== run.session_id || command.turn_id !== run.turn_id
        || !session || session.session_id !== run.session_id || session.workspace_id !== command.workspace_id
        || session.created_at !== command.created_at || session.updated_at !== command.created_at
        || !turn || turn.turn_id !== run.turn_id || turn.session_id !== run.session_id || turn.intent_revision !== initial.intent_revision
        || turn.created_at !== command.created_at || turn.updated_at !== command.created_at
        || !privateInput || privateInput.schema_version !== "meliora.private-user-input.v1" || privateInput.session_id !== run.session_id || privateInput.turn_id !== run.turn_id
        || privateInput.role !== "user" || privateInput.visibility !== "private" || privateInput.content_hash !== privateUserInputContentHash(privateInput.content)
        || privateInput.created_at !== command.created_at || run.created_at !== command.created_at || initial.created_at !== command.created_at
        || command.canonical_request_hash !== canonicalRunCommandRequestHash({ workspaceId: command.workspace_id, message: privateInput.content })
        || initial.catalog_hash !== active.catalog_hash || initial.intent_revision !== active.intent_revision
        || attemptCount !== 2 || active.last_event_sequence !== input.expectedSequence) {
        return { kind: "conflict", code: "initial_recovery_not_safe" };
      }
      if (command.status !== input.expectedCommandStatus) return { kind: "conflict", code: "command_status_conflict" };
      const rows = this.db.prepare("SELECT * FROM events WHERE run_id=? ORDER BY sequence ASC").all(input.runId) as Row[];
      const events = rows.map((row) => this.toEvent(row));
      const unsafe = this.db.prepare("SELECT 1 FROM model_steps WHERE run_id=? LIMIT 1").get(input.runId) !== undefined
        || this.db.prepare("SELECT 1 FROM model_step_terminal_results WHERE run_id=? LIMIT 1").get(input.runId) !== undefined
        || this.db.prepare("SELECT 1 FROM run_snapshots WHERE run_id=? LIMIT 1").get(input.runId) !== undefined
        || this.db.prepare("SELECT 1 FROM run_snapshot_history WHERE run_id=? LIMIT 1").get(input.runId) !== undefined
        || this.db.prepare("SELECT 1 FROM invocations WHERE run_id=? LIMIT 1").get(input.runId) !== undefined
        || this.db.prepare("SELECT 1 FROM receipts WHERE run_id=? LIMIT 1").get(input.runId) !== undefined
        || this.db.prepare("SELECT 1 FROM receipt_public_event_bindings WHERE run_id=? LIMIT 1").get(input.runId) !== undefined
        || this.db.prepare("SELECT 1 FROM staged_public_artifact_provenance WHERE run_id=? LIMIT 1").get(input.runId) !== undefined;
      const initialEventHead = events.filter((event) => event.attemptId === input.expectedInitialAttemptId).at(-1)?.sequence ?? 0;
      if (initial.last_event_sequence !== initialEventHead
        || !hasOnlyInitialPreDispatchPrefix(events, input.runId, [input.expectedInitialAttemptId, input.expectedActiveAttemptId], input.expectedCommandStatus, input.expectedSequence) || unsafe) {
        return { kind: "conflict", code: "initial_recovery_not_safe" };
      }
      const leaseRows = this.db.prepare("SELECT attempt_id,expires_at FROM run_leases WHERE run_id=?").all(input.runId) as Row[];
      if (!leaseRows.some((lease) => lease.attempt_id === input.expectedActiveAttemptId)) return { kind: "conflict", code: "initial_recovery_not_safe" };
      for (const lease of leaseRows) {
        const expiresAt = Date.parse(lease.expires_at);
        if (!Number.isFinite(expiresAt)) return { kind: "conflict", code: "initial_recovery_not_safe" };
        if (expiresAt > this.clock().getTime()) return { kind: "conflict", code: "lease_held" };
      }
      const leaseToken = this.nonce();
      const expiresAt = new Date(this.clock().getTime() + input.ttlMs).toISOString();
      const update = this.db.prepare("UPDATE run_leases SET owner_id=?,lease_token_hash=?,expires_at=? WHERE run_id=? AND attempt_id=?")
        .run(input.ownerId, hashBytes(leaseToken), expiresAt, input.runId, input.expectedActiveAttemptId);
      if (update.changes !== 1) throw new StoreIntegrityError("reclaim_lease_cas_conflict");
      return { kind: "reclaimed", command: this.toRunCommand(command), attempt: this.toAttempt(active), lease: { leaseToken, expiresAt }, continuation: continuationForPrefix(input.expectedSequence) };
    }).immediate();
  }

  async readPrivateUserInput(input: ReadPrivateUserInputInput): Promise<StoredPrivateUserInput | null> {
    assertValidGeneratedId(input.sessionId);
    assertValidGeneratedId(input.turnId);
    const row = this.db.prepare(
      "SELECT * FROM run_command_inputs WHERE session_id=? AND turn_id=?",
    ).get(input.sessionId, input.turnId) as Row | undefined;
    return row ? this.toPrivateUserInput(row) : null;
  }

  async listRecoverableCommands(input: RecoveryCommandScanInput): Promise<RecoveryCommandPage> {
    this.requireRecoveryLimit(input.limit, 64, "invalid_recovery_command_limit");
    if (input.afterCursor !== undefined) {
      requireTimestamp(input.afterCursor.createdAt, "recoveryCursor.createdAt");
      assertValidGeneratedId(input.afterCursor.runId);
    }
    const cursor = input.afterCursor;
    const rows = this.db.prepare(`
      SELECT run_id,attempt_id,status,created_at FROM run_commands
      WHERE status != 'terminal' AND (
        ? IS NULL OR created_at COLLATE BINARY > ? OR (created_at = ? AND run_id COLLATE BINARY > ?)
      )
      ORDER BY created_at COLLATE BINARY ASC, run_id COLLATE BINARY ASC
      LIMIT ?
    `).all(cursor?.createdAt ?? null, cursor?.createdAt ?? null, cursor?.createdAt ?? null, cursor?.runId ?? null, input.limit + 1) as Row[];
    const commands: RecoverableCommandRef[] = rows.slice(0, input.limit).map((row) => ({
      runId: row.run_id,
      initialAttemptId: row.attempt_id,
      status: row.status,
      createdAt: row.created_at,
    }));
    const sweepComplete = rows.length <= input.limit;
    return {
      commands,
      sweepComplete,
      nextCursor: sweepComplete ? null : { createdAt: commands.at(-1)!.createdAt, runId: commands.at(-1)!.runId },
    };
  }

  async readRecoveryBundle(input: RecoveryBundleInput): Promise<RecoveryBundleResult> {
    this.requireRecoveryLimit(input.eventLimit, 500, "invalid_recovery_event_limit");
    if (input.afterSequence !== undefined && (!Number.isInteger(input.afterSequence) || input.afterSequence < 0)) {
      throw new TypeError("invalid_recovery_after_sequence");
    }
    return this.db.transaction((): RecoveryBundleResult => {
      const runRow = this.db.prepare("SELECT * FROM runs WHERE run_id=?").get(input.runId) as Row | undefined;
      if (!runRow) return { kind: "not_found", code: "run_not_found" };
      const run = this.toRun(runRow);
      if (input.expectedActiveAttemptId !== undefined && input.expectedActiveAttemptId !== run.activeAttemptId) {
        return { kind: "conflict", code: "run_attempt_conflict" };
      }
      const commandRow = this.db.prepare("SELECT * FROM run_commands WHERE run_id=?").get(input.runId) as Row | undefined;
      if (!commandRow) return { kind: "not_found", code: "run_command_not_found" };
      const attemptRow = this.db.prepare("SELECT * FROM run_attempts WHERE run_id=? AND attempt_id=?").get(input.runId, run.activeAttemptId) as Row | undefined;
      if (!attemptRow) return { kind: "conflict", code: "run_attempt_conflict" };
      const invocationRows = this.db.prepare("SELECT * FROM invocations WHERE run_id=? ORDER BY reserved_at ASC, invocation_id ASC LIMIT 129").all(input.runId) as Row[];
      if (invocationRows.length > 128) return { kind: "failure", code: "recovery_bundle_too_large" };
      const snapshotRow = this.db.prepare("SELECT * FROM run_snapshots WHERE run_id=?").get(input.runId) as Row | undefined;
      const snapshot = snapshotRow ? this.toSnapshot(snapshotRow) : null;
      const terminalModelStepResult = this.assertTerminalResultSnapshotInvariant(input.runId, snapshot);
      const effectiveAfterSequence = Math.max(input.afterSequence ?? 0, snapshot?.throughSequence ?? 0);
      const eventRows = this.db.prepare("SELECT * FROM events WHERE run_id=? AND sequence>? ORDER BY sequence LIMIT ?").all(input.runId, effectiveAfterSequence, input.eventLimit + 1) as Row[];
      const tailEvents = eventRows.slice(0, input.eventLimit).map((row) => this.toEvent(row));
      const tailComplete = eventRows.length <= input.eventLimit;
      const inputRow = this.db.prepare("SELECT * FROM run_command_inputs WHERE run_id=?").get(input.runId) as Row | undefined;
      const latestModelStepRow = this.db.prepare("SELECT * FROM model_steps WHERE run_id=? AND attempt_id=? ORDER BY started_at DESC, model_step_id DESC LIMIT 1").get(input.runId, run.activeAttemptId) as Row | undefined;
      const invocations = invocationRows.map((row) => ({
        reservation: this.toReservation(row),
        invocation: this.toInvocation(row),
        receipt: this.receiptForReservation(row.reservation_id),
      }));
      if (!inputRow) return { kind: "failure", code: "recovery_bundle_incomplete" };
      const bundle: RecoveryBundle = {
        command: this.toRunCommand(commandRow),
        run,
        activeAttempt: this.toAttempt(attemptRow),
        readActiveAttemptId: run.activeAttemptId,
        latestAttemptNumber: run.latestAttemptNumber,
        privateUserInput: this.toPrivateUserInput(inputRow),
        privateSnapshot: snapshot,
        tailEvents,
        effectiveAfterSequence,
        eventHeadSequence: attemptRow.last_event_sequence,
        tailComplete,
        nextAfterSequence: tailComplete ? null : tailEvents.at(-1)?.sequence ?? effectiveAfterSequence,
        latestModelStep: latestModelStepRow ? this.toModelStep(latestModelStepRow) : null,
        terminalModelStepResult,
        invocations,
      };
      return { kind: "found", bundle };
    })();
  }

  async startModelStep(input: StartModelStepInput): Promise<StartModelStepResult> {
    this.validateModelStepIdentity(input);
    assertValidCommandTimestamp(input.startedAt);
    try {
      return this.db.transaction((): StartModelStepResult => {
        if (!this.isActiveAttempt(input.runId, input.attemptId)) {
          return { kind: "conflict", code: "run_attempt_conflict" };
        }
        const prior = this.db.prepare("SELECT * FROM model_steps WHERE run_id=? AND model_step_id=?")
          .get(input.runId, input.modelStepId) as Row | undefined;
        if (prior) {
          if (prior.attempt_id !== input.attemptId || prior.request_fingerprint !== input.requestFingerprint) {
            return { kind: "conflict", code: "model_step_conflict" };
          }
          return prior.status === "started"
            ? { kind: "conflict", code: "model_step_in_progress" }
            : { kind: "replay", checkpoint: this.toModelStep(prior) };
        }
        const lease = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
        if (lease) return { kind: "conflict", code: lease };
        if (this.db.prepare("SELECT 1 FROM model_steps WHERE model_step_id=?").get(input.modelStepId)) {
          return { kind: "conflict", code: "model_step_conflict" };
        }
        if (this.db.prepare("SELECT 1 FROM model_steps WHERE run_id=? AND status='started'")
          .get(input.runId)) {
          return { kind: "conflict", code: "model_step_in_progress" };
        }
        const command = this.db.prepare("SELECT * FROM run_commands WHERE run_id=?")
          .get(input.runId) as Row | undefined;
        if (!command || (command.status !== "accepted" && command.status !== "dispatched")) {
          return { kind: "conflict", code: "model_step_conflict" };
        }
        if (Date.parse(input.startedAt) < Date.parse(command.updated_at)) {
          return { kind: "conflict", code: "model_step_conflict" };
        }
        if (command.status === "accepted") {
          this.db.prepare(`
            UPDATE run_commands SET status='dispatched',updated_at=?,dispatched_at=?
            WHERE run_id=? AND status='accepted'
          `).run(input.startedAt, input.startedAt, input.runId);
        }
        this.db.prepare(`
          INSERT INTO model_steps (
            model_step_id,run_id,attempt_id,request_fingerprint,status,failure_code,started_at,finished_at,updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?)
        `).run(
          input.modelStepId, input.runId, input.attemptId, input.requestFingerprint, "started", null,
          input.startedAt, null, input.startedAt,
        );
        const row = this.db.prepare("SELECT * FROM model_steps WHERE run_id=? AND model_step_id=?")
          .get(input.runId, input.modelStepId) as Row;
        return { kind: "started", checkpoint: this.toModelStep(row) };
      }).immediate();
    } catch (error) {
      if (isUniqueConstraint(error)) return { kind: "conflict", code: "model_step_conflict" };
      throw error;
    }
  }

  async finishModelStep(input: FinishModelStepInput): Promise<FinishModelStepResult> {
    this.validateModelStepIdentity(input);
    assertValidCommandTimestamp(input.outcome.finishedAt);
    if (input.outcome.status === "failed") assertValidSafeCode(input.outcome.failureCode);
    if (input.outcome.status === "terminal") return { kind: "conflict", code: "terminal_model_step_commit_required" };
    return this.db.transaction((): FinishModelStepResult => {
      if (!this.isActiveAttempt(input.runId, input.attemptId)) {
        return { kind: "conflict", code: "run_attempt_conflict" };
      }
      const lease = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
      if (lease) return { kind: "conflict", code: lease };
      const row = this.db.prepare("SELECT * FROM model_steps WHERE run_id=? AND model_step_id=?")
        .get(input.runId, input.modelStepId) as Row | undefined;
      if (!row || row.attempt_id !== input.attemptId || row.request_fingerprint !== input.requestFingerprint) {
        return { kind: "conflict", code: "model_step_conflict" };
      }
      if (row.status !== "started") {
        const failureCode = input.outcome.status === "failed" ? input.outcome.failureCode : null;
        return row.status === input.outcome.status
          && row.finished_at === input.outcome.finishedAt
          && row.failure_code === failureCode
          ? { kind: "replay", checkpoint: this.toModelStep(row) }
          : { kind: "conflict", code: "model_step_conflict" };
      }
      const failureCode = input.outcome.status === "failed" ? input.outcome.failureCode : null;
      if (Date.parse(input.outcome.finishedAt) < Date.parse(row.started_at)) {
        return { kind: "conflict", code: "model_step_conflict" };
      }
      this.db.prepare(`
        UPDATE model_steps SET status=?,failure_code=?,finished_at=?,updated_at=?
        WHERE run_id=? AND model_step_id=? AND status='started'
      `).run(
        input.outcome.status, failureCode, input.outcome.finishedAt, input.outcome.finishedAt,
        input.runId, input.modelStepId,
      );
      const updated = this.db.prepare("SELECT * FROM model_steps WHERE run_id=? AND model_step_id=?")
        .get(input.runId, input.modelStepId) as Row;
      return { kind: "committed", checkpoint: this.toModelStep(updated) };
    }).immediate();
  }

  async readModelStep(input: ReadModelStepInput): Promise<StoredModelStepCheckpoint | null> {
    assertValidGeneratedId(input.runId);
    assertValidGeneratedId(input.modelStepId);
    const row = this.db.prepare("SELECT * FROM model_steps WHERE run_id=? AND model_step_id=?")
      .get(input.runId, input.modelStepId) as Row | undefined;
    return row ? this.toModelStep(row) : null;
  }

  async readLatestModelStep(input: ReadLatestModelStepInput): Promise<StoredModelStepCheckpoint | null> {
    assertValidGeneratedId(input.runId);
    if (input.attemptId !== undefined) assertValidGeneratedId(input.attemptId);
    const row = input.attemptId === undefined
      ? this.db.prepare("SELECT * FROM model_steps WHERE run_id=? ORDER BY started_at DESC,model_step_id DESC LIMIT 1")
        .get(input.runId) as Row | undefined
      : this.db.prepare("SELECT * FROM model_steps WHERE run_id=? AND attempt_id=? ORDER BY started_at DESC,model_step_id DESC LIMIT 1")
        .get(input.runId, input.attemptId) as Row | undefined;
    return row ? this.toModelStep(row) : null;
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    requireId(input.sessionId, "sessionId"); requireId(input.workspaceId, "workspaceId"); requireTimestamp(input.createdAt, "createdAt");
    return this.db.transaction(() => {
      const prior = this.db.prepare("SELECT * FROM sessions WHERE session_id=?").get(input.sessionId) as Row | undefined;
      if (prior) {
        if (prior.workspace_id !== input.workspaceId || prior.created_at !== input.createdAt) throw new IdempotencyConflictError("session_identity_conflict");
        return this.toSession(prior);
      }
      this.db.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run(input.sessionId, input.workspaceId, input.createdAt, input.createdAt);
      return { schemaVersion: "meliora.session.v1" as const, ...input, updatedAt: input.createdAt };
    })();
  }

  async createTurn(input: CreateTurnInput): Promise<TurnRecord> {
    requireId(input.turnId, "turnId"); requireTimestamp(input.createdAt, "createdAt");
    return this.db.transaction(() => {
      const prior = this.db.prepare("SELECT * FROM turns WHERE turn_id=?").get(input.turnId) as Row | undefined;
      if (prior) {
        if (prior.session_id !== input.sessionId || prior.intent_revision !== input.intentRevision || prior.created_at !== input.createdAt) throw new IdempotencyConflictError("turn_identity_conflict");
        return this.toTurn(prior);
      }
      if (!this.db.prepare("SELECT 1 FROM sessions WHERE session_id=?").get(input.sessionId)) throw new Error("session_not_found");
      this.db.prepare("INSERT INTO turns VALUES (?,?,?,?,?)").run(input.turnId, input.sessionId, input.intentRevision, input.createdAt, input.createdAt);
      return { schemaVersion: "meliora.turn.v1" as const, ...input, updatedAt: input.createdAt };
    })();
  }

  async createRun(input: CreateRunInput): Promise<PersistedRunRecord> {
    requireId(input.runId, "runId"); requireId(input.initialAttemptId, "initialAttemptId"); requireTimestamp(input.createdAt, "createdAt");
    return this.db.transaction(() => {
      const prior = this.db.prepare("SELECT * FROM runs WHERE run_id=?").get(input.runId) as Row | undefined;
      if (prior) {
        const attempt = this.db.prepare("SELECT * FROM run_attempts WHERE run_id=? AND attempt_number=1").get(input.runId) as Row | undefined;
        if (prior.session_id !== input.sessionId || prior.turn_id !== input.turnId || prior.active_attempt_id !== input.initialAttemptId || attempt?.catalog_hash !== input.catalogHash || attempt?.intent_revision !== input.intentRevision) throw new IdempotencyConflictError("run_identity_conflict");
        return this.toRun(prior);
      }
      const turn = this.db.prepare("SELECT session_id,intent_revision FROM turns WHERE turn_id=?").get(input.turnId) as Row | undefined;
      if (!turn || turn.session_id !== input.sessionId || turn.intent_revision !== input.intentRevision) throw new Error("turn_not_found");
      this.db.prepare("INSERT INTO runs VALUES (?,?,?,?,?,?,?)").run(input.runId, input.turnId, input.sessionId, input.initialAttemptId, 1, input.createdAt, input.createdAt);
      this.db.prepare("INSERT INTO run_attempts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(input.initialAttemptId, input.runId, input.sessionId, input.turnId, 1, "created", 0, input.catalogHash, input.intentRevision, "null", input.createdAt, input.createdAt);
      return { schemaVersion: "meliora.persisted-run.v1" as const, sessionId: input.sessionId, turnId: input.turnId, runId: input.runId, activeAttemptId: input.initialAttemptId, latestAttemptNumber: 1, createdAt: input.createdAt, updatedAt: input.createdAt };
    })();
  }

  async createRunAttempt(input: CreateRunAttemptInput): Promise<CreateRunAttemptResult> {
    requireTimestamp(input.createdAt, "createdAt"); requireTimestamp(input.requestedAt, "requestedAt"); this.requireTtl(input.ttlMs);
    return this.db.transaction((): CreateRunAttemptResult => {
      const now = this.clock();
      const run = this.db.prepare("SELECT * FROM runs WHERE run_id=?").get(input.runId) as Row | undefined;
      if (!run || run.latest_attempt_number !== input.expectedLatestAttemptNumber) return { kind: "conflict", code: "run_attempt_conflict", latestAttemptNumber: run?.latest_attempt_number ?? -1 };
      const latest = this.db.prepare("SELECT * FROM run_attempts WHERE run_id=? AND attempt_id=?").get(input.runId, run.active_attempt_id) as Row | undefined;
      if (latest && this.isC2bPristineAttempt(input.runId, latest.attempt_id)) return { kind: "conflict", code: "run_attempt_conflict", latestAttemptNumber: run.latest_attempt_number };
      const forged = run.session_id !== input.sessionId || run.turn_id !== input.turnId || latest?.catalog_hash !== input.catalogHash || latest?.intent_revision !== input.intentRevision || !!this.db.prepare("SELECT 1 FROM run_attempts WHERE run_id=? AND attempt_id=?").get(input.runId, input.attemptId);
      if (forged) return { kind: "conflict", code: "run_attempt_conflict", latestAttemptNumber: run.latest_attempt_number };
      const active = this.db.prepare("SELECT expires_at FROM run_leases WHERE run_id=? AND expires_at>?").get(input.runId, now.toISOString()) as Row | undefined;
      if (active) return { kind: "conflict", code: "lease_held", latestAttemptNumber: run.latest_attempt_number, expiresAt: active.expires_at };
      const attemptNumber = run.latest_attempt_number + 1;
      const leaseToken = this.nonce();
      const expiresAt = new Date(now.getTime() + input.ttlMs).toISOString();
      this.db.prepare("INSERT INTO run_attempts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(input.attemptId, input.runId, input.sessionId, input.turnId, attemptNumber, "created", latest!.last_event_sequence, input.catalogHash, input.intentRevision, "null", input.createdAt, input.createdAt);
      this.db.prepare("UPDATE runs SET active_attempt_id=?,latest_attempt_number=?,updated_at=? WHERE run_id=?").run(input.attemptId, attemptNumber, input.createdAt, input.runId);
      this.db.prepare("INSERT INTO run_leases VALUES (?,?,?,?,?)").run(input.runId, input.attemptId, input.ownerId, hashBytes(leaseToken), expiresAt);
      const row = this.db.prepare("SELECT * FROM run_attempts WHERE run_id=? AND attempt_id=?").get(input.runId, input.attemptId) as Row;
      return { kind: "created", attempt: this.toAttempt(row), lease: { leaseToken, expiresAt } };
    })();
  }

  async appendEvents(input: AppendEventsInput): Promise<AppendEventsResult> {
    for (const event of input.events) {
      assertPersistableNewEvent(event);
    }
    return this.db.transaction((): AppendEventsResult => {
      const attempt = this.db.prepare("SELECT * FROM run_attempts WHERE run_id=? AND attempt_id=?").get(input.runId, input.attemptId) as Row | undefined;
      if (!attempt) return { kind: "conflict", code: "run_attempt_conflict" };
      const lease = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
      if (lease) return { kind: "conflict", code: lease };
      if (attempt.last_event_sequence !== input.expectedSequence) return { kind: "conflict", code: "event_sequence_conflict", currentSequence: attempt.last_event_sequence };
      const events = input.events.map((event, index) => toStoredEvent(event, input.runId, input.attemptId, input.expectedSequence + index + 1));
      for (const event of events) {
        const payload = canonicalJson(event.payload);
        this.db.prepare("INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(event.eventId, event.runId, event.attemptId, event.sequence, event.schemaVersion, event.kind, event.visibility, payload, hashBytes(json(event)), event.createdAt, event.causationId ?? null, event.correlationId ?? null);
      }
      const lastSequence = input.expectedSequence + events.length;
      this.db.prepare("UPDATE run_attempts SET last_event_sequence=?,updated_at=? WHERE run_id=? AND attempt_id=?").run(lastSequence, this.clock().toISOString(), input.runId, input.attemptId);
      return { kind: "appended", events, lastSequence };
    })();
  }

  async readEvents(input: ReadEventsInput): Promise<EventPage> {
    const after = input.afterSequence ?? 0;
    if (!Number.isInteger(after) || after < 0 || !Number.isInteger(input.limit) || input.limit < 1) throw new TypeError("invalid_event_page");
    const rows = this.db.prepare("SELECT * FROM events WHERE run_id=? AND sequence>? ORDER BY sequence LIMIT ?").all(input.runId, after, input.limit + 1) as Row[];
    const events = rows.slice(0, input.limit).map((row) => this.toEvent(row));
    return { events, nextSequence: rows.length > input.limit ? events.at(-1)?.sequence ?? null : null };
  }

  async readEventLogPage(input: ReadEventLogPageInput): Promise<EventLogPage> {
    const after = input.afterSequence ?? 0;
    if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(input.limit) || input.limit < 1) {
      throw new TypeError("invalid_event_log_page");
    }
    return this.db.transaction((): EventLogPage => {
      const run = this.db.prepare("SELECT * FROM runs WHERE run_id=?").get(input.runId) as Row | undefined;
      if (!run) return { kind: "not_found", code: "run_not_found" };

      // This first query establishes the SQLite transaction snapshot before
      // the page query, so another process cannot append between head capture
      // and selection.
      const headRow = this.db.prepare("SELECT COALESCE(MAX(sequence), 0) AS head FROM events WHERE run_id=?")
        .get(input.runId) as Row;
      const currentHead = headRow.head as number;
      const activeAttempt = this.db.prepare("SELECT last_event_sequence FROM run_attempts WHERE run_id=? AND attempt_id=?")
        .get(input.runId, run.active_attempt_id) as Row | undefined;
      if (!activeAttempt || activeAttempt.last_event_sequence !== currentHead) {
        return { kind: "conflict", code: "event_watermark_conflict" };
      }
      const throughSequence = input.throughSequence ?? currentHead;
      if (!Number.isSafeInteger(throughSequence) || throughSequence < 0 || throughSequence > currentHead) {
        return { kind: "conflict", code: "event_watermark_conflict" };
      }
      if (after > throughSequence) return { kind: "conflict", code: "event_watermark_conflict" };
      const rows = this.db.prepare(
        "SELECT * FROM events WHERE run_id=? AND sequence>? AND sequence<=? ORDER BY sequence LIMIT ?",
      ).all(input.runId, after, throughSequence, input.limit + 1) as Row[];
      const events = rows.slice(0, input.limit).map((row) => this.toEvent(row));
      return {
        kind: "found",
        events,
        nextSequence: rows.length > input.limit ? events.at(-1)?.sequence ?? null : null,
        throughSequence,
      };
    })();
  }

  async writeSnapshot(input: WriteSnapshotInput): Promise<void> {
    const snapshot = input.snapshot; assertValidRunSnapshot(snapshot);
    if (snapshot.state.terminalModelStepResult !== undefined) throw new IdempotencyConflictError("terminal_model_step_commit_required");
    if (!Number.isInteger(snapshot.throughSequence) || snapshot.throughSequence < 0) throw new SequenceConflictError(snapshot.runId, input.expectedSequence, -1);
    this.db.transaction(() => {
      const attempt = this.db.prepare("SELECT last_event_sequence FROM run_attempts WHERE run_id=? AND attempt_id=?").get(snapshot.runId, snapshot.attemptId) as Row | undefined;
      if (!attempt || attempt.last_event_sequence !== input.expectedSequence || snapshot.throughSequence > input.expectedSequence) throw new SequenceConflictError(snapshot.runId, input.expectedSequence, attempt?.last_event_sequence ?? -1);
      const lease = this.leaseConflict(snapshot.runId, snapshot.attemptId, input.leaseToken); if (lease) throw new IdempotencyConflictError(lease);
      this.assertSnapshotIntegrity(snapshot);
      const state = canonicalJson(snapshot.state); const stateHash = hashBytes(state);
      const prior = this.db.prepare("SELECT * FROM run_snapshots WHERE run_id=?").get(snapshot.runId) as Row | undefined;
      if (prior?.through_sequence === snapshot.throughSequence) {
        if (prior.snapshot_id !== snapshot.snapshotId || prior.attempt_id !== snapshot.attemptId || prior.state_json !== state) throw new IdempotencyConflictError("snapshot_content_conflict");
        return;
      }
      if (prior && prior.through_sequence > snapshot.throughSequence) throw new SequenceConflictError(snapshot.runId, snapshot.throughSequence, prior.through_sequence);
      this.db.prepare("INSERT INTO run_snapshots VALUES (?,?,?,?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET attempt_id=excluded.attempt_id,snapshot_id=excluded.snapshot_id,through_sequence=excluded.through_sequence,state_json=excluded.state_json,state_hash=excluded.state_hash,created_at=excluded.created_at").run(snapshot.runId, snapshot.attemptId, snapshot.snapshotId, snapshot.throughSequence, state, stateHash, snapshot.createdAt);
    })();
  }

  async commitTerminalModelStepResultAndSnapshot(
    input: CommitTerminalModelStepResultAndSnapshotInput,
  ): Promise<CommitTerminalModelStepResultAndSnapshotResult> {
    this.validateModelStepIdentity(input);
    assertValidCommandTimestamp(input.finishedAt);
    assertPersistableBytes(input.normalizedResult.content, "terminal_model_step_result.content");
    if (input.normalizedResult.metadata !== undefined) assertPersistableJson(input.normalizedResult.metadata, "terminal_model_step_result.metadata");
    assertValidRunSnapshot(input.snapshot);
    if (
      input.normalizedResult.contentHash !== hashBytes(input.normalizedResult.content)
      || input.snapshot.runId !== input.runId
      || input.snapshot.attemptId !== input.attemptId
      || input.snapshot.throughSequence > input.expectedSequence
      || input.snapshot.state.terminalModelStepResult === undefined
    ) return { kind: "conflict", code: "terminal_model_step_result_conflict" };
    const terminal = input.snapshot.state.terminalModelStepResult;
    const artifact: ArtifactRef = {
      artifactId: input.normalizedResult.artifactId,
      contentHash: input.normalizedResult.contentHash,
      mediaType: PRIVATE_TERMINAL_MODEL_STEP_RESULT_MEDIA_TYPE,
      byteLength: input.normalizedResult.content.byteLength,
      visibility: "private",
    };
    if (!sameJson(terminal, { attemptId: input.attemptId, modelStepId: input.modelStepId, requestFingerprint: input.requestFingerprint, artifact })) {
      return { kind: "conflict", code: "terminal_model_step_result_conflict" };
    }
    try {
      return this.db.transaction((): CommitTerminalModelStepResultAndSnapshotResult => {
        if (!this.isActiveAttempt(input.runId, input.attemptId)) return { kind: "conflict", code: "run_attempt_conflict" };
        const lease = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
        if (lease) return { kind: "conflict", code: lease };
        const attempt = this.db.prepare("SELECT last_event_sequence FROM run_attempts WHERE run_id=? AND attempt_id=?")
          .get(input.runId, input.attemptId) as Row | undefined;
        if (!attempt || attempt.last_event_sequence !== input.expectedSequence) return { kind: "conflict", code: "snapshot_sequence_conflict" };
        const step = this.db.prepare("SELECT * FROM model_steps WHERE run_id=? AND model_step_id=?")
          .get(input.runId, input.modelStepId) as Row | undefined;
        if (!step || step.attempt_id !== input.attemptId || step.request_fingerprint !== input.requestFingerprint) return { kind: "conflict", code: "model_step_conflict" };
        const state = canonicalJson(input.snapshot.state);
        const stateHash = hashBytes(state);
        const snapshotEnvelopeHash = hashBytes(canonicalJson(input.snapshot));
        const priorResult = this.db.prepare("SELECT * FROM model_step_terminal_results WHERE run_id=? AND model_step_id=?")
          .get(input.runId, input.modelStepId) as Row | undefined;
        const priorSnapshot = this.db.prepare("SELECT * FROM run_snapshots WHERE run_id=?").get(input.runId) as Row | undefined;
        const exactResult = (row: Row) => row.attempt_id === input.attemptId
          && row.request_fingerprint === input.requestFingerprint && row.artifact_id === artifact.artifactId
          && row.artifact_content_hash === artifact.contentHash && row.artifact_media_type === artifact.mediaType
          && row.artifact_byte_length === artifact.byteLength && row.artifact_visibility === artifact.visibility
          && row.snapshot_id === input.snapshot.snapshotId && row.through_sequence === input.snapshot.throughSequence
          && row.state_hash === stateHash && row.snapshot_envelope_hash === snapshotEnvelopeHash && row.finished_at === input.finishedAt;
        const exactSnapshot = (row: Row | undefined) => !!row && row.run_id === input.runId && row.attempt_id === input.attemptId
          && row.snapshot_id === input.snapshot.snapshotId && row.through_sequence === input.snapshot.throughSequence
          && row.state_json === state && row.state_hash === stateHash && row.created_at === input.snapshot.createdAt;
        if (priorResult || step.status === "terminal") {
          const priorHistory = priorResult
            ? this.db.prepare("SELECT * FROM run_snapshot_history WHERE snapshot_id=?").get(priorResult.snapshot_id) as Row | undefined
            : undefined;
          if (!priorResult || !priorHistory || !exactResult(priorResult) || !exactSnapshot(priorHistory)
            || priorResult.commit_ordinal !== priorHistory.commit_ordinal || priorResult.commit_ordinal <= 0
            || step.status !== "terminal" || step.finished_at !== input.finishedAt) {
            return { kind: "conflict", code: "terminal_model_step_result_conflict" };
          }
          const storedArtifact = this.db.prepare("SELECT * FROM artifacts WHERE artifact_id=?").get(artifact.artifactId) as Row | undefined;
          if (!storedArtifact || !sameJson(this.toArtifactRef(storedArtifact), artifact)
            || !Buffer.from(storedArtifact.content).equals(Buffer.from(input.normalizedResult.content))
            || storedArtifact.metadata_json !== (input.normalizedResult.metadata === undefined ? null : canonicalJson(input.normalizedResult.metadata))) {
            return { kind: "conflict", code: "terminal_model_step_result_conflict" };
          }
          this.assertTerminalResultSnapshotInvariant(input.runId, priorSnapshot ? this.toSnapshot(priorSnapshot) : null);
          return { kind: "replay", checkpoint: this.toModelStep(step), artifact: artifact as PrivateArtifactRef, snapshot: input.snapshot };
        }
        if (step.status !== "started" || Date.parse(input.finishedAt) < Date.parse(step.started_at)) return { kind: "conflict", code: "model_step_conflict" };
        const currentSnapshot = priorSnapshot ? this.toSnapshot(priorSnapshot) : null;
        this.assertTerminalResultSnapshotInvariant(input.runId, currentSnapshot);
        if (currentSnapshot && currentSnapshot.throughSequence > input.snapshot.throughSequence) return { kind: "conflict", code: "terminal_model_step_result_conflict" };
        const commitOrdinal = (this.db.prepare("SELECT COALESCE(MAX(commit_ordinal), 0) + 1 AS next_ordinal FROM run_snapshot_history WHERE run_id=?")
          .get(input.runId) as Row).next_ordinal as number;
        const metadata = input.normalizedResult.metadata === undefined ? null : canonicalJson(input.normalizedResult.metadata);
        const artifactCollision = this.db.prepare("SELECT * FROM artifacts WHERE artifact_id=?").get(artifact.artifactId) as Row | undefined;
        if (artifactCollision) return { kind: "conflict", code: "terminal_model_step_result_conflict" };
        this.onAtomicTerminalWrite?.("artifact");
        this.db.prepare("INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?)").run(
          artifact.artifactId, artifact.contentHash, artifact.mediaType, Buffer.from(input.normalizedResult.content), artifact.byteLength,
          artifact.visibility, metadata, input.finishedAt,
        );
        this.onAtomicTerminalWrite?.("checkpoint");
        this.db.prepare("UPDATE model_steps SET status='terminal',failure_code=NULL,finished_at=?,updated_at=? WHERE model_step_id=? AND status='started'")
          .run(input.finishedAt, input.finishedAt, input.modelStepId);
        this.onAtomicTerminalWrite?.("terminal_result");
        this.db.prepare("INSERT INTO run_snapshot_history VALUES (?,?,?,?,?,?,?,?)").run(
          input.snapshot.snapshotId, input.runId, input.attemptId, commitOrdinal, input.snapshot.throughSequence,
          state, stateHash, input.snapshot.createdAt,
        );
        this.db.prepare(`INSERT INTO model_step_terminal_results (
          run_id,attempt_id,model_step_id,request_fingerprint,artifact_id,artifact_content_hash,artifact_media_type,
          artifact_byte_length,artifact_visibility,snapshot_id,commit_ordinal,through_sequence,state_hash,snapshot_envelope_hash,finished_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          input.runId, input.attemptId, input.modelStepId, input.requestFingerprint, artifact.artifactId, artifact.contentHash,
          artifact.mediaType, artifact.byteLength, artifact.visibility, input.snapshot.snapshotId, commitOrdinal, input.snapshot.throughSequence,
          stateHash, snapshotEnvelopeHash, input.finishedAt,
        );
        this.onAtomicTerminalWrite?.("snapshot");
        this.db.prepare("INSERT INTO run_snapshots VALUES (?,?,?,?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET attempt_id=excluded.attempt_id,snapshot_id=excluded.snapshot_id,through_sequence=excluded.through_sequence,state_json=excluded.state_json,state_hash=excluded.state_hash,created_at=excluded.created_at").run(
          input.runId, input.attemptId, input.snapshot.snapshotId, input.snapshot.throughSequence, state, stateHash, input.snapshot.createdAt,
        );
        const committed = this.db.prepare("SELECT * FROM model_steps WHERE model_step_id=?").get(input.modelStepId) as Row;
        return { kind: "committed", checkpoint: this.toModelStep(committed), artifact: artifact as PrivateArtifactRef, snapshot: input.snapshot };
      }).immediate();
    } catch (error) {
      if (isUniqueConstraint(error)) return { kind: "conflict", code: "terminal_model_step_result_conflict" };
      throw error;
    }
  }

  async readSnapshot(runId: string): Promise<RunSnapshot | null> {
    const row = this.db.prepare("SELECT * FROM run_snapshots WHERE run_id=?").get(runId) as Row | undefined;
    if (!row) {
      this.assertTerminalResultSnapshotInvariant(runId, null);
      return null;
    }
    return this.toSnapshot(row);
  }

  async reserveInvocation(input: InvocationReservationInput): Promise<ReservationResult> {
    const invocation = input.invocation;
    assertPersistableJson(JSON.parse(JSON.stringify(invocation)) as JsonValue, "invocation");
    // V3 reservations always start at a proven pre-execution state. Older
    // ambiguous rows are converted during migration, never recreated here.
    if (invocation.status !== "reserved") return { kind: "conflict", code: "invocation_reservation_conflict" };
    return this.db.transaction((): ReservationResult => {
      if (!this.db.prepare("SELECT 1 FROM run_attempts WHERE run_id=? AND attempt_id=?").get(invocation.runId, invocation.attemptId)) return { kind: "conflict", code: "run_attempt_conflict" };
      const prior = this.db.prepare("SELECT * FROM invocations WHERE run_id=? AND idempotency_key=?").get(invocation.runId, invocation.idempotencyKey) as Row | undefined;
      if (prior) {
        const existing = this.toInvocation(prior);
        if (!this.sameInvocation(existing, invocation)) return { kind: "conflict", code: "idempotency_key_conflict" };
        return { kind: "replay", reservationId: prior.reservation_id, invocation: existing, receipt: this.receiptForReservation(prior.reservation_id) };
      }
      const lease = this.leaseConflict(invocation.runId, invocation.attemptId, input.leaseToken);
      if (lease) return { kind: "conflict", code: lease };
      if (this.db.prepare("SELECT 1 FROM invocations WHERE run_id=? AND attempt_id=? AND invocation_id=?").get(invocation.runId, invocation.attemptId, invocation.invocationId)) return { kind: "conflict", code: "invocation_reservation_conflict" };
      const reservationId = this.nonce(); const body = json(invocation);
      this.db.prepare(`INSERT INTO invocations (
        invocation_id,run_id,attempt_id,reservation_id,idempotency_key,invocation_json,invocation_hash,status,reserved_at,execution_started_at
      ) VALUES (?,?,?,?,?,?,?,?,?,NULL)`).run(invocation.invocationId, invocation.runId, invocation.attemptId, reservationId, invocation.idempotencyKey, body, hashBytes(body), invocation.status, input.reservedAt);
      return { kind: "owner", reservationId };
    })();
  }

  async beginInvocationExecution(input: BeginInvocationExecutionInput): Promise<BeginInvocationExecutionResult> {
    return this.db.transaction((): BeginInvocationExecutionResult => {
      if (!this.isActiveAttempt(input.runId, input.attemptId)) return { kind: "conflict", code: "run_attempt_conflict" };
      const lease = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
      if (lease) return { kind: "conflict", code: lease };
      const row = this.db.prepare("SELECT * FROM invocations WHERE reservation_id=?").get(input.reservationId) as Row | undefined;
      if (!row || row.run_id !== input.runId || row.attempt_id !== input.attemptId) return { kind: "conflict", code: "invocation_execution_conflict" };
      const receipt = this.receiptForReservation(input.reservationId);
      if (receipt) return { kind: "receipt_replay", receiptId: receipt.receiptId };
      if (row.status === "executing" || row.status === "outcome_unknown") {
        return row.status === "executing"
          ? { kind: "already_executing_or_unknown", executionStartedAt: row.execution_started_at ?? undefined }
          : { kind: "already_executing_or_unknown" };
      }
      if (row.status !== "reserved" || row.execution_started_at !== null) return { kind: "conflict", code: "invocation_execution_conflict" };
      const executionStartedAt = this.clock().toISOString();
      const invocation = this.toInvocation(row);
      const body = json({ ...invocation, status: "executing" });
      const update = this.db.prepare("UPDATE invocations SET status='executing',execution_started_at=?,invocation_json=?,invocation_hash=? WHERE reservation_id=? AND status='reserved' AND execution_started_at IS NULL")
        .run(executionStartedAt, body, hashBytes(body), input.reservationId);
      if (update.changes !== 1) return { kind: "already_executing_or_unknown" };
      return { kind: "started", executionStartedAt };
    }).immediate();
  }

  async readInvocation(input: ReadInvocationInput): Promise<NormalizedToolInvocation | null> {
    const row = this.db.prepare("SELECT * FROM invocations WHERE run_id=? AND attempt_id=? AND invocation_id=?").get(input.runId, input.attemptId, input.invocationId) as Row | undefined;
    return row ? this.toInvocation(row) : null;
  }

  async readReservation(input: ReadReservationInput): Promise<StoredInvocationReservation | null> {
    const row = this.db.prepare("SELECT * FROM invocations WHERE run_id=? AND attempt_id=? AND invocation_id=?").get(input.runId, input.attemptId, input.invocationId) as Row | undefined;
    return row ? this.toReservation(row) : null;
  }

  async readInvocationByIdempotencyKey(input: ReadInvocationByIdempotencyKeyInput): Promise<InvocationReconciliationRecord | null> {
    const row = this.db.prepare("SELECT * FROM invocations WHERE run_id=? AND idempotency_key=?").get(input.runId, input.idempotencyKey) as Row | undefined;
    return row ? { reservation: this.toReservation(row), invocation: this.toInvocation(row), receipt: this.receiptForReservation(row.reservation_id) } : null;
  }

  async commitReceipt(input: CommitReceiptInput): Promise<CommitReceiptResult> {
    return this.db.transaction((): CommitReceiptResult => {
      const row = this.db.prepare("SELECT * FROM invocations WHERE reservation_id=?").get(input.reservationId) as Row | undefined;
      if (!row || row.run_id !== input.runId || row.attempt_id !== input.attemptId || row.invocation_id !== input.receipt.invocationId) {
        return this.isActiveAttempt(input.runId, input.attemptId)
          ? { kind: "conflict", code: "invocation_reservation_conflict" }
          : { kind: "conflict", code: "run_attempt_conflict" };
      }
      const invocation = this.toInvocation(row);
      if (!this.receiptMatches(input.receipt, invocation)) return { kind: "conflict", code: "receipt_conflict" };
      const prior = this.db.prepare("SELECT * FROM receipts WHERE reservation_id=?").get(input.reservationId) as Row | undefined;
      if (prior) return sameJson(JSON.parse(prior.receipt_json), input.receipt) ? { kind: "replay", receiptId: prior.receipt_id } : { kind: "conflict", code: "receipt_conflict" };
      if (!this.isActiveAttempt(input.runId, input.attemptId)) return { kind: "conflict", code: "run_attempt_conflict" };
      const lease = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
      if (lease) return { kind: "conflict", code: lease };
      if (row.status !== "executing" || row.execution_started_at === null) return { kind: "conflict", code: "invocation_execution_conflict" };
      const reusedReceiptId = this.db
        .prepare("SELECT reservation_id FROM receipts WHERE run_id=? AND attempt_id=? AND receipt_id=?")
        .get(input.runId, input.attemptId, input.receipt.receiptId) as Row | undefined;
      if (reusedReceiptId) return { kind: "conflict", code: "receipt_conflict" };
      assertPersistableJson(JSON.parse(JSON.stringify(input.receipt)) as JsonValue, "receipt");
      const body = json(input.receipt);
      this.db.prepare("INSERT INTO receipts VALUES (?,?,?,?,?,?,?)").run(input.receipt.receiptId, input.runId, input.attemptId, input.reservationId, body, hashBytes(body), input.receipt.endedAt);
      const updated = json({ ...invocation, status: input.receipt.status });
      this.db.prepare("UPDATE invocations SET status=?,invocation_json=?,invocation_hash=? WHERE reservation_id=?").run(input.receipt.status, updated, hashBytes(updated), input.reservationId);
      return { kind: "committed", receiptId: input.receipt.receiptId };
    })();
  }

  async commitReceiptWithPublicEvents(
    input: CommitReceiptWithPublicEventsInput,
  ): Promise<CommitReceiptWithPublicEventsResult> {
    assertPersistableJson(JSON.parse(JSON.stringify(input.receipt)) as JsonValue, "receipt");
    try {
      return this.db.transaction((): CommitReceiptWithPublicEventsResult => {
        const invocationRow = this.db.prepare("SELECT * FROM invocations WHERE reservation_id=?").get(input.reservationId) as Row | undefined;
        const prior = this.db.prepare("SELECT * FROM receipts WHERE reservation_id=?").get(input.reservationId) as Row | undefined;
        if (prior) {
          const binding = this.db.prepare("SELECT * FROM receipt_public_event_bindings WHERE reservation_id=?").get(input.reservationId) as Row | undefined;
          if (!binding || prior.run_id !== input.runId || prior.attempt_id !== input.attemptId
            || prior.receipt_id !== input.receipt.receiptId || prior.reservation_id !== input.reservationId
            || binding.receipt_id !== prior.receipt_id || binding.run_id !== input.runId || binding.attempt_id !== input.attemptId
            || !sameJson(this.toReceipt(prior), input.receipt)) return { kind: "conflict", code: "receipt_public_event_conflict" };
          const events = JSON.parse(binding.events_json) as StoredEvent[];
          if (hashBytes(binding.events_json) !== binding.events_hash
            || !Number.isSafeInteger(binding.expected_sequence) || !Number.isSafeInteger(binding.first_sequence)
            || !Number.isSafeInteger(binding.last_sequence)
            || binding.first_sequence !== binding.expected_sequence + 1
            || binding.last_sequence !== binding.expected_sequence + events.length
            || !events.every((event, index) => event.runId === input.runId && event.attemptId === input.attemptId
              && event.sequence === binding.expected_sequence + index + 1)
            || !this.isValidReceiptPublicEvents(this.toReceipt(prior), events)) {
            return { kind: "conflict", code: "receipt_public_event_conflict" };
          }
          const actual = this.db.prepare("SELECT * FROM events WHERE run_id=? AND attempt_id=? AND sequence>=? AND sequence<=? ORDER BY sequence")
            .all(input.runId, input.attemptId, binding.first_sequence, binding.last_sequence) as Row[];
          if (actual.length !== events.length || !sameJson(actual.map((row) => this.toEvent(row)), events)) return { kind: "conflict", code: "receipt_public_event_conflict" };
          return { kind: "replay", receiptId: prior.receipt_id, events };
        }
        if (!invocationRow || invocationRow.run_id !== input.runId || invocationRow.attempt_id !== input.attemptId
          || invocationRow.invocation_id !== input.receipt.invocationId) return { kind: "conflict", code: "invocation_reservation_conflict" };
        const invocation = this.toInvocation(invocationRow);
        if (!this.receiptMatches(input.receipt, invocation)) return { kind: "conflict", code: "receipt_conflict" };
        if (!this.isActiveAttempt(input.runId, input.attemptId)) return { kind: "conflict", code: "run_attempt_conflict" };
        const lease = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
        if (lease) return { kind: "conflict", code: lease };
        if (invocationRow.status !== "executing" || invocationRow.execution_started_at === null) return { kind: "conflict", code: "invocation_execution_conflict" };
        const attempt = this.db.prepare("SELECT last_event_sequence FROM run_attempts WHERE run_id=? AND attempt_id=?").get(input.runId, input.attemptId) as Row | undefined;
        if (!attempt || attempt.last_event_sequence !== input.expectedSequence) return { kind: "conflict", code: "event_sequence_conflict", currentSequence: attempt?.last_event_sequence };
        if (!input.receipt.outputArtifactId
          || input.receipt.verificationArtifactIds.some((id) => id !== input.receipt.outputArtifactId)
          || (input.receipt.verificationArtifactIds.length > 0 && input.receipt.status !== "succeeded")) return { kind: "conflict", code: "receipt_public_event_conflict" };
        const createdAt = this.clock().toISOString();
        const events: StoredEvent[] = [{
          schemaVersion: "meliora.session-event.v1", eventId: `event-${this.nonce()}`,
          runId: input.runId, attemptId: input.attemptId, sequence: input.expectedSequence + 1,
          kind: "tool_result_presented", visibility: "public", createdAt, causationId: input.receipt.receiptId,
          payload: { invocationId: input.receipt.invocationId, status: input.receipt.status, summary: input.receipt.effectSummary,
            artifactRefs: [{ artifactId: input.receipt.outputArtifactId, visibility: "public" }] },
        }];
        if (input.receipt.verificationArtifactIds.length > 0) events.push({
          schemaVersion: "meliora.session-event.v1", eventId: `event-${this.nonce()}`,
          runId: input.runId, attemptId: input.attemptId, sequence: input.expectedSequence + 2,
          kind: "verification_updated", visibility: "public", createdAt, causationId: input.receipt.receiptId,
          payload: { verificationId: `verification:${input.receipt.receiptId}`, status: "passed",
            evidenceRefs: input.receipt.verificationArtifactIds.map((artifactId) => ({ artifactId, visibility: "public" })) },
        });
        if (!this.isValidReceiptPublicEvents(input.receipt, events)) return { kind: "conflict", code: "receipt_public_event_conflict" };
        const receiptJson = json(input.receipt);
        this.db.prepare("INSERT INTO receipts VALUES (?,?,?,?,?,?,?)").run(input.receipt.receiptId, input.runId, input.attemptId, input.reservationId, receiptJson, hashBytes(receiptJson), input.receipt.endedAt);
        for (const event of events) {
          const payload = canonicalJson(event.payload);
          this.db.prepare("INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(event.eventId, event.runId, event.attemptId, event.sequence, event.schemaVersion, event.kind, event.visibility, payload, hashBytes(json(event)), event.createdAt, event.causationId ?? null, event.correlationId ?? null);
        }
        const eventsJson = json(events);
        this.db.prepare(`
          INSERT INTO receipt_public_event_bindings (
            reservation_id,receipt_id,run_id,attempt_id,expected_sequence,first_sequence,last_sequence,events_json,events_hash,created_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?)
        `).run(
          input.reservationId, input.receipt.receiptId, input.runId, input.attemptId,
          input.expectedSequence, input.expectedSequence + 1, input.expectedSequence + events.length,
          eventsJson, hashBytes(eventsJson), input.receipt.endedAt,
        );
        const updatedInvocation = json({ ...invocation, status: input.receipt.status });
        this.db.prepare("UPDATE invocations SET status=?,invocation_json=?,invocation_hash=? WHERE reservation_id=?").run(input.receipt.status, updatedInvocation, hashBytes(updatedInvocation), input.reservationId);
        this.db.prepare("UPDATE run_attempts SET last_event_sequence=?,updated_at=? WHERE run_id=? AND attempt_id=?").run(input.expectedSequence + events.length, this.clock().toISOString(), input.runId, input.attemptId);
        return { kind: "committed", receiptId: input.receipt.receiptId, events };
      })();
    } catch (error) {
      if (isUniqueConstraint(error)) return { kind: "conflict", code: "receipt_public_event_conflict" };
      throw error;
    }
  }

  async readReceipt(input: ReadReceiptInput): Promise<ToolReceipt | null> {
    const row = this.db.prepare("SELECT * FROM receipts WHERE run_id=? AND attempt_id=? AND receipt_id=?").get(input.runId, input.attemptId, input.receiptId) as Row | undefined;
    return row ? this.toReceipt(row) : null;
  }

  async readReceiptPublicEventBinding(
    input: ReadReceiptPublicEventBindingInput,
  ): Promise<ReadReceiptPublicEventBindingResult> {
    try {
      return this.db.transaction((): ReadReceiptPublicEventBindingResult => {
        const receiptRow = this.db.prepare("SELECT * FROM receipts WHERE run_id=? AND attempt_id=? AND receipt_id=?")
          .get(input.runId, input.attemptId, input.receiptId) as Row | undefined;
        const binding = this.db.prepare("SELECT * FROM receipt_public_event_bindings WHERE receipt_id=? AND run_id=? AND attempt_id=?")
          .get(input.receiptId, input.runId, input.attemptId) as Row | undefined;
        if (!receiptRow || !binding || binding.receipt_id !== receiptRow.receipt_id
          || binding.run_id !== input.runId || binding.attempt_id !== input.attemptId
          || hashBytes(binding.events_json) !== binding.events_hash) return { kind: "missing" };
        const events = JSON.parse(binding.events_json) as StoredEvent[];
        if (!Number.isSafeInteger(binding.expected_sequence) || binding.first_sequence !== binding.expected_sequence + 1
          || binding.last_sequence !== binding.expected_sequence + events.length
          || !events.every((event, index) => event.runId === input.runId && event.attemptId === input.attemptId
            && event.sequence === binding.expected_sequence + index + 1)
          || !this.isValidReceiptPublicEvents(this.toReceipt(receiptRow), events)) return { kind: "missing" };
        const stored = this.db.prepare("SELECT * FROM events WHERE run_id=? AND attempt_id=? AND sequence>=? AND sequence<=? ORDER BY sequence")
          .all(input.runId, input.attemptId, binding.first_sequence, binding.last_sequence) as Row[];
        if (stored.length !== events.length || !sameJson(stored.map((row) => this.toEvent(row)), events)) return { kind: "missing" };
        return { kind: "found", events };
      })();
    } catch { return { kind: "missing" }; }
  }

  async stagePublicToolResultDerivative(
    input: StagePublicToolResultDerivativeInput,
  ): Promise<StagePublicToolResultDerivativeResult> {
    assertPersistableBytes(input.content, "staged_public_derivative.content");
    if (input.mediaType !== "text/plain" || hashBytes(input.content) !== input.contentHash) {
      return { kind: "conflict", code: "public_artifact_provenance_conflict" };
    }
    try {
      return this.db.transaction((): StagePublicToolResultDerivativeResult => {
        const prior = this.db.prepare(`
          SELECT * FROM staged_public_artifact_provenance
          WHERE run_id=? AND origin_attempt_id=? AND origin_invocation_id=? AND projection_kind='tool_result'
        `).get(input.runId, input.attemptId, input.invocationId) as Row | undefined;
        if (prior) {
          const manifest = this.readStagedPublicArtifactManifest(prior);
          if (!manifest || prior.session_id !== input.sessionId || prior.reservation_id !== input.reservationId
            || manifest.contentHash !== input.contentHash || manifest.mediaType !== input.mediaType
            || manifest.byteLength !== input.content.byteLength) {
            return { kind: "conflict", code: "public_artifact_provenance_conflict" };
          }
          const physical = this.db.prepare("SELECT * FROM artifacts WHERE artifact_id=?").get(prior.physical_artifact_id) as Row | undefined;
          if (!physical || Buffer.from(physical.content).byteLength !== input.content.byteLength
            || !Buffer.from(physical.content).equals(Buffer.from(input.content))) {
            return { kind: "conflict", code: "public_artifact_provenance_conflict" };
          }
          return { kind: "replay", manifest };
        }

        const run = this.db.prepare(`
          SELECT r.session_id,r.active_attempt_id,a.session_id AS attempt_session_id
          FROM runs r JOIN run_attempts a ON a.run_id=r.run_id AND a.attempt_id=?
          WHERE r.run_id=?
        `).get(input.attemptId, input.runId) as Row | undefined;
        if (!run || run.session_id !== input.sessionId || run.attempt_session_id !== input.sessionId
          || run.active_attempt_id !== input.attemptId) return { kind: "conflict", code: "run_attempt_conflict" };
        const lease = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
        if (lease) return { kind: "conflict", code: lease };
        const invocation = this.db.prepare("SELECT * FROM invocations WHERE reservation_id=?").get(input.reservationId) as Row | undefined;
        if (!invocation || invocation.run_id !== input.runId || invocation.attempt_id !== input.attemptId
          || invocation.invocation_id !== input.invocationId || invocation.status !== "executing"
          || invocation.execution_started_at === null || !this.toInvocation(invocation)) {
          return { kind: "conflict", code: "invocation_execution_conflict" };
        }

        const publicAlias = `public-artifact-${this.nonce()}`;
        const physicalArtifactId = `staged-public-physical-${this.nonce()}`;
        const provenanceCollision = this.db.prepare(`
          SELECT 1 FROM staged_public_artifact_provenance
          WHERE public_alias IN (?,?) OR physical_artifact_id IN (?,?)
        `).get(publicAlias, physicalArtifactId, publicAlias, physicalArtifactId);
        const artifactCollision = this.db.prepare("SELECT 1 FROM artifacts WHERE artifact_id IN (?,?)")
          .get(publicAlias, physicalArtifactId);
        if (provenanceCollision || artifactCollision) {
          return { kind: "conflict", code: "public_artifact_provenance_conflict" };
        }
        const createdAt = this.clock().toISOString();
        this.db.prepare("INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?)").run(
          physicalArtifactId, input.contentHash, "text/plain", Buffer.from(input.content), input.content.byteLength,
          "private", null, createdAt,
        );
        this.db.prepare(`
          INSERT INTO staged_public_artifact_provenance (
            public_alias,physical_artifact_id,run_id,session_id,origin_attempt_id,origin_invocation_id,
            reservation_id,projection_kind,content_hash,media_type,byte_length,physical_visibility,created_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          publicAlias, physicalArtifactId, input.runId, input.sessionId, input.attemptId, input.invocationId,
          input.reservationId, "tool_result", input.contentHash, "text/plain", input.content.byteLength, "private", createdAt,
        );
        return {
          kind: "staged",
          manifest: {
            artifactId: publicAlias, visibility: "public", contentHash: input.contentHash, mediaType: "text/plain",
            byteLength: input.content.byteLength, createdAt, projectionKind: "tool_result",
          },
        };
      }).immediate();
    } catch (error) {
      if (isUniqueConstraint(error)) return { kind: "conflict", code: "public_artifact_provenance_conflict" };
      throw error;
    }
  }

  async resolveStagedPublicArtifact(
    input: ResolveStagedPublicArtifactInput,
  ): Promise<ResolveStagedPublicArtifactResult> {
    try {
      const row = this.db.prepare(`
        SELECT * FROM staged_public_artifact_provenance
        WHERE public_alias=? AND run_id=? AND session_id=?
      `).get(input.artifactId, input.runId, input.sessionId) as Row | undefined;
      const manifest = row ? this.readStagedPublicArtifactManifest(row) : null;
      return manifest ? { kind: "found", manifest } : { kind: "not_found" };
    } catch {
      return { kind: "not_found" };
    }
  }

  async authorizePublicArtifactRef(
    input: AuthorizePublicArtifactRefInput,
  ): Promise<AuthorizePublicArtifactRefResult> {
    try {
      return this.db.transaction((): AuthorizePublicArtifactRefResult => {
        const row = this.db.prepare(`
          SELECT p.*, c.local_principal_id, c.session_id AS command_session_id,
                 i.invocation_json, i.invocation_hash, r.receipt_json, r.receipt_hash
          FROM staged_public_artifact_provenance p
          JOIN run_commands c ON c.run_id=p.run_id
          JOIN invocations i ON i.reservation_id=p.reservation_id
          JOIN receipts r ON r.reservation_id=p.reservation_id
          WHERE p.public_alias=? AND p.run_id=? AND p.session_id=?
        `).get(input.artifactId, input.runId, input.sessionId) as Row | undefined;
        const manifest = row ? this.readStagedPublicArtifactManifest(row) : null;
        if (!row || !manifest || row.local_principal_id !== input.localPrincipalId
          || row.command_session_id !== input.sessionId) return { kind: "rejected" };
        const invocation = this.toInvocation(row);
        const receipt = this.toReceipt(row);
        if (!this.receiptMatches(receipt, invocation) || receipt.outputArtifactId !== input.artifactId) {
          return { kind: "rejected" };
        }
        const binding = this.db.prepare("SELECT * FROM receipt_public_event_bindings WHERE reservation_id=?")
          .get(row.reservation_id) as Row | undefined;
        if (!binding || binding.receipt_id !== receipt.receiptId || binding.run_id !== input.runId
          || binding.attempt_id !== receipt.attemptId || hashBytes(binding.events_json) !== binding.events_hash) return { kind: "rejected" };
        const boundEvents = JSON.parse(binding.events_json) as StoredEvent[];
        if (!Number.isSafeInteger(binding.expected_sequence) || binding.first_sequence !== binding.expected_sequence + 1
          || binding.last_sequence !== binding.expected_sequence + boundEvents.length
          || !boundEvents.every((event, index) => event.runId === input.runId && event.attemptId === receipt.attemptId
            && event.sequence === binding.expected_sequence + index + 1)
          || !this.isValidReceiptPublicEvents(receipt, boundEvents)) return { kind: "rejected" };
        if (input.eventBinding.kind === "tool_result_presented"
          && (input.eventBinding.invocationId !== row.origin_invocation_id
            || input.eventBinding.status !== receipt.status)) return { kind: "rejected" };
        if (input.eventBinding.kind === "verification_updated"
          && !receipt.verificationArtifactIds.includes(input.artifactId)) return { kind: "rejected" };
        return { kind: "authorized", manifest };
      })();
    } catch {
      return { kind: "rejected" };
    }
  }

  async authorizePublicStoredEvent(
    input: AuthorizePublicStoredEventInput,
  ): Promise<AuthorizePublicStoredEventResult> {
    try {
      return this.db.transaction((): AuthorizePublicStoredEventResult => {
        const command = this.db.prepare("SELECT * FROM run_commands WHERE run_id=?").get(input.event.runId) as Row | undefined;
        if (!command || command.local_principal_id !== input.localPrincipalId || command.session_id !== input.sessionId) return { kind: "rejected" };
        if (input.event.kind !== "tool_result_presented" && input.event.kind !== "verification_updated") return { kind: "authorized" };
        const bindings = this.db.prepare("SELECT * FROM receipt_public_event_bindings WHERE run_id=? AND attempt_id=?")
          .all(input.event.runId, input.event.attemptId) as Row[];
        const binding = bindings.find((candidate) => {
          if (hashBytes(candidate.events_json) !== candidate.events_hash) return false;
          try { return (JSON.parse(candidate.events_json) as StoredEvent[]).some((event) => sameJson(event, input.event)); }
          catch { return false; }
        });
        if (!binding) return { kind: "rejected" };
        const receiptRow = this.db.prepare("SELECT * FROM receipts WHERE reservation_id=?").get(binding.reservation_id) as Row | undefined;
        const invocationRow = this.db.prepare("SELECT * FROM invocations WHERE reservation_id=?").get(binding.reservation_id) as Row | undefined;
        if (!receiptRow || !invocationRow || binding.receipt_id !== receiptRow.receipt_id
          || binding.run_id !== input.event.runId || binding.attempt_id !== input.event.attemptId
          || receiptRow.run_id !== input.event.runId || receiptRow.attempt_id !== input.event.attemptId) return { kind: "rejected" };
        const receipt = this.toReceipt(receiptRow); const invocation = this.toInvocation(invocationRow);
        const events = JSON.parse(binding.events_json) as StoredEvent[];
        if (!Number.isSafeInteger(binding.expected_sequence) || binding.first_sequence !== binding.expected_sequence + 1
          || binding.last_sequence !== binding.expected_sequence + events.length
          || !events.every((event, index) => event.runId === input.event.runId && event.attemptId === input.event.attemptId
            && event.sequence === binding.expected_sequence + index + 1)
          || !this.receiptMatches(receipt, invocation) || !this.isValidReceiptPublicEvents(receipt, events)) return { kind: "rejected" };
        return { kind: "authorized" };
      })();
    } catch { return { kind: "rejected" }; }
  }

  async putArtifact(input: PutArtifactInput): Promise<ArtifactRef> {
    assertPersistableBytes(input.content, "artifact.content");
    if (input.metadata !== undefined) assertPersistableJson(input.metadata, "artifact.metadata");
    const actualHash = hashBytes(input.content);
    if (actualHash !== input.contentHash) throw new IdempotencyConflictError("artifact_content_hash_conflict");
    const metadata = input.metadata === undefined ? null : canonicalJson(input.metadata);
    return this.db.transaction(() => {
      const prior = this.db.prepare("SELECT * FROM artifacts WHERE artifact_id=?").get(input.artifactId) as Row | undefined;
      if (prior) {
        if (prior.content_hash !== input.contentHash || prior.media_type !== input.mediaType || prior.byte_length !== input.content.byteLength || prior.visibility !== input.visibility || prior.metadata_json !== metadata || prior.created_at !== input.createdAt) throw new IdempotencyConflictError("artifact_conflict");
        return this.toArtifactRef(prior);
      }
      this.db.prepare("INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?)").run(input.artifactId, input.contentHash, input.mediaType, Buffer.from(input.content), input.content.byteLength, input.visibility, metadata, input.createdAt);
      return { artifactId: input.artifactId, contentHash: input.contentHash, mediaType: input.mediaType, byteLength: input.content.byteLength, visibility: input.visibility };
    })();
  }

  async getArtifact(id: string): Promise<Artifact | null> {
    const row = this.db.prepare("SELECT * FROM artifacts WHERE artifact_id=?").get(id) as Row | undefined;
    if (!row) return null;
    if (row.content.byteLength !== row.byte_length || hashBytes(row.content) !== row.content_hash) throw new StoreIntegrityError("artifact_hash_drift");
    const artifact = { ...this.toArtifactRef(row), createdAt: row.created_at, content: new Uint8Array(row.content) };
    return row.metadata_json === null ? artifact : { ...artifact, metadata: JSON.parse(row.metadata_json) as JsonValue };
  }

  async acquireLease(input: LeaseRequest): Promise<LeaseResult> {
    this.requireTtl(input.ttlMs); requireTimestamp(input.requestedAt, "requestedAt");
    return this.db.transaction((): LeaseResult => {
      const now = this.clock();
      const run = this.db.prepare("SELECT active_attempt_id FROM runs WHERE run_id=?").get(input.runId) as Row | undefined;
      if (!run || run.active_attempt_id !== input.attemptId) return { kind: "conflict", code: "run_attempt_conflict" };
      if (this.isC2bPristineAttempt(input.runId, input.attemptId)) return { kind: "conflict", code: "run_attempt_conflict" };
      const prior = this.db.prepare("SELECT * FROM run_leases WHERE run_id=? AND attempt_id=?").get(input.runId, input.attemptId) as Row | undefined;
      if (prior && Date.parse(prior.expires_at) > now.getTime()) return { kind: "held", expiresAt: prior.expires_at };
      const leaseToken = this.nonce(); const expiresAt = new Date(now.getTime() + input.ttlMs).toISOString();
      this.db.prepare("INSERT INTO run_leases VALUES (?,?,?,?,?) ON CONFLICT(run_id,attempt_id) DO UPDATE SET owner_id=excluded.owner_id,lease_token_hash=excluded.lease_token_hash,expires_at=excluded.expires_at").run(input.runId, input.attemptId, input.ownerId, hashBytes(leaseToken), expiresAt);
      return { kind: "acquired", leaseToken, expiresAt };
    })();
  }

  async renewLease(input: LeaseRenewal): Promise<boolean> {
    this.requireTtl(input.ttlMs); requireTimestamp(input.renewedAt, "renewedAt");
    return this.db.transaction((): boolean => {
      const now = this.clock();
      const tokenHash = hashBytes(input.leaseToken);
      const current = this.db.prepare("SELECT expires_at FROM run_leases WHERE run_id=? AND attempt_id=? AND lease_token_hash=?").get(input.runId, input.attemptId, tokenHash) as Row | undefined;
      if (!current || Date.parse(current.expires_at) <= now.getTime()) return false;
      const expiresAt = new Date(now.getTime() + input.ttlMs).toISOString();
      return this.db.prepare("UPDATE run_leases SET expires_at=? WHERE run_id=? AND attempt_id=? AND lease_token_hash=?").run(expiresAt, input.runId, input.attemptId, tokenHash).changes === 1;
    })();
  }

  /** Server composition helper; intentionally not part of the frozen port. */
  async readRunSessionId(runId: string): Promise<string | null> {
    const row = this.db.prepare("SELECT session_id FROM runs WHERE run_id=?").get(runId) as Row | undefined;
    return row?.session_id ?? null;
  }

  close(): void { this.db.pragma("wal_checkpoint(TRUNCATE)"); this.db.close(); }

  private leaseConflict(runId: string, attemptId: string, token: string): LeaseConflict | null {
    const row = this.db.prepare("SELECT lease_token_hash,expires_at FROM run_leases WHERE run_id=? AND attempt_id=?").get(runId, attemptId) as Row | undefined;
    if (!row || row.lease_token_hash !== hashBytes(token)) return "lease_not_held";
    return Date.parse(row.expires_at) <= this.clock().getTime() ? "lease_expired" : null;
  }
  private validateRunCommandScope(input: RunCommandScope): void {
    assertValidLocalPrincipalId(input.localPrincipalId);
    assertValidWorkspaceId(input.workspaceId);
    assertValidIdempotencyKey(input.idempotencyKey);
  }
  private validateModelStepIdentity(input: Readonly<{
    runId: string;
    attemptId: string;
    modelStepId: string;
    requestFingerprint: string;
  }>): void {
    assertValidGeneratedId(input.runId);
    assertValidGeneratedId(input.attemptId);
    assertValidGeneratedId(input.modelStepId);
    assertValidModelStepFingerprint(input.requestFingerprint);
  }
  private isActiveAttempt(runId: string, attemptId: string): boolean {
    const row = this.db.prepare(
      "SELECT 1 FROM runs WHERE run_id=? AND active_attempt_id=?",
    ).get(runId, attemptId);
    return row !== undefined;
  }
  /** Generic lease/attempt APIs must not bypass C.2b's proof-bearing reclaim. */
  private isC2bPristineAttempt(runId: string, attemptId: string): boolean {
    const run = this.db.prepare("SELECT * FROM runs WHERE run_id=?").get(runId) as Row | undefined;
    const command = this.db.prepare("SELECT * FROM run_commands WHERE run_id=?").get(runId) as Row | undefined;
    const active = this.db.prepare("SELECT * FROM run_attempts WHERE run_id=? AND attempt_id=?").get(runId, attemptId) as Row | undefined;
    if (!run || !command || !active || run.active_attempt_id !== attemptId || run.latest_attempt_number !== 2
      || active.attempt_number !== 2
      || (command.status !== "reserved" && command.status !== "accepted")) return false;
    const initial = this.db.prepare("SELECT * FROM run_attempts WHERE run_id=? AND attempt_id=?").get(runId, command.attempt_id) as Row | undefined;
    // This is deliberately broader than the reclaim proof.  A malformed
    // prefix or drifted watermark must close generic paths, not reopen them.
    return !!initial && initial.attempt_number === 1
      && initial.attempt_id === command.attempt_id
      && initial.attempt_id !== active.attempt_id;
  }
  private toRunCommand(row: Row): StoredRunCommand {
    const base = {
      schemaVersion: "meliora.run-command.v1" as const,
      localPrincipalId: row.local_principal_id,
      workspaceId: row.workspace_id,
      idempotencyKey: row.idempotency_key,
      canonicalRequestHash: row.canonical_request_hash,
      sessionId: row.session_id,
      turnId: row.turn_id,
      runId: row.run_id,
      initialAttemptId: row.attempt_id,
      attemptId: row.attempt_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return row.status === "terminal"
      ? {
          ...base,
          status: "terminal",
          terminalStatus: row.terminal_status,
          ...(row.terminal_code === null ? {} : { terminalCode: row.terminal_code }),
        }
      : { ...base, status: row.status };
  }
  private toModelStep(row: Row): StoredModelStepCheckpoint {
    const base = {
      schemaVersion: "meliora.model-step-checkpoint.v1" as const,
      runId: row.run_id,
      attemptId: row.attempt_id,
      modelStepId: row.model_step_id,
      requestFingerprint: row.request_fingerprint,
      startedAt: row.started_at,
    };
    if (row.status === "started") return { ...base, status: "started" };
    if (row.status === "terminal") {
      return { ...base, status: "terminal", finishedAt: row.finished_at };
    }
    return {
      ...base,
      status: "failed",
      finishedAt: row.finished_at,
      failureCode: row.failure_code,
    };
  }
  private requireTtl(ttlMs: number): void { if (!Number.isInteger(ttlMs) || ttlMs < 1) throw new TypeError("lease_ttl_invalid"); }
  private requireRecoveryLimit(limit: number, maximum: number, message: string): void {
    if (!Number.isInteger(limit) || limit < 1 || limit > maximum) throw new TypeError(message);
  }
  private toSession(row: Row): SessionRecord { return { schemaVersion: "meliora.session.v1", sessionId: row.session_id, workspaceId: row.workspace_id, createdAt: row.created_at, updatedAt: row.updated_at }; }
  private toTurn(row: Row): TurnRecord { return { schemaVersion: "meliora.turn.v1", sessionId: row.session_id, turnId: row.turn_id, intentRevision: row.intent_revision, createdAt: row.created_at, updatedAt: row.updated_at }; }
  private toRun(row: Row): PersistedRunRecord { return { schemaVersion: "meliora.persisted-run.v1", sessionId: row.session_id, turnId: row.turn_id, runId: row.run_id, activeAttemptId: row.active_attempt_id, latestAttemptNumber: row.latest_attempt_number, createdAt: row.created_at, updatedAt: row.updated_at }; }
  private toAttempt(row: Row): PersistedRunAttempt { return { schemaVersion: "meliora.persisted-run-attempt.v1", sessionId: row.session_id, turnId: row.turn_id, runId: row.run_id, attemptId: row.attempt_id, attemptNumber: row.attempt_number, status: row.status, lastEventSequence: row.last_event_sequence, catalogHash: row.catalog_hash, intentRevision: row.intent_revision, runtimeState: JSON.parse(row.runtime_state_json) as JsonValue, createdAt: row.created_at, updatedAt: row.updated_at }; }
  private toPrivateUserInput(row: Row): StoredPrivateUserInput {
    if (hashBytes(row.content) !== row.content_hash) throw new StoreIntegrityError("private_user_input_hash_drift");
    return { schemaVersion: "meliora.private-user-input.v1", sessionId: row.session_id, turnId: row.turn_id, role: "user", visibility: "private", content: row.content, contentHash: row.content_hash, createdAt: row.created_at };
  }
  private toSnapshot(row: Row): RunSnapshot {
    if (hashBytes(row.state_json) !== row.state_hash) throw new StoreIntegrityError("snapshot_hash_drift");
    const state = JSON.parse(row.state_json);
    const snapshot = { schemaVersion: "meliora.run-snapshot.v1" as const, snapshotId: row.snapshot_id, runId: row.run_id, attemptId: row.attempt_id, throughSequence: row.through_sequence, state, createdAt: row.created_at };
    // Hash verification only proves byte stability. Revalidate the complete
    // runtime envelope before exposing anything to recovery callers.
    assertValidRunSnapshot(snapshot);
    this.assertSnapshotIntegrity(snapshot);
    this.assertTerminalResultSnapshotInvariant(snapshot.runId, snapshot);
    return snapshot;
  }
  private assertSnapshotIntegrity(snapshot: RunSnapshot): void {
    assertValidRunSnapshot(snapshot);
    const terminal = snapshot.state.terminalModelStepResult;
    if (!terminal) return;
    const checkpoint = this.db.prepare("SELECT * FROM model_steps WHERE run_id=? AND model_step_id=?").get(snapshot.runId, terminal.modelStepId) as Row | undefined;
    if (
      terminal.attemptId !== snapshot.attemptId
      || !checkpoint
      || checkpoint.status !== "terminal"
      || checkpoint.attempt_id !== terminal.attemptId
      || checkpoint.request_fingerprint !== terminal.requestFingerprint
    ) throw new StoreIntegrityError("snapshot_integrity_conflict");
  }
  private toTerminalModelStepResultRef(row: Row): import("../contracts.js").TerminalModelStepResultRef {
    return {
      attemptId: row.attempt_id,
      modelStepId: row.model_step_id,
      requestFingerprint: row.request_fingerprint,
      artifact: {
        artifactId: row.artifact_id,
        contentHash: row.artifact_content_hash,
        mediaType: row.artifact_media_type,
        byteLength: row.artifact_byte_length,
        visibility: row.artifact_visibility,
      },
    };
  }
  private terminalResultMatchesSnapshot(row: Row, snapshot: RunSnapshot): boolean {
    const terminal = snapshot.state.terminalModelStepResult;
    return !!terminal
      && row.snapshot_id === snapshot.snapshotId
      && row.through_sequence === snapshot.throughSequence
      && row.state_hash === hashBytes(canonicalJson(snapshot.state))
      && sameJson(this.toTerminalModelStepResultRef(row), terminal);
  }
  /** The terminal-result row and snapshot binding are one inseparable recovery fact. */
  private assertTerminalResultSnapshotInvariant(
    runId: string,
    snapshot: RunSnapshot | null,
  ): import("../contracts.js").TerminalModelStepResultRef | null {
    const rows = this.db.prepare("SELECT * FROM model_step_terminal_results WHERE run_id=? ORDER BY model_step_id ASC")
      .all(runId) as Row[];
    const histories = this.db.prepare("SELECT * FROM run_snapshot_history WHERE run_id=? ORDER BY commit_ordinal ASC")
      .all(runId) as Row[];
    if (rows.length !== histories.length) throw new StoreIntegrityError("snapshot_integrity_conflict");
    if (rows.length === 0) {
      if (snapshot?.state.terminalModelStepResult) throw new StoreIntegrityError("snapshot_integrity_conflict");
      return null;
    }
    const historyById = new Map(histories.map((history) => [history.snapshot_id, history]));
    for (const row of rows) {
      const history = historyById.get(row.snapshot_id);
      if (!history || history.run_id !== runId || history.attempt_id !== row.attempt_id || history.commit_ordinal !== row.commit_ordinal || history.commit_ordinal <= 0
        || history.through_sequence !== row.through_sequence || history.state_hash !== row.state_hash) {
        throw new StoreIntegrityError("snapshot_integrity_conflict");
      }
      const historicalSnapshot = this.toHistoricalSnapshot(history);
      if (row.snapshot_envelope_hash !== hashBytes(canonicalJson(historicalSnapshot))) throw new StoreIntegrityError("snapshot_integrity_conflict");
      if (!this.terminalResultMatchesSnapshot(row, historicalSnapshot)) throw new StoreIntegrityError("snapshot_integrity_conflict");
      const checkpoint = this.db.prepare("SELECT * FROM model_steps WHERE model_step_id=?")
        .get(row.model_step_id) as Row | undefined;
      const artifact = this.db.prepare("SELECT * FROM artifacts WHERE artifact_id=?").get(row.artifact_id) as Row | undefined;
      if (!checkpoint || checkpoint.status !== "terminal" || checkpoint.finished_at !== row.finished_at
        || !artifact || Buffer.from(artifact.content).byteLength !== artifact.byte_length
        || hashBytes(artifact.content) !== artifact.content_hash
        || !sameJson(this.toArtifactRef(artifact), this.toTerminalModelStepResultRef(row).artifact)) {
        throw new StoreIntegrityError("snapshot_integrity_conflict");
      }
    }
    if (new Set(histories.map((history) => history.commit_ordinal)).size !== histories.length) throw new StoreIntegrityError("snapshot_integrity_conflict");
    const latestHistory = histories.at(-1)!;
    const latest = rows.find((row) => row.snapshot_id === latestHistory.snapshot_id);
    if (!latest) throw new StoreIntegrityError("snapshot_integrity_conflict");
    const latestSnapshot = this.toHistoricalSnapshot(latestHistory);
    if (!snapshot || latest.commit_ordinal !== latestHistory.commit_ordinal || latest.snapshot_envelope_hash !== hashBytes(canonicalJson(snapshot)) || !sameJson(snapshot, latestSnapshot)) {
      throw new StoreIntegrityError("snapshot_integrity_conflict");
    }
    return this.toTerminalModelStepResultRef(latest);
  }
  private toHistoricalSnapshot(row: Row): RunSnapshot {
    if (hashBytes(row.state_json) !== row.state_hash) throw new StoreIntegrityError("snapshot_integrity_conflict");
    const snapshot = {
      schemaVersion: "meliora.run-snapshot.v1" as const, snapshotId: row.snapshot_id, runId: row.run_id,
      attemptId: row.attempt_id, throughSequence: row.through_sequence, state: JSON.parse(row.state_json), createdAt: row.created_at,
    };
    assertValidRunSnapshot(snapshot);
    this.assertSnapshotIntegrity(snapshot);
    return snapshot;
  }
  private toEvent(row: Row): StoredEvent {
    const event: StoredEvent = { schemaVersion: row.schema_version, eventId: row.event_id, runId: row.run_id, attemptId: row.attempt_id, sequence: row.sequence, kind: row.kind, visibility: row.visibility, payload: JSON.parse(row.payload_json) as JsonValue, createdAt: row.created_at, ...(row.causation_id === null ? {} : { causationId: row.causation_id }), ...(row.correlation_id === null ? {} : { correlationId: row.correlation_id }) };
    if (hashBytes(json(event)) !== row.event_hash) throw new StoreIntegrityError("event_hash_drift");
    return event;
  }
  private toInvocation(row: Row): NormalizedToolInvocation { if (hashBytes(row.invocation_json) !== row.invocation_hash) throw new StoreIntegrityError("invocation_hash_drift"); return JSON.parse(row.invocation_json) as NormalizedToolInvocation; }
  private toReservation(row: Row): StoredInvocationReservation {
    return {
      reservationId: row.reservation_id, runId: row.run_id, attemptId: row.attempt_id,
      invocationId: row.invocation_id, idempotencyKey: row.idempotency_key, status: row.status,
      reservedAt: row.reserved_at, ...(row.execution_started_at === null || row.execution_started_at === undefined ? {} : { executionStartedAt: row.execution_started_at }),
    };
  }
  private toReceipt(row: Row): ToolReceipt { if (hashBytes(row.receipt_json) !== row.receipt_hash) throw new StoreIntegrityError("receipt_hash_drift"); return JSON.parse(row.receipt_json) as ToolReceipt; }
  private receiptForReservation(id: string): ToolReceipt | null { const row = this.db.prepare("SELECT * FROM receipts WHERE reservation_id=?").get(id) as Row | undefined; return row ? this.toReceipt(row) : null; }
  private sameInvocation(a: NormalizedToolInvocation, b: NormalizedToolInvocation): boolean { return a.invocationId === b.invocationId && a.runId === b.runId && a.attemptId === b.attemptId && a.toolName === b.toolName && a.toolVersion === b.toolVersion && a.argumentsHash === b.argumentsHash && a.catalogHash === b.catalogHash && a.idempotencyKey === b.idempotencyKey && sameJson(a.arguments, b.arguments); }
  private receiptMatches(receipt: ToolReceipt, invocation: NormalizedToolInvocation): boolean { return receipt.invocationId === invocation.invocationId && receipt.runId === invocation.runId && receipt.attemptId === invocation.attemptId && receipt.toolName === invocation.toolName && receipt.toolVersion === invocation.toolVersion && receipt.argumentsHash === invocation.argumentsHash && receipt.catalogHash === invocation.catalogHash; }
  private isValidReceiptPublicEvents(receipt: ToolReceipt, events: readonly StoredEvent[]): boolean {
    if (!receipt.outputArtifactId || receipt.verificationArtifactIds.some((id) => id !== receipt.outputArtifactId)
      || (receipt.verificationArtifactIds.length > 0 && receipt.status !== "succeeded")
      || events.length !== (receipt.verificationArtifactIds.length > 0 ? 2 : 1)) return false;
    const staged = this.db.prepare("SELECT * FROM staged_public_artifact_provenance WHERE public_alias=?").get(receipt.outputArtifactId) as Row | undefined;
    if (!staged) return false;
    const manifest = staged ? this.readStagedPublicArtifactManifest(staged) : null;
    if (!manifest || staged.origin_attempt_id !== receipt.attemptId || staged.origin_invocation_id !== receipt.invocationId) return false;
    const tool = events[0]; const payload = tool?.payload as Record<string, unknown>;
    if (!tool || tool.visibility !== "public" || tool.kind !== "tool_result_presented"
      || payload.invocationId !== receipt.invocationId || payload.status !== receipt.status || payload.summary !== receipt.effectSummary
      || !sameJson(payload.artifactRefs, [{ artifactId: receipt.outputArtifactId, visibility: "public" }])) return false;
    if (receipt.verificationArtifactIds.length === 0) return true;
    const verification = events[1]; const verificationPayload = verification?.payload as Record<string, unknown>;
    return !!verification && verification.visibility === "public" && verification.kind === "verification_updated"
      && verificationPayload.status === "passed"
      && sameJson(verificationPayload.evidenceRefs, receipt.verificationArtifactIds.map((artifactId) => ({ artifactId, visibility: "public" })));
  }
  private toArtifactRef(row: Row): ArtifactRef { return { artifactId: row.artifact_id, contentHash: row.content_hash, mediaType: row.media_type, byteLength: row.byte_length, visibility: row.visibility }; }
  private readStagedPublicArtifactManifest(row: Row): StagedPublicArtifactManifest | null {
    const run = this.db.prepare("SELECT session_id FROM runs WHERE run_id=?").get(row.run_id) as Row | undefined;
    const attempt = this.db.prepare("SELECT session_id FROM run_attempts WHERE run_id=? AND attempt_id=?")
      .get(row.run_id, row.origin_attempt_id) as Row | undefined;
    const invocation = this.db.prepare("SELECT * FROM invocations WHERE reservation_id=?")
      .get(row.reservation_id) as Row | undefined;
    const physical = this.db.prepare("SELECT * FROM artifacts WHERE artifact_id=?")
      .get(row.physical_artifact_id) as Row | undefined;
    if (!run || !attempt || !invocation || !physical
      || run.session_id !== row.session_id || attempt.session_id !== row.session_id
      || invocation.run_id !== row.run_id || invocation.attempt_id !== row.origin_attempt_id
      || invocation.invocation_id !== row.origin_invocation_id || invocation.reservation_id !== row.reservation_id
      || physical.visibility !== "private" || physical.media_type !== "text/plain"
      || physical.content_hash !== row.content_hash || physical.byte_length !== row.byte_length
      || physical.created_at !== row.created_at || Buffer.from(physical.content).byteLength !== physical.byte_length
      || hashBytes(physical.content) !== physical.content_hash || row.physical_visibility !== "private"
      || row.projection_kind !== "tool_result" || row.media_type !== "text/plain") return null;
    // Verify the canonical invocation record as part of the reservation binding;
    // any tampered invocation payload is a fail-closed staged miss.
    this.toInvocation(invocation);
    return {
      artifactId: row.public_alias, visibility: "public", contentHash: row.content_hash, mediaType: "text/plain",
      byteLength: row.byte_length, createdAt: row.created_at, projectionKind: "tool_result",
    };
  }
}
