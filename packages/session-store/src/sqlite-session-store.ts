import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import type { JsonValue } from "../../model-protocol/contracts.js";
import type { NormalizedToolInvocation, ToolReceipt } from "../../tool-runtime/contracts.js";
import type {
  AppendEventsInput, AppendEventsResult, Artifact, ArtifactRef, CommitReceiptInput, CommitReceiptResult,
  CreateRunAttemptInput, CreateRunAttemptResult, CreateRunInput, CreateSessionInput, CreateTurnInput,
  EventPage, FinishModelStepInput, FinishModelStepResult, InvocationReconciliationRecord,
  InvocationReservationInput, LeaseRenewal, LeaseRequest, LeaseResult, PersistedRunAttempt,
  PersistedRunRecord, PutArtifactInput, ReadEventsInput, ReadLatestModelStepInput, ReadModelStepInput,
  ReadInvocationByIdempotencyKeyInput, ReadInvocationInput, ReadReceiptInput, ReadReservationInput,
  ReadPrivateUserInputInput, ReserveRunCommandInput, ReserveRunCommandResult, ReservationResult,
  RunCommandScope, RunCommandStatus, RunSnapshot, SessionRecord, SessionStorePort, StartModelStepInput,
  StartModelStepResult, StoredEvent, StoredInvocationReservation, StoredModelStepCheckpoint,
  StoredPrivateUserInput, StoredRunCommand, TransitionRunCommandInput, TransitionRunCommandResult,
  TurnRecord, WriteSnapshotInput,
} from "../contracts.js";
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
} from "../run-command-contract.js";
import { IdempotencyConflictError, SequenceConflictError, StoreIntegrityError } from "./errors.js";
import { canonicalJson, hashBytes } from "./integrity.js";
import { assertPersistableBytes, assertPersistableJson } from "./sensitive-data.js";

type Migration = Readonly<{ version: number; name: string; sql: string; checksum: string }>;
const loadMigration = (version: number, name: string): Migration => {
  const sql = readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
  return { version, name, sql, checksum: hashBytes(sql) };
};
const MIGRATIONS = [
  loadMigration(1, "0001_initial.sql"),
  loadMigration(2, "0002_durable_commands.sql"),
] as const;
const LATEST_MIGRATION_VERSION = MIGRATIONS.at(-1)!.version;
type Options = Readonly<{ clock?: () => Date; nonce?: () => string }>;
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

  constructor(databasePath: string, options: Options = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.nonce = options.nonce ?? randomUUID;
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
        this.db.prepare("INSERT INTO schema_migrations VALUES (?,?,?,?)")
          .run(migration.version, migration.name, migration.checksum, this.clock().toISOString());
        this.db.pragma(`user_version = ${migration.version}`);
      }).immediate();
    }
    this.verifyMigrationHistory();
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

  async readPrivateUserInput(input: ReadPrivateUserInputInput): Promise<StoredPrivateUserInput | null> {
    assertValidGeneratedId(input.sessionId);
    assertValidGeneratedId(input.turnId);
    const row = this.db.prepare(
      "SELECT * FROM run_command_inputs WHERE session_id=? AND turn_id=?",
    ).get(input.sessionId, input.turnId) as Row | undefined;
    if (!row) return null;
    if (hashBytes(row.content) !== row.content_hash) throw new StoreIntegrityError("private_user_input_hash_drift");
    return {
      schemaVersion: "meliora.private-user-input.v1",
      sessionId: row.session_id,
      turnId: row.turn_id,
      role: "user",
      visibility: "private",
      content: row.content,
      contentHash: row.content_hash,
      createdAt: row.created_at,
    };
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
      requireId(event.eventId, "eventId");
      requireTimestamp(event.createdAt, "event.createdAt");
      assertPersistableJson(event.payload, "event.payload");
    }
    return this.db.transaction((): AppendEventsResult => {
      const attempt = this.db.prepare("SELECT * FROM run_attempts WHERE run_id=? AND attempt_id=?").get(input.runId, input.attemptId) as Row | undefined;
      if (!attempt) return { kind: "conflict", code: "run_attempt_conflict" };
      const lease = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
      if (lease) return { kind: "conflict", code: lease };
      if (attempt.last_event_sequence !== input.expectedSequence) return { kind: "conflict", code: "event_sequence_conflict", currentSequence: attempt.last_event_sequence };
      const events: StoredEvent[] = input.events.map((event, index) => ({ ...event, runId: input.runId, attemptId: input.attemptId, sequence: input.expectedSequence + index + 1 }));
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

  async writeSnapshot(input: WriteSnapshotInput): Promise<void> {
    const snapshot = input.snapshot; assertPersistableJson(snapshot.state, "snapshot.state");
    this.db.transaction(() => {
      const attempt = this.db.prepare("SELECT last_event_sequence FROM run_attempts WHERE run_id=? AND attempt_id=?").get(snapshot.runId, snapshot.attemptId) as Row | undefined;
      if (!attempt || attempt.last_event_sequence !== input.expectedSequence || snapshot.throughSequence > input.expectedSequence) throw new SequenceConflictError(snapshot.runId, input.expectedSequence, attempt?.last_event_sequence ?? -1);
      const lease = this.leaseConflict(snapshot.runId, snapshot.attemptId, input.leaseToken); if (lease) throw new IdempotencyConflictError(lease);
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

  async readSnapshot(runId: string): Promise<RunSnapshot | null> {
    const row = this.db.prepare("SELECT * FROM run_snapshots WHERE run_id=?").get(runId) as Row | undefined;
    if (!row) return null;
    if (hashBytes(row.state_json) !== row.state_hash) throw new StoreIntegrityError("snapshot_hash_drift");
    return { schemaVersion: "meliora.run-snapshot.v1", snapshotId: row.snapshot_id, runId: row.run_id, attemptId: row.attempt_id, throughSequence: row.through_sequence, state: JSON.parse(row.state_json) as JsonValue, createdAt: row.created_at };
  }

  async reserveInvocation(input: InvocationReservationInput): Promise<ReservationResult> {
    const invocation = input.invocation;
    assertPersistableJson(JSON.parse(JSON.stringify(invocation)) as JsonValue, "invocation");
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
      this.db.prepare("INSERT INTO invocations VALUES (?,?,?,?,?,?,?,?,?)").run(invocation.invocationId, invocation.runId, invocation.attemptId, reservationId, invocation.idempotencyKey, body, hashBytes(body), invocation.status, input.reservedAt);
      return { kind: "owner", reservationId };
    })();
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
      if (!this.db.prepare("SELECT 1 FROM run_attempts WHERE run_id=? AND attempt_id=?").get(input.runId, input.attemptId)) return { kind: "conflict", code: "run_attempt_conflict" };
      const lease = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
      if (lease) return { kind: "conflict", code: lease };
      const row = this.db.prepare("SELECT * FROM invocations WHERE reservation_id=?").get(input.reservationId) as Row | undefined;
      if (!row || row.run_id !== input.runId || row.attempt_id !== input.attemptId || row.invocation_id !== input.receipt.invocationId) return { kind: "conflict", code: "invocation_reservation_conflict" };
      const invocation = this.toInvocation(row);
      if (!this.receiptMatches(input.receipt, invocation)) return { kind: "conflict", code: "receipt_conflict" };
      const prior = this.db.prepare("SELECT * FROM receipts WHERE reservation_id=?").get(input.reservationId) as Row | undefined;
      if (prior) return sameJson(JSON.parse(prior.receipt_json), input.receipt) ? { kind: "replay", receiptId: prior.receipt_id } : { kind: "conflict", code: "receipt_conflict" };
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

  async readReceipt(input: ReadReceiptInput): Promise<ToolReceipt | null> {
    const row = this.db.prepare("SELECT * FROM receipts WHERE run_id=? AND attempt_id=? AND receipt_id=?").get(input.runId, input.attemptId, input.receiptId) as Row | undefined;
    return row ? this.toReceipt(row) : null;
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
  private toSession(row: Row): SessionRecord { return { schemaVersion: "meliora.session.v1", sessionId: row.session_id, workspaceId: row.workspace_id, createdAt: row.created_at, updatedAt: row.updated_at }; }
  private toTurn(row: Row): TurnRecord { return { schemaVersion: "meliora.turn.v1", sessionId: row.session_id, turnId: row.turn_id, intentRevision: row.intent_revision, createdAt: row.created_at, updatedAt: row.updated_at }; }
  private toRun(row: Row): PersistedRunRecord { return { schemaVersion: "meliora.persisted-run.v1", sessionId: row.session_id, turnId: row.turn_id, runId: row.run_id, activeAttemptId: row.active_attempt_id, latestAttemptNumber: row.latest_attempt_number, createdAt: row.created_at, updatedAt: row.updated_at }; }
  private toAttempt(row: Row): PersistedRunAttempt { return { schemaVersion: "meliora.persisted-run-attempt.v1", sessionId: row.session_id, turnId: row.turn_id, runId: row.run_id, attemptId: row.attempt_id, attemptNumber: row.attempt_number, status: row.status, lastEventSequence: row.last_event_sequence, catalogHash: row.catalog_hash, intentRevision: row.intent_revision, runtimeState: JSON.parse(row.runtime_state_json) as JsonValue, createdAt: row.created_at, updatedAt: row.updated_at }; }
  private toEvent(row: Row): StoredEvent {
    const event: StoredEvent = { schemaVersion: row.schema_version, eventId: row.event_id, runId: row.run_id, attemptId: row.attempt_id, sequence: row.sequence, kind: row.kind, visibility: row.visibility, payload: JSON.parse(row.payload_json) as JsonValue, createdAt: row.created_at, ...(row.causation_id === null ? {} : { causationId: row.causation_id }), ...(row.correlation_id === null ? {} : { correlationId: row.correlation_id }) };
    if (hashBytes(json(event)) !== row.event_hash) throw new StoreIntegrityError("event_hash_drift");
    return event;
  }
  private toInvocation(row: Row): NormalizedToolInvocation { if (hashBytes(row.invocation_json) !== row.invocation_hash) throw new StoreIntegrityError("invocation_hash_drift"); return JSON.parse(row.invocation_json) as NormalizedToolInvocation; }
  private toReservation(row: Row): StoredInvocationReservation { return { reservationId: row.reservation_id, runId: row.run_id, attemptId: row.attempt_id, invocationId: row.invocation_id, idempotencyKey: row.idempotency_key, status: row.status, reservedAt: row.reserved_at }; }
  private toReceipt(row: Row): ToolReceipt { if (hashBytes(row.receipt_json) !== row.receipt_hash) throw new StoreIntegrityError("receipt_hash_drift"); return JSON.parse(row.receipt_json) as ToolReceipt; }
  private receiptForReservation(id: string): ToolReceipt | null { const row = this.db.prepare("SELECT * FROM receipts WHERE reservation_id=?").get(id) as Row | undefined; return row ? this.toReceipt(row) : null; }
  private sameInvocation(a: NormalizedToolInvocation, b: NormalizedToolInvocation): boolean { return a.invocationId === b.invocationId && a.runId === b.runId && a.attemptId === b.attemptId && a.toolName === b.toolName && a.toolVersion === b.toolVersion && a.argumentsHash === b.argumentsHash && a.catalogHash === b.catalogHash && a.idempotencyKey === b.idempotencyKey && sameJson(a.arguments, b.arguments); }
  private receiptMatches(receipt: ToolReceipt, invocation: NormalizedToolInvocation): boolean { return receipt.invocationId === invocation.invocationId && receipt.runId === invocation.runId && receipt.attemptId === invocation.attemptId && receipt.toolName === invocation.toolName && receipt.toolVersion === invocation.toolVersion && receipt.argumentsHash === invocation.argumentsHash && receipt.catalogHash === invocation.catalogHash; }
  private toArtifactRef(row: Row): ArtifactRef { return { artifactId: row.artifact_id, contentHash: row.content_hash, mediaType: row.media_type, byteLength: row.byte_length, visibility: row.visibility }; }
}
