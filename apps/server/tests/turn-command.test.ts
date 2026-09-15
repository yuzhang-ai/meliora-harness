import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { deepseekStreamTextSingleToolFixture } from "../../../fixtures/contracts/v1/deepseek-stream-text-single-tool.js";
import { listenOnFetchSafeLoopbackPort } from "../../../tests/helpers/fetch-safe-listener.js";
import type { PublicRunEvent } from "../../../packages/agent-runtime/public-events.js";
import type { ReadOnlyRunModelPort } from "../../../packages/agent-runtime/read-only-run-loop.js";
import { MemorySessionStore } from "../../../packages/session-store/memory-session-store.js";
import type {
  CommitTerminalModelStepResultAndSnapshotInput,
  CommitTerminalModelStepResultAndSnapshotResult,
  SessionStorePort,
  SettleRunCommandWithTerminalEventInput,
  SettleRunCommandWithTerminalEventResult,
  StartModelStepInput,
  StartModelStepResult,
} from "../../../packages/session-store/contracts.js";
import { canonicalRunCommandRequestHash, hashBytes, SqliteSessionStore } from "../../../packages/session-store/index.js";
import {
  TURN_COMMAND_REQUEST_SCHEMA_VERSION,
  type TurnCommandResponse,
} from "../api-contracts/turn-command.js";
import { createMelioraServer } from "../src/server.js";
import {
  createDefaultTurnCommandIds,
  createFrozenReadOnlyWorkspaceCatalog,
  createSafeRecoveryTurnDispatcher,
  createTurnCommandSubmitter,
  type TurnCommandIds,
} from "../src/turn-command-composition.js";

const fixedNow = "2026-09-12T03:00:00.000Z";
const workspaceId = "workspace-server-fixture";
const privateMarker = "SERVER_PRIVATE_WORKSPACE_SECRET";

const deterministicIds = (): TurnCommandIds => {
  const counters = new Map<string, number>();
  const next = (prefix: string): string => {
    const value = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, value);
    return `${prefix}-${value}`;
  };
  return {
    nextSessionId: () => next("session"),
    nextTurnId: () => next("turn"),
    nextRunId: () => next("run"),
    nextAttemptId: () => next("attempt"),
    nextArtifactId: () => next("artifact"),
    nextVerificationId: () => next("verification"),
    nextModelStepId: () => next("model-step"),
    nextEventId: () => next("event"),
    nextReceiptId: () => next("receipt"),
    nextOutcomeId: () => next("outcome"),
  };
};

const startServer = async (
  store: SessionStorePort,
  submitTurnCommand: ReturnType<typeof createTurnCommandSubmitter>,
  resolveSessionId: (runId: string) => Promise<string | null> | string | null,
  maxJsonBodyBytes?: number,
) => {
  const server = createMelioraServer({
    store,
    submitTurnCommand,
    resolveSessionId,
    resolveLocalPrincipalId: () => "local-user",
    pollIntervalMs: 10,
    ...(maxJsonBodyBytes === undefined ? {} : { maxJsonBodyBytes }),
  });
  const port = await listenOnFetchSafeLoopbackPort(server);
  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
};

const postTurn = async (url: string, body: unknown): Promise<Response> =>
  fetch(`${url}/api/turns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const sseEvents = (body: string): PublicRunEvent[] =>
  body.split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)) as PublicRunEvent);

test("explicit C.2b dispatcher runs the real worker only under Attempt #2 authority", async () => {
  const parent = await mkdtemp(join(tmpdir(), "meliora-c2b-worker-"));
  const workspaceRoot = join(parent, "workspace");
  const databasePath = join(parent, "meliora.sqlite");
  await mkdir(workspaceRoot, { recursive: true });
  let current = Date.parse(fixedNow);
  const now = () => new Date(current).toISOString();
  const store = new SqliteSessionStore(databasePath, { clock: () => new Date(current), nonce: (() => { let i = 0; return () => `nonce-${++i}`; })() });
  const ids = deterministicIds();
  let providerCalls = 0;
  const options = {
    store, workspaceRoots: new Map([[workspaceId, workspaceRoot]]), ids, now,
    model: { next: async ({ modelStepId }: { modelStepId: string }) => {
      providerCalls += 1;
      return [
        { schemaVersion: "meliora.model-event.v1" as const, modelStepId, streamIndex: 0, occurredAt: now(), kind: "assistant_text_delta" as const, delta: "private" },
        { schemaVersion: "meliora.model-event.v1" as const, modelStepId, streamIndex: 1, occurredAt: now(), kind: "model_step_completed" as const, finishReason: "stop" as const },
      ];
    } },
  };
  try {
    const reserved = await store.reserveRunCommand({
      localPrincipalId: "local-user", workspaceId, idempotencyKey: "c2b-key",
      canonicalRequestHash: canonicalRunCommandRequestHash({ workspaceId, message: "recover" }),
      sessionId: "session-c2b", turnId: "turn-c2b", runId: "run-c2b", attemptId: "attempt-initial",
      catalogHash: createFrozenReadOnlyWorkspaceCatalog().catalogHash, intentRevision: 1, userMessage: "recover", reservedAt: now(),
    });
    assert.equal(reserved.kind, "owner");
    const oldLease = await store.acquireLease({ runId: "run-c2b", attemptId: "attempt-initial", ownerId: "old", ttlMs: 1_000, requestedAt: now() });
    assert.equal(oldLease.kind, "acquired");
    if (oldLease.kind !== "acquired") throw new Error("lease_expected");
    assert.equal((await store.transitionRunCommand({
      localPrincipalId: "local-user", workspaceId, idempotencyKey: "c2b-key", runId: "run-c2b", attemptId: "attempt-initial",
      leaseToken: oldLease.leaseToken, expectedStatus: "reserved", nextStatus: "accepted", updatedAt: now(),
    })).kind, "updated");
    current += 1_001;
    const dispatcher = createSafeRecoveryTurnDispatcher(options);
    assert.equal((await dispatcher.dispatchOne({ localPrincipalId: "local-user", workspaceId, idempotencyKey: "c2b-key", runId: "run-c2b" })).kind, "dispatched");
    assert.equal(providerCalls, 1);
    const bundle = await store.readRecoveryBundle({ runId: "run-c2b", eventLimit: 32 });
    assert.equal(bundle.kind, "found");
    if (bundle.kind !== "found") throw new Error("bundle_expected");
    assert.equal(bundle.bundle.activeAttempt.attemptNumber, 2);
    assert.equal(bundle.bundle.latestModelStep?.attemptId, bundle.bundle.activeAttempt.attemptId);
    assert.equal((await store.readEvents({ runId: "run-c2b", afterSequence: 0, limit: 32 })).events.every((event) => event.attemptId === bundle.bundle.activeAttempt.attemptId), true);
    assert.equal((await store.readRunCommand({ localPrincipalId: "local-user", workspaceId, idempotencyKey: "c2b-key" }))?.status, "terminal");
  } finally { store.close(); await rm(parent, { recursive: true, force: true }); }
});

test("POST /api/turns creates a durable read-only run and replays by idempotency key", async () => {
  const parent = await mkdtemp(join(tmpdir(), "meliora-server-turn-"));
  const workspaceRoot = join(parent, "workspace");
  const databasePath = join(parent, "meliora.sqlite");
  const ids = deterministicIds();
  const sourcePath = join(workspaceRoot, "packages", "agent-runtime", "run-state.ts");
  await mkdir(join(workspaceRoot, "packages", "agent-runtime"), { recursive: true });
  await writeFile(sourcePath, `export const privateMarker = "${privateMarker}";\n`, "utf8");

  let storeNonce = 0;
  const store = new SqliteSessionStore(databasePath, {
    clock: () => new Date(fixedNow),
    nonce: () => `store-nonce-${++storeNonce}`,
  });
  let modelCalls = 0;
  const model: ReadOnlyRunModelPort = {
    next: async ({ modelStepId, messages }) => {
      modelCalls += 1;
      if (modelCalls === 1) {
        assert.deepEqual(messages, [{ role: "user", content: "读取入口文件并验证" }]);
        return deepseekStreamTextSingleToolFixture.expectedEvents.map((event) => ({ ...event, modelStepId }));
      }
      assert.equal(messages.at(-1)?.role, "tool");
      assert.equal((messages.at(-1) as { invocationId?: string }).invocationId, "invocation-deepseek-0-0");
      assert.match((messages.at(-1) as { content?: string }).content ?? "", new RegExp(privateMarker, "u"));
      return [{
        schemaVersion: "meliora.model-event.v1",
        modelStepId,
        streamIndex: 0,
        occurredAt: fixedNow,
        kind: "assistant_text_delta",
        delta: "只读检查完成。",
      }, {
        schemaVersion: "meliora.model-event.v1",
        modelStepId,
        streamIndex: 1,
        occurredAt: fixedNow,
        kind: "model_step_completed",
        finishReason: "stop",
      }];
    },
  };

  const submitTurnCommand = createTurnCommandSubmitter({
    store,
    workspaceRoots: new Map([[workspaceId, workspaceRoot]]),
    model,
    ids,
    now: () => fixedNow,
  });
  const app = await startServer(store, submitTurnCommand, (runId) => store.readRunSessionId(runId));
  try {
    const create = await postTurn(app.url, {
      schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
      workspaceId,
      idempotencyKey: "turn-key-1",
      message: "读取入口文件并验证",
    });
    assert.equal(create.status, 202);
    const created = await create.json() as TurnCommandResponse;
    assert.equal(created.disposition, "created");
    assert.equal(created.commandStatus, "reserved");

    const eventsResponse = await fetch(`${app.url}/api/runs/${created.runId}/events`);
    assert.equal(eventsResponse.status, 200);
    const eventBody = await eventsResponse.text();
    const events = sseEvents(eventBody);
    assert.equal(events.at(-1)?.kind, "run_completed");
    assert.equal(modelCalls, 2);
    assert.equal(eventBody.includes(privateMarker), false);
    assert.equal(eventBody.includes("artifact-1"), false, "private artifact id must not be projected");
    assert.ok(events.some((event) => event.kind === "tool_result_presented"));
    assert.ok(events.some((event) => event.kind === "verification_updated"));

    const checkpoint = await store.readLatestModelStep({ runId: created.runId });
    assert.equal(checkpoint?.status, "terminal");
    assert.equal((await store.readRunCommand({
      localPrincipalId: "local-user",
      workspaceId,
      idempotencyKey: "turn-key-1",
    }))?.status, "terminal");

    const replay = await postTurn(app.url, {
      schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
      workspaceId,
      idempotencyKey: "turn-key-1",
      message: "读取入口文件并验证",
    });
    assert.equal(replay.status, 200);
    const replayed = await replay.json() as TurnCommandResponse;
    assert.equal(replayed.disposition, "replay");
    assert.equal(replayed.commandStatus, "terminal");
    assert.equal(replayed.terminalStatus, "completed");
    assert.equal(replayed.runId, created.runId);

    const changed = await postTurn(app.url, {
      schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
      workspaceId,
      idempotencyKey: "turn-key-1",
      message: "读取另一个文件",
    });
    assert.equal(changed.status, 409);
    assert.deepEqual(await changed.json(), {
      schemaVersion: "meliora.turn-command-error.v1",
      error: { code: "idempotency_key_conflict", retryable: false },
    });
  } finally {
    await app.close();
    store.close();
    await rm(parent, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("POST /api/turns rejects browser-owned authority fields and unknown workspaces", async () => {
  const store = new MemorySessionStore();
  const submitTurnCommand = createTurnCommandSubmitter({
    store,
    workspaceRoots: new Map([[workspaceId, process.cwd()]]),
    model: { next: async () => [] },
    ids: createDefaultTurnCommandIds(),
    now: () => fixedNow,
  });
  const app = await startServer(store, submitTurnCommand, async () => null);
  try {
    const authorityField = await postTurn(app.url, {
      schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
      workspaceId,
      idempotencyKey: "bad-authority",
      message: "hello",
      workspacePath: "C:/secret",
    });
    assert.equal(authorityField.status, 400);
    assert.equal((await authorityField.json() as { error: { code: string } }).error.code, "invalid_request");

    const unknownWorkspace = await postTurn(app.url, {
      schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
      workspaceId: "workspace-missing",
      idempotencyKey: "bad-workspace",
      message: "hello",
    });
    assert.equal(unknownWorkspace.status, 404);
    assert.equal((await unknownWorkspace.json() as { error: { code: string } }).error.code, "invalid_workspace");
  } finally {
    await app.close();
  }
});

test("POST /api/turns rejects malformed transport input before dispatch", async () => {
  const store = new MemorySessionStore();
  let modelCalls = 0;
  const submitTurnCommand = createTurnCommandSubmitter({
    store,
    workspaceRoots: new Map([[workspaceId, process.cwd()]]),
    model: { next: async () => { modelCalls += 1; return []; } },
    ids: createDefaultTurnCommandIds(),
    now: () => fixedNow,
  });
  const app = await startServer(store, submitTurnCommand, async () => null, 128);
  try {
    const malformedJson = await fetch(`${app.url}/api/turns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(malformedJson.status, 400);

    const wrongContentType = await fetch(`${app.url}/api/turns`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });
    assert.equal(wrongContentType.status, 400);

    const oversized = await fetch(`${app.url}/api/turns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
        workspaceId,
        idempotencyKey: "oversized-body",
        message: "x".repeat(256),
      }),
    });
    assert.equal(oversized.status, 400);
    assert.equal(modelCalls, 0);
  } finally {
    await app.close();
  }
});

class BlockingCheckpointStore extends MemorySessionStore {
  override async startModelStep(_input: StartModelStepInput): Promise<StartModelStepResult> {
    return { kind: "conflict", code: "model_step_in_progress" };
  }
}

class ThrowingAtomicTerminalCommitStore extends MemorySessionStore {
  override async commitTerminalModelStepResultAndSnapshot(_input: CommitTerminalModelStepResultAndSnapshotInput): Promise<CommitTerminalModelStepResultAndSnapshotResult> {
    throw new Error("injected_atomic_terminal_commit_failure");
  }
}

class ConflictingAtomicTerminalCommitStore extends MemorySessionStore {
  override async commitTerminalModelStepResultAndSnapshot(_input: CommitTerminalModelStepResultAndSnapshotInput): Promise<CommitTerminalModelStepResultAndSnapshotResult> {
    return { kind: "conflict", code: "terminal_model_step_result_conflict" };
  }
}

class UncertainReceiptCommitStore extends MemorySessionStore {
  receiptAttempts = 0;
  toolArtifactWrites = 0;

  constructor(
    private readonly failure: "throw" | "conflict",
    options: ConstructorParameters<typeof MemorySessionStore>[0],
  ) {
    super(options);
  }

  override async putArtifact(...input: Parameters<MemorySessionStore["putArtifact"]>) {
    if (input[0].visibility === "private" && input[0].mediaType === "text/plain") this.toolArtifactWrites += 1;
    return super.putArtifact(input[0]);
  }

  override async commitReceiptWithPublicEvents(..._input: Parameters<MemorySessionStore["commitReceiptWithPublicEvents"]>) {
    this.receiptAttempts += 1;
    if (this.failure === "throw") throw new Error("injected_commit_receipt_failure");
    return { kind: "conflict" as const, code: "invocation_execution_conflict" as const };
  }
}

/** Simulates process loss after the Receipt/event transaction but before the Command settles. */
class CrashAfterReceiptBoundStore extends MemorySessionStore {
  hostArtifactWrites = 0;
  private throwAfterReceipt = true;
  private rejectFirstBlockedSettle = true;

  constructor(
    options: ConstructorParameters<typeof MemorySessionStore>[0],
    private readonly eraseBinding = false,
  ) { super(options); }

  override async putArtifact(...input: Parameters<MemorySessionStore["putArtifact"]>) {
    if (input[0].visibility === "private" && input[0].mediaType === "text/plain") this.hostArtifactWrites += 1;
    return super.putArtifact(input[0]);
  }

  override async commitReceiptWithPublicEvents(...input: Parameters<MemorySessionStore["commitReceiptWithPublicEvents"]>) {
    const result = await super.commitReceiptWithPublicEvents(input[0]);
    if (result.kind === "committed" && this.throwAfterReceipt) {
      if (this.eraseBinding) {
        (this as unknown as { receiptPublicEventBindings: Map<string, unknown> }).receiptPublicEventBindings.clear();
      }
      this.throwAfterReceipt = false;
      throw new Error("injected_crash_after_receipt_public_binding");
    }
    return result;
  }

  override async settleRunCommandWithTerminalEvent(...input: Parameters<MemorySessionStore["settleRunCommandWithTerminalEvent"]>) {
    if (this.rejectFirstBlockedSettle) {
      this.rejectFirstBlockedSettle = false;
      throw new Error("injected_crash_before_command_terminal");
    }
    return super.settleRunCommandWithTerminalEvent(input[0]);
  }
}

class LeaseLossAfterHostStore extends MemorySessionStore {
  hostArtifactWrites = 0;
  lastLeaseToken = "";
  private failNextRenewal = true;
  private executionStarted = false;

  constructor(
    options: ConstructorParameters<typeof MemorySessionStore>[0],
    private readonly renewalFailure: "return_false" | "throw" = "return_false",
  ) {
    super(options);
  }

  override async putArtifact(...input: Parameters<MemorySessionStore["putArtifact"]>) {
    if (input[0].visibility === "private" && input[0].mediaType === "text/plain") this.hostArtifactWrites += 1;
    return super.putArtifact(input[0]);
  }

  override async beginInvocationExecution(...input: Parameters<MemorySessionStore["beginInvocationExecution"]>) {
    const result = await super.beginInvocationExecution(input[0]);
    if (result.kind === "started") this.executionStarted = true;
    return result;
  }

  override async renewLease(...input: Parameters<MemorySessionStore["renewLease"]>) {
    this.lastLeaseToken = input[0].leaseToken;
    if (this.failNextRenewal && this.executionStarted && this.hostArtifactWrites === 1) {
      this.failNextRenewal = false;
      if (this.renewalFailure === "throw") throw new Error("adapter_renewal_detail_must_not_escape");
      return false;
    }
    return super.renewLease(input[0]);
  }
}

class IndeterminateRecoveryAfterHostStore extends LeaseLossAfterHostStore {
  private remainingRecoveryFault = 1;

  constructor(
    private readonly recoveryFailure: "throw" | "too_large" | "not_found" | "conflict" | "incomplete",
    options: ConstructorParameters<typeof MemorySessionStore>[0],
  ) {
    super(options);
  }

  override async readRecoveryBundle(...input: Parameters<MemorySessionStore["readRecoveryBundle"]>) {
    if (this.hostArtifactWrites === 1 && this.remainingRecoveryFault > 0) {
      this.remainingRecoveryFault -= 1;
      if (this.recoveryFailure === "throw") throw new Error("injected_recovery_adapter_failure");
      if (this.recoveryFailure === "too_large") return { kind: "failure" as const, code: "recovery_bundle_too_large" as const };
      if (this.recoveryFailure === "incomplete") return { kind: "failure" as const, code: "recovery_bundle_incomplete" as const };
      if (this.recoveryFailure === "not_found") return { kind: "not_found" as const, code: "run_not_found" as const };
      return { kind: "conflict" as const, code: "run_attempt_conflict" as const };
    }
    return super.readRecoveryBundle(input[0]);
  }
}

type TamperedInvocationBundleShape =
  | "outcome_unknown_with_receipt"
  | "executing_with_receipt"
  | "reserved_with_receipt"
  | "reserved_with_execution_started_at"
  | "executing_without_execution_started_at"
  | "outcome_unknown_with_execution_started_at"
  | "succeeded_with_matching_receipt"
  | "succeeded_without_receipt"
  | "failed_without_receipt"
  | "cancelled_without_receipt"
  | "awaiting_approval_without_receipt"
  | "reservation_invocation_mismatch";

class SemanticallyTamperedRecoveryStore extends LeaseLossAfterHostStore {
  constructor(
    private readonly shape: TamperedInvocationBundleShape,
    options: ConstructorParameters<typeof MemorySessionStore>[0],
  ) {
    super(options);
  }

  override async readRecoveryBundle(...input: Parameters<MemorySessionStore["readRecoveryBundle"]>) {
    const result = await super.readRecoveryBundle(input[0]);
    if (result.kind !== "found" || this.hostArtifactWrites !== 1 || result.bundle.invocations.length === 0) return result;
    const first = result.bundle.invocations[0]!;
    const receipt = {
      schemaVersion: "meliora.tool-receipt.v1" as const, receiptId: "tampered-receipt",
      invocationId: first.invocation.invocationId, runId: first.invocation.runId, attemptId: first.invocation.attemptId,
      toolName: first.invocation.toolName, toolVersion: first.invocation.toolVersion,
      argumentsHash: first.invocation.argumentsHash, catalogHash: first.invocation.catalogHash,
      decision: "allow" as const, startedAt: fixedNow, endedAt: fixedNow, status: "succeeded" as const,
      effectSummary: "fixture", verificationArtifactIds: [], redactions: [],
    };
    const terminalStatus: typeof first.invocation.status | undefined = this.shape === "succeeded_without_receipt" || this.shape === "succeeded_with_matching_receipt" ? "succeeded"
      : this.shape === "failed_without_receipt" ? "failed"
        : this.shape === "cancelled_without_receipt" ? "cancelled" : undefined;
    const receiptStatus: typeof first.invocation.status | undefined = this.shape === "outcome_unknown_with_receipt" ? "outcome_unknown"
      : this.shape === "executing_with_receipt" ? "executing"
        : this.shape === "reserved_with_receipt" ? "reserved" : undefined;
    const timestampStatus: typeof first.invocation.status | undefined = this.shape === "reserved_with_execution_started_at" ? "reserved"
      : this.shape === "executing_without_execution_started_at" ? "executing"
        : this.shape === "outcome_unknown_with_execution_started_at" ? "outcome_unknown"
          : this.shape === "awaiting_approval_without_receipt" ? "awaiting_approval" : undefined;
    const alteredStatus = terminalStatus ?? receiptStatus ?? timestampStatus;
    const invocation = alteredStatus === undefined ? first.invocation : { ...first.invocation, status: alteredStatus };
    const reservationWithStatus = this.shape === "reservation_invocation_mismatch"
      ? { ...first.reservation, status: "reserved" as typeof first.reservation.status }
      : alteredStatus === undefined ? first.reservation : { ...first.reservation, status: alteredStatus };
    const { executionStartedAt: _discardedExecutionStartedAt, ...reservationWithoutTimestamp } = reservationWithStatus;
    const reservation = this.shape === "executing_without_execution_started_at" ? reservationWithoutTimestamp : reservationWithStatus;
    const changed = {
      ...first,
      invocation,
      reservation,
      receipt: (terminalStatus === undefined && this.shape !== "reservation_invocation_mismatch" && this.shape !== "awaiting_approval_without_receipt") || this.shape === "succeeded_with_matching_receipt" ? receipt : null,
    };
    return { kind: "found" as const, bundle: { ...result.bundle, invocations: [changed, ...result.bundle.invocations.slice(1)] } };
  }
}

const exerciseUnreceiptedHostRecovery = async (
  idempotencyKey: string,
  createStore: (clock: () => Date) => LeaseLossAfterHostStore,
): Promise<void> => {
  let currentNow = fixedNow;
  const store = createStore(() => new Date(currentNow));
  const ids = deterministicIds();
  const deferred: Array<() => Promise<void>> = [];
  let modelCalls = 0;
  const request = {
    schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
    workspaceId,
    idempotencyKey,
    message: "读取入口文件",
  } as const;
  const submitTurnCommand = createTurnCommandSubmitter({
    store,
    workspaceRoots: new Map([[workspaceId, process.cwd()]]),
    model: {
      next: async ({ modelStepId }) => {
        modelCalls += 1;
        return deepseekStreamTextSingleToolFixture.expectedEvents.map((event) => ({ ...event, modelStepId }));
      },
    },
    ids,
    now: () => currentNow,
    leaseTtlMs: 1_000,
    defer: (run) => { deferred.push(run); },
  });

  const created = await submitTurnCommand(request);
  assert.equal(created.status, 202);
  if (created.status !== 202) throw new Error("expected_created_command");
  await Promise.resolve(deferred.shift()!());
  assert.equal(modelCalls, 1, "the first worker called Provider exactly once");
  assert.equal(store.hostArtifactWrites, 1, "the first worker reached Host exactly once");
  const scope = { localPrincipalId: "local-user", workspaceId, idempotencyKey };
  assert.equal((await store.readRunCommand(scope))?.status, "dispatched");
  const firstEvents = await store.readEvents({ runId: created.body.runId, afterSequence: 0, limit: 50 });
  assert.equal(firstEvents.events.some((event) => /^run_(blocked|failed|completed|cancelled)$/u.test(event.kind)), false);

  currentNow = "2026-09-12T03:00:02.000Z";
  const replay = await submitTurnCommand(request);
  if (replay.status !== 202) throw new Error("expected_replayed_command");
  assert.equal(replay.body.disposition, "replay");
  await Promise.resolve(deferred.shift()!());
  assert.equal(modelCalls, 1, "recovery must not replay Provider");
  assert.equal(store.hostArtifactWrites, 1, "recovery must not replay Host");
  const recovered = await store.readRunCommand(scope);
  assert.equal(recovered?.status, "terminal");
  assert.equal(recovered?.terminalStatus, "blocked");
  assert.equal(recovered?.terminalCode, "tool_invocation_outcome_unknown");
  const recoveredEvents = await store.readEvents({ runId: created.body.runId, afterSequence: 0, limit: 50 });
  assert.equal(recoveredEvents.events.filter((event) => event.kind === "run_blocked").length, 1);
  assert.equal(recoveredEvents.events.some((event) => event.kind === "run_failed"), false);
};

class FailingAtomicRunBlockedSettlementStore extends ThrowingAtomicTerminalCommitStore {
  // This is the Store boundary that must keep the public terminal event and
  // command terminal state indivisible.  Failing it must leave neither fact.
  private remainingAtomicSettlementFailures = 1;
  settleCalls = 0;

  constructor(
    private readonly failure: "throw" | "conflict",
    clock: () => Date,
  ) {
    super({ clock });
  }

  override async settleRunCommandWithTerminalEvent(
    input: SettleRunCommandWithTerminalEventInput,
  ): Promise<SettleRunCommandWithTerminalEventResult> {
    this.settleCalls += 1;
    if (this.remainingAtomicSettlementFailures > 0 && input.terminalEvent.kind === "run_blocked") {
      this.remainingAtomicSettlementFailures -= 1;
      if (this.failure === "throw") throw new Error("injected_atomic_run_blocked_settlement_failure");
      return { kind: "conflict", code: "event_sequence_conflict", currentSequence: 1 };
    }
    return super.settleRunCommandWithTerminalEvent(input);
  }
}

test("Model Step checkpoint conflict fails closed without calling the Provider", async () => {
  const store = new BlockingCheckpointStore({ clock: () => new Date(fixedNow) });
  const ids = deterministicIds();
  let modelCalls = 0;
  const submitTurnCommand = createTurnCommandSubmitter({
    store,
    workspaceRoots: new Map([[workspaceId, process.cwd()]]),
    model: { next: async () => { modelCalls += 1; return []; } },
    ids,
    now: () => fixedNow,
  });
  let sessionId = "";
  const app = await startServer(store, submitTurnCommand, (runId) => runId === "run-1" ? sessionId : null);
  try {
    const response = await postTurn(app.url, {
      schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
      workspaceId,
      idempotencyKey: "checkpoint-conflict",
      message: "检查状态",
    });
    assert.equal(response.status, 202);
    const created = await response.json() as TurnCommandResponse;
    sessionId = created.sessionId;
    const eventsResponse = await fetch(`${app.url}/api/runs/${created.runId}/events`);
    assert.equal(eventsResponse.status, 200);
    const eventBody = await eventsResponse.text();
    assert.equal(modelCalls, 0);
    assert.match(eventBody, /event: run_blocked/u);
    assert.equal((await store.readRunCommand({
      localPrincipalId: "local-user",
      workspaceId,
      idempotencyKey: "checkpoint-conflict",
    }))?.status, "terminal");
  } finally {
    await app.close();
  }
});

test("atomic terminal commit failures preserve the started checkpoint and block provider retry", async (t) => {
  for (const scenario of [
    { name: "throw", store: () => new ThrowingAtomicTerminalCommitStore({ clock: () => new Date(fixedNow) }) },
    { name: "conflict", store: () => new ConflictingAtomicTerminalCommitStore({ clock: () => new Date(fixedNow) }) },
  ] as const) {
    await t.test(scenario.name, async () => {
      const store = scenario.store();
      const ids = deterministicIds();
      const deferred: Array<() => Promise<void>> = [];
      let modelCalls = 0;
      const request = {
        schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
        workspaceId,
        idempotencyKey: `atomic-terminal-commit-${scenario.name}`,
        message: "检查原子 terminal commit 故障",
      } as const;
      const submitTurnCommand = createTurnCommandSubmitter({
        store,
        workspaceRoots: new Map([[workspaceId, process.cwd()]]),
        model: {
          next: async ({ modelStepId }) => {
            modelCalls += 1;
            return [{
              schemaVersion: "meliora.model-event.v1",
              modelStepId,
              streamIndex: 0,
              occurredAt: fixedNow,
              kind: "model_step_completed",
              finishReason: "stop",
            }];
          },
        },
        ids,
        now: () => fixedNow,
        defer: (run) => { deferred.push(run); },
      });

      const created = await submitTurnCommand(request);
      assert.equal(created.status, 202);
      assert.equal(created.body.disposition, "created");
      assert.equal(deferred.length, 1);
      await Promise.resolve(deferred.shift()!());

      assert.equal(modelCalls, 1);
      const checkpoint = await store.readLatestModelStep({ runId: created.body.runId });
      assert.equal(checkpoint?.status, "started");
      const command = await store.readRunCommand({
        localPrincipalId: "local-user",
        workspaceId,
        idempotencyKey: request.idempotencyKey,
      });
      assert.equal(command?.status, "terminal");
      assert.equal(command?.status === "terminal" ? command.terminalStatus : null, "blocked");
      assert.equal(command?.status === "terminal" ? command.terminalCode : null, "model_step_outcome_unknown");
      const events = await store.readEvents({ runId: created.body.runId, afterSequence: 0, limit: 20 });
      assert.ok(events.events.some((event) => event.kind === "run_blocked"));
      assert.equal(events.events.some((event) => event.kind === "run_failed"), false);
      assert.equal(JSON.stringify(events.events).includes("\"retryable\":true"), false);
      assert.equal(JSON.stringify(events.events).includes("worker_failed"), false);

      const replay = await submitTurnCommand(request);
      assert.equal(replay.status, 200);
      assert.equal(replay.body.disposition, "replay");
      assert.equal(replay.body.commandStatus, "terminal");
      assert.equal(replay.body.terminalStatus, "blocked");
      assert.equal(replay.body.terminalCode, "model_step_outcome_unknown");
      assert.equal(deferred.length, 0);
      assert.equal(modelCalls, 1);
    });
  }
});

test("uncertain receipt commits block atomically without replaying Provider or Host", async (t) => {
  for (const failure of ["throw", "conflict"] as const) {
    await t.test(failure, async () => {
      const store = new UncertainReceiptCommitStore(failure, { clock: () => new Date(fixedNow) });
      const ids = deterministicIds();
      const deferred: Array<() => Promise<void>> = [];
      let modelCalls = 0;
      const request = {
        schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
        workspaceId,
        idempotencyKey: `receipt-uncertain-${failure}`,
        message: "读取入口文件",
      } as const;
      const submitTurnCommand = createTurnCommandSubmitter({
        store,
        workspaceRoots: new Map([[workspaceId, process.cwd()]]),
        model: {
          next: async ({ modelStepId }) => {
            modelCalls += 1;
            return deepseekStreamTextSingleToolFixture.expectedEvents.map((event) => ({ ...event, modelStepId }));
          },
        },
        ids,
        now: () => fixedNow,
        defer: (run) => { deferred.push(run); },
      });
      const created = await submitTurnCommand(request);
      assert.equal(created.status, 202);
      await Promise.resolve(deferred.shift()!());

      assert.equal(modelCalls, 1);
      assert.equal(store.toolArtifactWrites, 1, "the successful Host call happens once before its receipt uncertainty");
      assert.equal(store.receiptAttempts, 1);
      const command = await store.readRunCommand({ localPrincipalId: "local-user", workspaceId, idempotencyKey: request.idempotencyKey });
      assert.equal(command?.status, "terminal");
      assert.equal(command?.status === "terminal" ? command.terminalStatus : null, "blocked");
      assert.equal(command?.status === "terminal" ? command.terminalCode : null, "tool_invocation_outcome_unknown");
      const events = await store.readEvents({ runId: created.body.runId, afterSequence: 0, limit: 50 });
      assert.equal(events.events.filter((event) => event.kind === "run_blocked").length, 1);
      assert.equal(events.events.some((event) => event.kind === "run_failed"), false);
      const bundle = await store.readRecoveryBundle({ runId: created.body.runId, eventLimit: 20 });
      assert.equal(bundle.kind, "found");
      if (bundle.kind === "found") {
        assert.equal(bundle.bundle.invocations[0]?.invocation.status, "executing");
        assert.equal(bundle.bundle.invocations[0]?.receipt, null);
      }

      const replay = await submitTurnCommand(request);
      assert.equal(replay.status, 200);
      assert.equal(replay.body.disposition, "replay");
      assert.equal(replay.body.commandStatus, "terminal");
      assert.equal(deferred.length, 0);
      assert.equal(modelCalls, 1);
      assert.equal(store.toolArtifactWrites, 1);
      assert.equal(store.receiptAttempts, 1);
    });
  }
});

test("bound Receipt crash recovery closes the dispatched Command once without replaying Provider or Host", async () => {
  let currentNow = fixedNow;
  const store = new CrashAfterReceiptBoundStore({ clock: () => new Date(currentNow) });
  const ids = deterministicIds();
  const deferred: Array<() => Promise<void>> = [];
  let modelCalls = 0;
  const request = {
    schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
    workspaceId,
    idempotencyKey: "receipt-binding-crash-recovery",
    message: "读取入口文件",
  } as const;
  const submitTurnCommand = createTurnCommandSubmitter({
    store,
    workspaceRoots: new Map([[workspaceId, process.cwd()]]),
    model: { next: async ({ modelStepId }) => {
      modelCalls += 1;
      return deepseekStreamTextSingleToolFixture.expectedEvents.map((event) => ({ ...event, modelStepId }));
    } },
    ids,
    now: () => currentNow,
    leaseTtlMs: 1_000,
    defer: (run) => { deferred.push(run); },
  });
  const created = await submitTurnCommand(request);
  assert.equal(created.status, 202);
  if (created.status !== 202) throw new Error("expected_created_command");
  await Promise.resolve(deferred.shift()!());
  assert.equal(modelCalls, 1);
  assert.equal(store.hostArtifactWrites, 1);
  const scope = { localPrincipalId: "local-user", workspaceId, idempotencyKey: request.idempotencyKey };
  assert.equal((await store.readRunCommand(scope))?.status, "dispatched");
  const before = await store.readEvents({ runId: created.body.runId, afterSequence: 0, limit: 50 });
  assert.equal(before.events.filter((event) => event.kind === "tool_result_presented").length, 1);
  assert.equal(before.events.filter((event) => event.kind === "run_blocked").length, 0);

  currentNow = "2026-09-12T03:00:02.000Z";
  const replay = await submitTurnCommand(request);
  assert.equal(replay.status, 202);
  assert.equal(replay.body.commandStatus, "dispatched");
  await Promise.resolve(deferred.shift()!());
  const command = await store.readRunCommand(scope);
  assert.equal(command?.status, "terminal");
  assert.equal(command?.status === "terminal" ? command.terminalStatus : null, "blocked");
  assert.equal(command?.status === "terminal" ? command.terminalCode : null, "tool_receipt_recovery_required");
  const after = await store.readEvents({ runId: created.body.runId, afterSequence: 0, limit: 50 });
  assert.equal(after.events.filter((event) => event.kind === "tool_result_presented").length, 1);
  assert.equal(after.events.filter((event) => event.kind === "run_blocked").length, 1);
  assert.equal(modelCalls, 1);
  assert.equal(store.hostArtifactWrites, 1);
  const terminalReplay = await submitTurnCommand(request);
  assert.equal(terminalReplay.status, 200);
  assert.equal(terminalReplay.body.commandStatus, "terminal");
  assert.equal(deferred.length, 0, "a terminal recovery must not append a second public block");
});

test("legacy Receipt without a public-event binding closes once as an integrity block", async () => {
  let currentNow = fixedNow;
  const store = new CrashAfterReceiptBoundStore({ clock: () => new Date(currentNow) }, true);
  const deferred: Array<() => Promise<void>> = [];
  let modelCalls = 0;
  const request = {
    schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
    workspaceId,
    idempotencyKey: "legacy-receipt-without-public-binding",
    message: "读取入口文件",
  } as const;
  const submitTurnCommand = createTurnCommandSubmitter({
    store, workspaceRoots: new Map([[workspaceId, process.cwd()]]), ids: deterministicIds(),
    model: { next: async ({ modelStepId }) => {
      modelCalls += 1;
      return deepseekStreamTextSingleToolFixture.expectedEvents.map((event) => ({ ...event, modelStepId }));
    } },
    now: () => currentNow, leaseTtlMs: 1_000, defer: (run) => { deferred.push(run); },
  });
  const created = await submitTurnCommand(request);
  assert.equal(created.status, 202);
  if (created.status !== 202) throw new Error("expected_created_command");
  await Promise.resolve(deferred.shift()!());
  const scope = { localPrincipalId: "local-user", workspaceId, idempotencyKey: request.idempotencyKey };
  assert.equal((await store.readRunCommand(scope))?.status, "dispatched");
  currentNow = "2026-09-12T03:00:02.000Z";
  assert.equal((await submitTurnCommand(request)).status, 202);
  await Promise.resolve(deferred.shift()!());
  const command = await store.readRunCommand(scope);
  assert.equal(command?.status, "terminal");
  assert.equal(command?.status === "terminal" ? command.terminalCode : null, "receipt_public_event_binding_invalid");
  const events = await store.readEvents({ runId: created.body.runId, afterSequence: 0, limit: 50 });
  assert.equal(events.events.filter((event) => event.kind === "run_blocked").length, 1);
  assert.equal(modelCalls, 1, "legacy receipt recovery must not replay Provider");
  assert.equal(store.hostArtifactWrites, 1, "legacy receipt recovery must not replay Host");
  assert.equal((await submitTurnCommand(request)).status, 200);
  assert.equal(deferred.length, 0);
});

test("atomic run_blocked settlement failures preserve dispatched command and started checkpoint until safe recovery", async (t) => {
  for (const scenario of ["throw", "conflict"] as const) {
    await t.test(scenario, async () => {
      let currentNow = fixedNow;
      const store = new FailingAtomicRunBlockedSettlementStore(scenario, () => new Date(currentNow));
      const ids = deterministicIds();
      const deferred: Array<() => Promise<void>> = [];
      let modelCalls = 0;
      const request = {
        schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
        workspaceId,
        idempotencyKey: `run-blocked-atomic-${scenario}`,
        message: "检查 run_blocked 原子结算故障",
      } as const;
      const submitTurnCommand = createTurnCommandSubmitter({
        store,
        workspaceRoots: new Map([[workspaceId, process.cwd()]]),
        model: {
          next: async ({ modelStepId }) => {
            modelCalls += 1;
            return [{
              schemaVersion: "meliora.model-event.v1",
              modelStepId,
              streamIndex: 0,
              occurredAt: fixedNow,
              kind: "model_step_completed",
              finishReason: "stop",
            }];
          },
        },
        ids,
        now: () => currentNow,
        leaseTtlMs: 1_000,
        defer: (run) => { deferred.push(run); },
      });

      const created = await submitTurnCommand(request);
      assert.equal(created.status, 202);
      await Promise.resolve(deferred.shift()!());

      assert.equal(modelCalls, 1);
      assert.equal(store.settleCalls, 1);
      assert.equal((await store.readLatestModelStep({ runId: created.body.runId }))?.status, "started");
      const commandScope = {
        localPrincipalId: "local-user",
        workspaceId,
        idempotencyKey: request.idempotencyKey,
      };
      assert.equal((await store.readRunCommand(commandScope))?.status, "dispatched");
      const beforeRecovery = await store.readEvents({ runId: created.body.runId, afterSequence: 0, limit: 20 });
      assert.equal(beforeRecovery.events.some((event) => event.kind === "run_blocked"), false);
      assert.equal(beforeRecovery.events.some((event) => /^run_(completed|failed|cancelled)$/u.test(event.kind)), false);

      currentNow = "2026-09-12T03:00:02.000Z";
      const replay = await submitTurnCommand(request);
      assert.equal(replay.status, 202);
      assert.equal(replay.body.disposition, "replay");
      assert.equal(replay.body.commandStatus, "dispatched");
      assert.equal(deferred.length, 1);
      await Promise.resolve(deferred.shift()!());

      assert.equal(modelCalls, 1);
      const recovered = await store.readRunCommand(commandScope);
      assert.equal(recovered?.status, "terminal");
      assert.equal(recovered?.terminalStatus, "blocked");
      assert.equal(recovered?.terminalCode, "model_step_outcome_unknown");
      const afterRecovery = await store.readEvents({ runId: created.body.runId, afterSequence: 0, limit: 20 });
      assert.equal(afterRecovery.events.filter((event) => event.kind === "run_blocked").length, 1);
    });
  }
});

test("replayed non-terminal commands are lease-gated and do not dispatch the Provider twice", async () => {
  const store = new MemorySessionStore({ clock: () => new Date(fixedNow) });
  const ids = deterministicIds();
  const deferred: Array<() => Promise<void>> = [];
  let modelCalls = 0;
  const submitTurnCommand = createTurnCommandSubmitter({
    store,
    workspaceRoots: new Map([[workspaceId, process.cwd()]]),
    model: {
      next: async ({ modelStepId }) => {
        modelCalls += 1;
        return [{
          schemaVersion: "meliora.model-event.v1",
          modelStepId,
          streamIndex: 0,
          occurredAt: fixedNow,
          kind: "model_step_completed",
          finishReason: "stop",
        }];
      },
    },
    ids,
    now: () => fixedNow,
    defer: (run) => { deferred.push(run); },
  });
  const request = {
    schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
    workspaceId,
    idempotencyKey: "double-dispatch",
    message: "检查状态",
  };

  const created = await submitTurnCommand(request);
  assert.equal(created.status, 202);
  assert.equal(created.body.disposition, "created");
  const replayed = await submitTurnCommand(request);
  assert.equal(replayed.status, 202);
  assert.equal(replayed.body.disposition, "replay");
  assert.equal(deferred.length, 2);

  await Promise.all(deferred.splice(0).map((run) => Promise.resolve(run())));

  assert.equal(modelCalls, 1);
  assert.equal((await store.readRunCommand({
    localPrincipalId: "local-user",
    workspaceId,
    idempotencyKey: "double-dispatch",
  }))?.status, "terminal");
});

test("replayed dispatched commands fail closed as outcome_unknown without retrying Provider", async () => {
  let currentNow = fixedNow;
  const store = new MemorySessionStore({ clock: () => new Date(currentNow) });
  const ids = deterministicIds();
  const deferred: Array<() => Promise<void>> = [];
  let modelCalls = 0;
  const submitTurnCommand = createTurnCommandSubmitter({
    store,
    workspaceRoots: new Map([[workspaceId, process.cwd()]]),
    model: { next: async () => { modelCalls += 1; return []; } },
    ids,
    now: () => currentNow,
    leaseTtlMs: 1_000,
    defer: (run) => { deferred.push(run); },
  });
  const request = {
    schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
    workspaceId,
    idempotencyKey: "unknown-outcome",
    message: "检查恢复状态",
  };

  const created = await submitTurnCommand(request);
  assert.equal(created.status, 202);
  deferred.length = 0;
  const lease = await store.acquireLease({
    runId: created.body.runId,
    attemptId: created.body.attemptId,
    ownerId: "crashed-worker",
    ttlMs: 1_000,
    requestedAt: currentNow,
  });
  assert.equal(lease.kind, "acquired");
  if (lease.kind !== "acquired") throw new Error("lease not acquired");
  assert.equal((await store.transitionRunCommand({
    localPrincipalId: "local-user",
    workspaceId,
    idempotencyKey: "unknown-outcome",
    runId: created.body.runId,
    attemptId: created.body.attemptId,
    leaseToken: lease.leaseToken,
    expectedStatus: "reserved",
    nextStatus: "accepted",
    updatedAt: currentNow,
  })).kind, "updated");
  assert.equal((await store.startModelStep({
    runId: created.body.runId,
    attemptId: created.body.attemptId,
    leaseToken: lease.leaseToken,
    modelStepId: "model-step-crashed",
    requestFingerprint: "a".repeat(64),
    startedAt: currentNow,
  })).kind, "started");

  currentNow = "2026-09-12T03:00:02.000Z";
  const replayed = await submitTurnCommand(request);
  assert.equal(replayed.status, 202);
  assert.equal(replayed.body.disposition, "replay");
  assert.equal(replayed.body.commandStatus, "dispatched");
  assert.equal(deferred.length, 1);
  await Promise.resolve(deferred[0]!());

  assert.equal(modelCalls, 0);
  const command = await store.readRunCommand({
    localPrincipalId: "local-user",
    workspaceId,
    idempotencyKey: "unknown-outcome",
  });
  assert.equal(command?.status, "terminal");
  assert.equal(command?.terminalStatus, "blocked");
  assert.equal(command?.terminalCode, "model_step_outcome_unknown");
  const events = await store.readEvents({ runId: created.body.runId, afterSequence: 0, limit: 10 });
  assert.deepEqual(events.events.map((event) => event.kind), ["run_blocked"]);
  assert.deepEqual(events.events[0]?.payload, {
    code: "model_step_outcome_unknown",
    message: "模型步骤结果未知，已停止自动重发 Provider 请求。",
    userActions: ["从持久化事件、Provider 幂等查询或后续恢复快照确认结果后再继续。"],
  });
});

test("terminal Model Step with a legacy outcome_unknown invocation blocks once without Provider or Host", async () => {
  let currentNow = fixedNow;
  class ObservedLegacyOutcomeUnknownStore extends MemorySessionStore {
    executionPermitAttempts = 0;

    override async beginInvocationExecution(...input: Parameters<MemorySessionStore["beginInvocationExecution"]>) {
      this.executionPermitAttempts += 1;
      return super.beginInvocationExecution(input[0]);
    }
  }
  const store = new ObservedLegacyOutcomeUnknownStore({ clock: () => new Date(currentNow) });
  const ids = deterministicIds();
  const deferred: Array<() => Promise<void>> = [];
  let providerCalls = 0;
  const request = {
    schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
    workspaceId,
    idempotencyKey: "legacy-outcome-unknown-recovery",
    message: "检查恢复状态",
  } as const;
  const submitTurnCommand = createTurnCommandSubmitter({
    store,
    workspaceRoots: new Map([[workspaceId, process.cwd()]]),
    model: { next: async () => { providerCalls += 1; return []; } },
    ids,
    now: () => currentNow,
    leaseTtlMs: 1_000,
    defer: (run) => { deferred.push(run); },
  });
  const created = await submitTurnCommand(request);
  assert.equal(created.status, 202);
  if (created.status !== 202) throw new Error("expected_created_command");
  deferred.length = 0;
  const lease = await store.acquireLease({
    runId: created.body.runId,
    attemptId: created.body.attemptId,
    ownerId: "crashed-worker",
    ttlMs: 1_000,
    requestedAt: currentNow,
  });
  assert.equal(lease.kind, "acquired");
  if (lease.kind !== "acquired") throw new Error("lease not acquired");
  assert.equal((await store.transitionRunCommand({
    localPrincipalId: "local-user", workspaceId, idempotencyKey: request.idempotencyKey,
    runId: created.body.runId, attemptId: created.body.attemptId, leaseToken: lease.leaseToken,
    expectedStatus: "reserved", nextStatus: "accepted", updatedAt: currentNow,
  })).kind, "updated");
  const fingerprint = hashBytes("legacy-outcome-unknown-terminal-model-step");
  assert.equal((await store.startModelStep({
    runId: created.body.runId, attemptId: created.body.attemptId, leaseToken: lease.leaseToken,
    modelStepId: "model-step-legacy-terminal", requestFingerprint: fingerprint, startedAt: currentNow,
  })).kind, "started");
  const historyBytes = new TextEncoder().encode("[]");
  await store.putArtifact({
    artifactId: "history-legacy-terminal", content: historyBytes, contentHash: hashBytes(historyBytes),
    mediaType: "application/json", visibility: "private", createdAt: currentNow,
  });
  const terminalBytes = new TextEncoder().encode("{\"events\":[]}");
  const terminalArtifact = {
    artifactId: "terminal-legacy-result", contentHash: hashBytes(terminalBytes),
    mediaType: "application/vnd.meliora.model-step-result+json" as const,
    byteLength: terminalBytes.byteLength, visibility: "private" as const,
  };
  assert.equal((await store.commitTerminalModelStepResultAndSnapshot({
    runId: created.body.runId, attemptId: created.body.attemptId, leaseToken: lease.leaseToken,
    modelStepId: "model-step-legacy-terminal", requestFingerprint: fingerprint, finishedAt: currentNow,
    normalizedResult: { artifactId: terminalArtifact.artifactId, contentHash: terminalArtifact.contentHash, content: terminalBytes },
    expectedSequence: 0,
    snapshot: {
      schemaVersion: "meliora.run-snapshot.v1", snapshotId: "snapshot-legacy-terminal",
      runId: created.body.runId, attemptId: created.body.attemptId, throughSequence: 0, createdAt: currentNow,
      state: {
        schemaVersion: "meliora.private-run-snapshot-state.v1", phase: "model_streaming",
        catalogHash: "m0-read-only-workspace-tools-v1", intentRevision: 1,
        modelHistoryArtifact: {
          artifactId: "history-legacy-terminal", contentHash: hashBytes(historyBytes), mediaType: "application/json",
          byteLength: historyBytes.byteLength, visibility: "private",
        },
        terminalModelStepResult: {
          attemptId: created.body.attemptId, modelStepId: "model-step-legacy-terminal", requestFingerprint: fingerprint,
          artifact: terminalArtifact,
        },
        pendingInvocations: [], receiptRefs: [], verificationRefs: [],
      },
    },
  })).kind, "committed");
  const reservation = await store.reserveInvocation({
    invocation: {
      schemaVersion: "meliora.tool-invocation.v1", invocationId: "legacy-outcome-invocation",
      runId: created.body.runId, attemptId: created.body.attemptId, toolName: "read_file", toolVersion: "1.0.0",
      arguments: {}, argumentsHash: hashBytes("legacy-outcome-arguments"), catalogHash: "m0-read-only-workspace-tools-v1",
      idempotencyKey: "legacy-outcome-invocation-key", status: "reserved",
    },
    leaseToken: lease.leaseToken, reservedAt: currentNow,
  });
  assert.equal(reservation.kind, "owner");
  if (reservation.kind !== "owner") throw new Error("reservation not created");
  const raw = store as unknown as {
    invocations: Map<string, { status: string }>;
    reservations: Map<string, { status: string }>;
  };
  const invocationKey = `${created.body.runId}\u0000${created.body.attemptId}\u0000legacy-outcome-invocation`;
  raw.invocations.set(invocationKey, { ...raw.invocations.get(invocationKey)!, status: "outcome_unknown" });
  raw.reservations.set(reservation.reservationId, { ...raw.reservations.get(reservation.reservationId)!, status: "outcome_unknown" });
  assert.equal((await store.readRecoveryBundle({ runId: created.body.runId, eventLimit: 20 })).kind, "found");

  currentNow = "2026-09-12T03:00:02.000Z";
  const replay = await submitTurnCommand(request);
  assert.equal(replay.status, 202);
  assert.equal(deferred.length, 1);
  await Promise.resolve(deferred.shift()!());
  const duplicateReplay = await submitTurnCommand(request);
  assert.equal(duplicateReplay.status, 200);
  assert.equal(deferred.length, 0);
  assert.equal(providerCalls, 0, "terminal checkpoint recovery must not call Provider");
  assert.equal(store.executionPermitAttempts, 0, "outcome_unknown must not request a Host execution permit");
  const command = await store.readRunCommand({ localPrincipalId: "local-user", workspaceId, idempotencyKey: request.idempotencyKey });
  assert.equal(command?.status, "terminal");
  assert.equal(command?.terminalStatus, "blocked");
  assert.equal(command?.terminalCode, "tool_invocation_outcome_unknown");
  const events = await store.readEvents({ runId: created.body.runId, afterSequence: 0, limit: 20 });
  assert.equal(events.events.filter((event) => event.kind === "run_blocked").length, 1);
  assert.equal(events.events.some((event) => event.kind === "run_failed"), false);
});

test("v2 SQLite legacy outcome_unknown survives migration and restart before one tool-unknown recovery settlement", async () => {
  const parent = await mkdtemp(join(tmpdir(), "meliora-v2-server-recovery-"));
  const databasePath = join(parent, "legacy.sqlite");
  let currentNow = fixedNow;
  let store: SqliteSessionStore | undefined;
  let stage = "v2_database_setup";
  try {
    const one = readFileSync(new URL("../../../packages/session-store/migrations/0001_initial.sql", import.meta.url), "utf8");
    const two = readFileSync(new URL("../../../packages/session-store/migrations/0002_durable_commands.sql", import.meta.url), "utf8");
    const legacy = new Database(databasePath);
    legacy.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)");
    legacy.exec(one); legacy.exec(two); legacy.pragma("user_version = 2");
    legacy.prepare("INSERT INTO schema_migrations VALUES (?,?,?,?)").run(1, "0001_initial.sql", hashBytes(one), fixedNow);
    legacy.prepare("INSERT INTO schema_migrations VALUES (?,?,?,?)").run(2, "0002_durable_commands.sql", hashBytes(two), fixedNow);
    const ids = { sessionId: "legacy-session", turnId: "legacy-turn", runId: "legacy-run", attemptId: "legacy-attempt" };
    const message = "恢复 legacy outcome unknown";
    legacy.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run(ids.sessionId, workspaceId, fixedNow, fixedNow);
    legacy.prepare("INSERT INTO turns VALUES (?,?,?,?,?)").run(ids.turnId, ids.sessionId, 1, fixedNow, fixedNow);
    legacy.prepare("INSERT INTO runs VALUES (?,?,?,?,?,?,?)").run(ids.runId, ids.turnId, ids.sessionId, ids.attemptId, 1, fixedNow, fixedNow);
    legacy.prepare("INSERT INTO run_attempts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(ids.attemptId, ids.runId, ids.sessionId, ids.turnId, 1, "created", 0, "m0-read-only-workspace-tools-v1", 1, "null", fixedNow, fixedNow);
    legacy.prepare("INSERT INTO run_commands VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      "local-user", workspaceId, "v2-outcome-unknown-replay", canonicalRunCommandRequestHash({ workspaceId, message }),
      ids.sessionId, ids.turnId, ids.runId, ids.attemptId, "dispatched", null, null, fixedNow, fixedNow, fixedNow, fixedNow, null,
    );
    legacy.prepare("INSERT INTO run_command_inputs VALUES (?,?,?,?,?,?,?,?,?)").run(
      ids.runId, ids.sessionId, ids.turnId, "meliora.private-user-input.v1", "user", "private", message, hashBytes(message), fixedNow,
    );
    const modelStepFingerprint = hashBytes("v2-terminal-model-step");
    legacy.prepare("INSERT INTO model_steps VALUES (?,?,?,?,?,?,?,?,?)").run(
      "legacy-terminal-model-step", ids.runId, ids.attemptId, modelStepFingerprint, "terminal", null, fixedNow, fixedNow, fixedNow,
    );
    const legacyInvocation = {
      schemaVersion: "meliora.tool-invocation.v1", invocationId: "legacy-outcome-invocation", runId: ids.runId, attemptId: ids.attemptId,
      toolName: "read_file", toolVersion: "1.0.0", arguments: {}, argumentsHash: hashBytes("v2-arguments"),
      catalogHash: "m0-read-only-workspace-tools-v1", idempotencyKey: "v2-outcome-unknown-invocation", status: "executing",
    };
    const invocationJson = JSON.stringify(legacyInvocation);
    legacy.prepare("INSERT INTO invocations VALUES (?,?,?,?,?,?,?,?,?)").run(
      legacyInvocation.invocationId, ids.runId, ids.attemptId, "legacy-outcome-reservation", legacyInvocation.idempotencyKey,
      invocationJson, hashBytes(invocationJson), "executing", fixedNow,
    );
    legacy.close();

    class ObservedSqliteStore extends SqliteSessionStore {
      executionPermitAttempts = 0;
      override async beginInvocationExecution(...input: Parameters<SqliteSessionStore["beginInvocationExecution"]>) {
        this.executionPermitAttempts += 1;
        return super.beginInvocationExecution(input[0]);
      }
    }
    stage = "v3_migration_and_reopen";
    store = new ObservedSqliteStore(databasePath, { clock: () => new Date(currentNow), nonce: () => "v2-recovery-nonce" });
    stage = "migrated_bundle_read";
    const migrated = await store.readRecoveryBundle({ runId: ids.runId, eventLimit: 20 });
    assert.equal(migrated.kind, "found");
    if (migrated.kind !== "found") throw new Error("expected migrated recovery bundle");
    assert.equal(migrated.bundle.latestModelStep?.status, "terminal");
    assert.equal(migrated.bundle.invocations[0]?.invocation.status, "outcome_unknown");
    assert.equal(migrated.bundle.invocations[0]?.receipt, null);

    const deferred: Array<() => Promise<void>> = [];
    let providerCalls = 0;
    const submitTurnCommand = createTurnCommandSubmitter({
      store,
      workspaceRoots: new Map([[workspaceId, process.cwd()]]),
      model: { next: async () => { providerCalls += 1; return []; } },
      ids: deterministicIds(),
      now: () => currentNow,
      leaseTtlMs: 1_000,
      defer: (run) => { deferred.push(run); },
    });
    const request = { schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION, workspaceId, idempotencyKey: "v2-outcome-unknown-replay", message } as const;
    stage = "concurrent_replay_submit";
    const firstReplay = await submitTurnCommand(request);
    const secondReplay = await submitTurnCommand(request);
    assert.equal(firstReplay.status, 202); assert.equal(secondReplay.status, 202);
    assert.equal(deferred.length, 2);
    stage = "concurrent_replay_workers";
    await Promise.all(deferred.splice(0).map((run) => run()));
    stage = "terminal_replay";
    const terminalReplay = await submitTurnCommand(request);
    assert.equal(terminalReplay.status, 200);
    assert.equal(providerCalls, 0);
    assert.equal((store as ObservedSqliteStore).executionPermitAttempts, 0);
    const command = await store.readRunCommand({ localPrincipalId: "local-user", workspaceId, idempotencyKey: request.idempotencyKey });
    assert.equal(command?.status, "terminal");
    assert.equal(command?.terminalStatus, "blocked");
    assert.equal(command?.terminalCode, "tool_invocation_outcome_unknown");
    stage = "post_settlement_bundle_read";
    const after = await store.readRecoveryBundle({ runId: ids.runId, eventLimit: 20 });
    assert.equal(after.kind, "found");
    if (after.kind === "found") {
      assert.equal(after.bundle.invocations[0]?.invocation.status, "outcome_unknown");
      assert.equal(after.bundle.invocations[0]?.receipt, null);
    }
    const events = await store.readEvents({ runId: ids.runId, afterSequence: 0, limit: 20 });
    assert.equal(events.events.filter((event) => event.kind === "run_blocked").length, 1);
    assert.equal(events.events.some((event) => event.kind === "run_failed"), false);
  } catch (error) {
    throw new Error(`v2_recovery_fixture_failed_at_${stage}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    store?.close();
    // Windows AV/indexing can retain SQLite's just-closed handle briefly. The
    // fixture is isolated under the system temp directory, so cleanup must not
    // turn a verified recovery assertion into an unrelated lock failure.
    await rm(parent, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
  }
});

test("lease loss after Host execution settles the unreceipted invocation only after recovery", async () => {
  let currentNow = fixedNow;
  const store = new LeaseLossAfterHostStore({ clock: () => new Date(currentNow) });
  const ids = deterministicIds();
  const deferred: Array<() => Promise<void>> = [];
  let modelCalls = 0;
  const request = {
    schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
    workspaceId,
    idempotencyKey: "lease-loss-after-host",
    message: "读取入口文件",
  } as const;
  const submitTurnCommand = createTurnCommandSubmitter({
    store,
    workspaceRoots: new Map([[workspaceId, process.cwd()]]),
    model: {
      next: async ({ modelStepId }) => {
        modelCalls += 1;
        return deepseekStreamTextSingleToolFixture.expectedEvents.map((event) => ({ ...event, modelStepId }));
      },
    },
    ids,
    now: () => currentNow,
    leaseTtlMs: 1_000,
    defer: (run) => { deferred.push(run); },
  });

  const created = await submitTurnCommand(request);
  assert.equal(created.status, 202);
  assert.equal(deferred.length, 1);
  await Promise.resolve(deferred.shift()!());
  assert.equal(modelCalls, 1);
  assert.equal(store.hostArtifactWrites, 1, "Host was reached exactly once before the lease loss");
  const scope = { localPrincipalId: "local-user", workspaceId, idempotencyKey: request.idempotencyKey };
  assert.equal((await store.readRunCommand(scope))?.status, "dispatched");
  const beforeRecovery = await store.readEvents({ runId: created.body.runId, afterSequence: 0, limit: 50 });
  assert.equal(beforeRecovery.events.some((event) => /^run_(blocked|failed|completed|cancelled)$/u.test(event.kind)), false);
  const beforeBundle = await store.readRecoveryBundle({ runId: created.body.runId, eventLimit: 20 });
  assert.equal(beforeBundle.kind, "found");
  if (beforeBundle.kind === "found") {
    assert.equal(beforeBundle.bundle.invocations[0]?.invocation.status, "executing");
    assert.equal(beforeBundle.bundle.invocations[0]?.receipt, null);
  }

  currentNow = "2026-09-12T03:00:02.000Z";
  const replay = await submitTurnCommand(request);
  assert.equal(replay.status, 202);
  assert.equal(replay.body.disposition, "replay");
  assert.equal(replay.body.commandStatus, "dispatched");
  assert.equal(deferred.length, 1);
  await Promise.resolve(deferred.shift()!());

  assert.equal(modelCalls, 1, "recovery must not call Provider again");
  assert.equal(store.hostArtifactWrites, 1, "recovery must not execute Host again");
  const recovered = await store.readRunCommand(scope);
  assert.equal(recovered?.status, "terminal");
  assert.equal(recovered?.terminalStatus, "blocked");
  assert.equal(recovered?.terminalCode, "tool_invocation_outcome_unknown");
  const afterRecovery = await store.readEvents({ runId: created.body.runId, afterSequence: 0, limit: 50 });
  assert.equal(afterRecovery.events.filter((event) => event.kind === "run_blocked").length, 1);
  assert.equal(afterRecovery.events.some((event) => event.kind === "run_failed"), false);
});

test("renewal exception after Host is lease-loss and settles only after recovery", async () => {
  await exerciseUnreceiptedHostRecovery(
    "lease-throw-after-host",
    (clock) => new LeaseLossAfterHostStore({ clock }, "throw"),
  );
});

for (const recoveryFailure of ["throw", "too_large", "not_found", "conflict", "incomplete"] as const) {
  test(`indeterminate ${recoveryFailure} bundle after Host remains fail-closed until recovery`, async () => {
    await exerciseUnreceiptedHostRecovery(
      `indeterminate-recovery-${recoveryFailure}`,
      (clock) => new IndeterminateRecoveryAfterHostStore(recoveryFailure, { clock }),
    );
  });
}

for (const shape of [
  "outcome_unknown_with_receipt",
  "executing_with_receipt",
  "reserved_with_receipt",
  "reserved_with_execution_started_at",
  "executing_without_execution_started_at",
  "outcome_unknown_with_execution_started_at",
  "succeeded_with_matching_receipt",
  "succeeded_without_receipt",
  "failed_without_receipt",
  "cancelled_without_receipt",
  "awaiting_approval_without_receipt",
  "reservation_invocation_mismatch",
] as const) {
  test(`recovery record ${shape} does not fall through to a terminal fallback`, async () => {
    let currentNow = fixedNow;
    const store = new SemanticallyTamperedRecoveryStore(shape, { clock: () => new Date(currentNow) });
    const deferred: Array<() => Promise<void>> = [];
    let providerCalls = 0;
    const request = {
      schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
      workspaceId,
      idempotencyKey: `contradictory-recovery-${shape}`,
      message: "读取入口文件",
    } as const;
    const submitTurnCommand = createTurnCommandSubmitter({
      store,
      workspaceRoots: new Map([[workspaceId, process.cwd()]]),
      model: { next: async ({ modelStepId }) => {
        providerCalls += 1;
        return deepseekStreamTextSingleToolFixture.expectedEvents.map((event) => ({ ...event, modelStepId }));
      } },
      ids: deterministicIds(),
      now: () => currentNow,
      leaseTtlMs: 1_000,
      defer: (run) => { deferred.push(run); },
    });
    const created = await submitTurnCommand(request);
    assert.equal(created.status, 202);
    if (created.status !== 202) throw new Error("expected_created_command");
    await Promise.resolve(deferred.shift()!());
    assert.equal(providerCalls, 1, "the initial worker alone may call Provider");
    assert.equal(store.hostArtifactWrites, 1, "the initial worker alone may reach Host");
    const command = await store.readRunCommand({ localPrincipalId: "local-user", workspaceId, idempotencyKey: request.idempotencyKey });
    assert.equal(command?.status, "dispatched");
    const events = await store.readEvents({ runId: created.body.runId, afterSequence: 0, limit: 20 });
    assert.equal(events.events.some((event) => /^run_(blocked|failed|completed|cancelled)$/u.test(event.kind)), false);
  });
}

test("a real oversized recovery bundle never falls through to a terminal worker failure", async () => {
  let currentNow = fixedNow;
  const store = new LeaseLossAfterHostStore({ clock: () => new Date(currentNow) });
  const ids = deterministicIds();
  const deferred: Array<() => Promise<void>> = [];
  let modelCalls = 0;
  const request = {
    schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
    workspaceId,
    idempotencyKey: "recovery-bundle-real-too-large",
    message: "读取入口文件",
  } as const;
  const submitTurnCommand = createTurnCommandSubmitter({
    store,
    workspaceRoots: new Map([[workspaceId, process.cwd()]]),
    model: { next: async ({ modelStepId }) => {
      modelCalls += 1;
      return deepseekStreamTextSingleToolFixture.expectedEvents.map((event) => ({ ...event, modelStepId }));
    } },
    ids,
    now: () => currentNow,
    leaseTtlMs: 1_000,
    defer: (run) => { deferred.push(run); },
  });
  const created = await submitTurnCommand(request);
  assert.equal(created.status, 202);
  if (created.status !== 202) throw new Error("expected_created_command");
  await Promise.resolve(deferred.shift()!());
  assert.equal(store.hostArtifactWrites, 1);
  assert.ok(store.lastLeaseToken.length > 0);
  for (let index = 0; index < 129; index += 1) {
    const reservation = await store.reserveInvocation({
      invocation: {
        schemaVersion: "meliora.tool-invocation.v1",
        invocationId: `overflow-invocation-${index}`,
        runId: created.body.runId,
        attemptId: created.body.attemptId,
        toolName: "read_file",
        toolVersion: "1.0.0",
        arguments: { index },
        argumentsHash: "a".repeat(64),
        catalogHash: "m0-read-only-workspace-tools-v1",
        idempotencyKey: `overflow-key-${index}`,
        status: "reserved",
      },
      leaseToken: store.lastLeaseToken,
      reservedAt: fixedNow,
    });
    assert.equal(reservation.kind, "owner");
  }
  assert.deepEqual(await store.readRecoveryBundle({ runId: created.body.runId, eventLimit: 128 }), {
    kind: "failure",
    code: "recovery_bundle_too_large",
  });

  currentNow = "2026-09-12T03:00:02.000Z";
  await submitTurnCommand(request);
  await Promise.resolve(deferred.shift()!());
  assert.equal(modelCalls, 1, "an oversized bundle must not replay Provider");
  assert.equal(store.hostArtifactWrites, 1, "an oversized bundle must not replay Host");
  const command = await store.readRunCommand({ localPrincipalId: "local-user", workspaceId, idempotencyKey: request.idempotencyKey });
  assert.equal(command?.status, "dispatched");
  const events = await store.readEvents({ runId: created.body.runId, afterSequence: 0, limit: 50 });
  assert.equal(events.events.some((event) => /^run_(blocked|failed|completed|cancelled)$/u.test(event.kind)), false);
});

test("concurrent replay workers settle one unreceipted Host invocation exactly once", async () => {
  let currentNow = fixedNow;
  const store = new LeaseLossAfterHostStore({ clock: () => new Date(currentNow) });
  const ids = deterministicIds();
  const deferred: Array<() => Promise<void>> = [];
  let modelCalls = 0;
  const request = {
    schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
    workspaceId,
    idempotencyKey: "concurrent-recovery-after-host",
    message: "读取入口文件",
  } as const;
  const submitTurnCommand = createTurnCommandSubmitter({
    store,
    workspaceRoots: new Map([[workspaceId, process.cwd()]]),
    model: { next: async ({ modelStepId }) => {
      modelCalls += 1;
      return deepseekStreamTextSingleToolFixture.expectedEvents.map((event) => ({ ...event, modelStepId }));
    } },
    ids,
    now: () => currentNow,
    leaseTtlMs: 1_000,
    defer: (run) => { deferred.push(run); },
  });
  const created = await submitTurnCommand(request);
  assert.equal(created.status, 202);
  if (created.status !== 202) throw new Error("expected_created_command");
  await Promise.resolve(deferred.shift()!());
  assert.equal(modelCalls, 1);
  assert.equal(store.hostArtifactWrites, 1);
  currentNow = "2026-09-12T03:00:02.000Z";
  await submitTurnCommand(request);
  await submitTurnCommand(request);
  assert.equal(deferred.length, 2, "both replay workers must be scheduled before either is run");
  await Promise.all(deferred.splice(0).map((run) => run()));

  assert.equal(modelCalls, 1, "concurrent recovery must not replay Provider");
  assert.equal(store.hostArtifactWrites, 1, "concurrent recovery must not replay Host");
  const command = await store.readRunCommand({ localPrincipalId: "local-user", workspaceId, idempotencyKey: request.idempotencyKey });
  assert.equal(command?.status, "terminal");
  assert.equal(command?.terminalStatus, "blocked");
  assert.equal(command?.terminalCode, "tool_invocation_outcome_unknown");
  const events = await store.readEvents({ runId: created.body.runId, afterSequence: 0, limit: 50 });
  assert.equal(events.events.filter((event) => event.kind === "run_blocked").length, 1);
  assert.equal(events.events.some((event) => event.kind === "run_failed"), false);
});

test("POST /api/turns rejects sensitive input before durable command creation", async () => {
  const store = new MemorySessionStore();
  const submitTurnCommand = createTurnCommandSubmitter({
    store,
    workspaceRoots: new Map([[workspaceId, process.cwd()]]),
    model: { next: async () => [] },
    ids: createDefaultTurnCommandIds(),
    now: () => fixedNow,
  });
  const app = await startServer(store, submitTurnCommand, async () => null);
  try {
    const response = await postTurn(app.url, {
      schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
      workspaceId,
      idempotencyKey: "sensitive-input",
      message: "OPENAI_API_KEY=sk-1234567890abcdef1234567890abcdef",
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json() as { error: { code: string } }).error.code, "sensitive_input_rejected");
    assert.equal(await store.readRunCommand({
      localPrincipalId: "local-user",
      workspaceId,
      idempotencyKey: "sensitive-input",
    }), null);
  } finally {
    await app.close();
  }
});
