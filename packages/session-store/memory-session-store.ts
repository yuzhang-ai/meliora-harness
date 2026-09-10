import type {
  AppendEventsInput,
  AppendEventsResult,
  Artifact,
  ArtifactRef,
  CommitReceiptInput,
  CommitReceiptResult,
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
  ReadEventsInput,
  ReadInvocationInput,
  ReadInvocationByIdempotencyKeyInput,
  ReadReceiptInput,
  ReadReservationInput,
  ReservationResult,
  RunSnapshot,
  SessionRecord,
  SessionStorePort,
  StoredEvent,
  StoredInvocationReservation,
  TurnRecord,
  WriteSnapshotInput,
  InvocationReconciliationRecord,
} from "./contracts";
import type { NormalizedToolInvocation, ToolReceipt } from "../tool-runtime/contracts";

type Lease = Readonly<{ token: string; ownerId: string; expiresAt: string }>;

type MemorySessionStoreOptions = Readonly<{
  clock?: () => Date;
  nextLeaseToken?: () => string;
  nextReservationId?: () => string;
}>;

const attemptKey = (runId: string, attemptId: string) => `${runId}\u0000${attemptId}`;
const invocationKey = (runId: string, attemptId: string, invocationId: string) =>
  `${runId}\u0000${attemptId}\u0000${invocationId}`;
const receiptKey = (runId: string, attemptId: string, receiptId: string) =>
  `${runId}\u0000${attemptId}\u0000${receiptId}`;
const sameDocument = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
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
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly turns = new Map<string, TurnRecord>();
  private readonly runs = new Map<string, PersistedRunRecord>();
  private readonly attempts = new Map<string, PersistedRunAttempt>();
  private readonly events = new Map<string, StoredEvent[]>();
  private readonly snapshots = new Map<string, RunSnapshot>();
  private readonly invocations = new Map<string, NormalizedToolInvocation>();
  private readonly reservations = new Map<string, StoredInvocationReservation>();
  private readonly reservationByRunIdempotencyKey = new Map<string, string>();
  private readonly receipts = new Map<string, ToolReceipt>();
  private readonly receiptByReservation = new Map<string, string>();
  private readonly artifacts = new Map<string, Artifact>();
  private readonly leases = new Map<string, Lease>();
  private leaseSequence = 0;
  private reservationSequence = 0;

  private readonly clock: () => Date;
  private readonly nextLeaseToken: () => string;
  private readonly nextReservationId: () => string;

  constructor(options: MemorySessionStoreOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.nextLeaseToken = options.nextLeaseToken ?? (() => `lease-${++this.leaseSequence}`);
    this.nextReservationId = options.nextReservationId ?? (() => `reservation-${++this.reservationSequence}`);
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
    const lease = this.newLease(input.ownerId, input.ttlMs, input.requestedAt);
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
    this.events.set(input.runId, [...previous, ...appended]);
    this.attempts.set(attemptKey(input.runId, input.attemptId), {
      ...attempt,
      lastEventSequence: lastSequence,
      updatedAt: this.clock().toISOString(),
    });
    return { kind: "appended", events: appended, lastSequence };
  }

  async readEvents(input: ReadEventsInput): Promise<EventPage> {
    const after = input.afterSequence ?? 0;
    const eligible = (this.events.get(input.runId) ?? []).filter((event) => event.sequence > after);
    const events = eligible.slice(0, input.limit);
    return {
      events,
      nextSequence: eligible.length > events.length ? events.at(-1)?.sequence ?? null : null,
    };
  }

  async writeSnapshot(input: WriteSnapshotInput): Promise<void> {
    const attempt = this.attempts.get(attemptKey(input.snapshot.runId, input.snapshot.attemptId));
    if (!attempt || attempt.lastEventSequence !== input.expectedSequence) throw new Error("snapshot_sequence_conflict");
    const leaseConflict = this.leaseConflict(input.snapshot.runId, input.snapshot.attemptId, input.leaseToken);
    if (leaseConflict) throw new Error(leaseConflict);
    this.snapshots.set(input.snapshot.runId, input.snapshot);
  }

  async readSnapshot(runId: string): Promise<RunSnapshot | null> {
    return this.snapshots.get(runId) ?? null;
  }

  async reserveInvocation(input: InvocationReservationInput): Promise<ReservationResult> {
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
    this.invocations.set(key, input.invocation);
    this.reservations.set(reservationId, reservation);
    this.reservationByRunIdempotencyKey.set(idempotencyKey, reservationId);
    return { kind: "owner", reservationId };
  }

  async readInvocation(input: ReadInvocationInput): Promise<NormalizedToolInvocation | null> {
    return this.invocations.get(invocationKey(input.runId, input.attemptId, input.invocationId)) ?? null;
  }

  async readReservation(input: ReadReservationInput): Promise<StoredInvocationReservation | null> {
    const invocation = await this.readInvocation(input);
    if (!invocation) return null;
    const reservationId = this.reservationByRunIdempotencyKey.get(`${input.runId}\u0000${invocation.idempotencyKey}`);
    return reservationId ? this.reservations.get(reservationId) ?? null : null;
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
    return {
      reservation,
      invocation,
      receipt: receiptId ? this.receipts.get(receiptKey(reservation.runId, reservation.attemptId, receiptId)) ?? null : null,
    };
  }

  async commitReceipt(input: CommitReceiptInput): Promise<CommitReceiptResult> {
    if (!this.attemptForRun(input.runId, input.attemptId)) {
      return { kind: "conflict", code: "run_attempt_conflict" };
    }
    const leaseConflict = this.leaseConflict(input.runId, input.attemptId, input.leaseToken);
    if (leaseConflict) return { kind: "conflict", code: leaseConflict };
    const reservation = this.reservations.get(input.reservationId);
    if (!reservation || reservation.runId !== input.runId || reservation.attemptId !== input.attemptId || reservation.invocationId !== input.receipt.invocationId) {
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

  async putArtifact(input: PutArtifactInput): Promise<ArtifactRef> {
    const artifact: Artifact = {
      artifactId: input.artifactId,
      contentHash: input.contentHash,
      mediaType: input.mediaType,
      byteLength: input.content.byteLength,
      visibility: input.visibility,
      createdAt: input.createdAt,
      content: new Uint8Array(input.content),
      metadata: input.metadata,
    };
    this.artifacts.set(artifact.artifactId, artifact);
    const { content: _content, createdAt: _createdAt, metadata: _metadata, ...reference } = artifact;
    return reference;
  }

  async getArtifact(id: string): Promise<Artifact | null> {
    const artifact = this.artifacts.get(id);
    return artifact ? { ...artifact, content: new Uint8Array(artifact.content) } : null;
  }

  async acquireLease(input: LeaseRequest): Promise<LeaseResult> {
    if (!this.attemptForRun(input.runId, input.attemptId)) {
      return { kind: "conflict", code: "run_attempt_conflict" };
    }
    const activeLease = this.activeLeaseForRun(input.runId);
    if (activeLease) return { kind: "held", expiresAt: activeLease.expiresAt };
    const lease = this.newLease(input.ownerId, input.ttlMs, input.requestedAt);
    this.leases.set(attemptKey(input.runId, input.attemptId), lease);
    return { kind: "acquired", leaseToken: lease.token, expiresAt: lease.expiresAt };
  }

  async renewLease(input: LeaseRenewal): Promise<boolean> {
    const key = attemptKey(input.runId, input.attemptId);
    const lease = this.leases.get(key);
    if (!lease || lease.token !== input.leaseToken || this.isExpired(lease)) return false;
    this.leases.set(key, {
      ...lease,
      expiresAt: this.expiresAt(input.renewedAt, input.ttlMs),
    });
    return true;
  }

  private newLease(ownerId: string, ttlMs: number, requestedAt: string): Lease {
    return { token: this.nextLeaseToken(), ownerId, expiresAt: this.expiresAt(requestedAt, ttlMs) };
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

  private receiptMatchesInvocation(receipt: ToolReceipt, invocation: NormalizedToolInvocation): boolean {
    return receipt.invocationId === invocation.invocationId &&
      receipt.runId === invocation.runId &&
      receipt.attemptId === invocation.attemptId &&
      receipt.toolName === invocation.toolName &&
      receipt.toolVersion === invocation.toolVersion &&
      receipt.argumentsHash === invocation.argumentsHash &&
      receipt.catalogHash === invocation.catalogHash;
  }

  private leaseConflict(runId: string, attemptId: string, leaseToken: string): "lease_not_held" | "lease_expired" | null {
    const lease = this.leases.get(attemptKey(runId, attemptId));
    if (!lease || lease.token !== leaseToken) return "lease_not_held";
    return this.isExpired(lease) ? "lease_expired" : null;
  }
}
