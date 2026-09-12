import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";

import type {
  ReserveRunCommandInput,
  SessionStorePort,
  TransitionRunCommandInput,
} from "../contracts.js";
import { MemorySessionStore } from "../memory-session-store.js";
import {
  RUN_COMMAND_USER_MESSAGE_MAX_UTF8_BYTES,
  RunCommandContractError,
  canonicalRunCommandRequestHash,
  deriveModelStepRecoveryDisposition,
} from "../run-command-contract.js";
import { hashBytes } from "../src/integrity.js";
import { SqliteSessionStore } from "../src/sqlite-session-store.js";
import { createTempDatabase } from "./helpers.js";

const timestamp = (offsetMs = 0): string =>
  new Date(Date.parse("2026-09-11T08:00:00.000Z") + offsetMs).toISOString();

const commandInput = (
  suffix: string,
  overrides: Partial<ReserveRunCommandInput> = {},
): ReserveRunCommandInput => {
  const workspaceId = overrides.workspaceId ?? "workspace-1";
  const userMessage = overrides.userMessage ?? "Inspect the repository status.";
  return {
    localPrincipalId: "local-user",
    workspaceId,
    idempotencyKey: `command-key-${suffix}`,
    sessionId: `session-${suffix}`,
    turnId: `turn-${suffix}`,
    runId: `run-${suffix}`,
    attemptId: `attempt-${suffix}`,
    catalogHash: "catalog-hash",
    intentRevision: 1,
    userMessage,
    reservedAt: timestamp(),
    ...overrides,
    canonicalRequestHash: overrides.canonicalRequestHash
      ?? canonicalRunCommandRequestHash({ workspaceId, message: userMessage }),
  };
};

type StoreHarness = Readonly<{
  store: SessionStorePort;
  advance: (milliseconds: number) => void;
  close: () => void;
}>;

const adapters: readonly Readonly<{
  name: string;
  create: (t: TestContext) => StoreHarness;
}>[] = [
  {
    name: "MemorySessionStore",
    create: () => {
      let lease = 0;
      let now = Date.parse(timestamp());
      return {
        store: new MemorySessionStore({
          clock: () => new Date(now),
          nextLeaseToken: () => `lease-${++lease}`,
        }),
        advance: (milliseconds) => { now += milliseconds; },
        close: () => undefined,
      };
    },
  },
  {
    name: "SqliteSessionStore",
    create: (t) => {
      let nonce = 0;
      let now = Date.parse(timestamp());
      const store = new SqliteSessionStore(createTempDatabase(t), {
        clock: () => new Date(now),
        nonce: () => `nonce-${++nonce}`,
      });
      return {
        store,
        advance: (milliseconds) => { now += milliseconds; },
        close: () => store.close(),
      };
    },
  },
];

const reserveInChildProcess = (
  databasePath: string,
  input: ReserveRunCommandInput,
): Promise<Readonly<{ kind: string; command?: Readonly<{ runId: string }> }>> => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [
    "--import",
    "tsx",
    fileURLToPath(new URL("./run-command-worker.ts", import.meta.url)),
    databasePath,
    Buffer.from(JSON.stringify(input), "utf8").toString("base64url"),
  ], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => {
    if (code !== 0) reject(new Error(`command worker failed (${code}): ${stderr}`));
    else resolve(JSON.parse(stdout) as Readonly<{ kind: string; command?: Readonly<{ runId: string }> }>);
  });
});

for (const adapter of adapters) {
  test(`${adapter.name} reserves a command atomically and scopes idempotency`, async (t) => {
    const harness = adapter.create(t);
    try {
      const first = commandInput("first");
      const owner = await harness.store.reserveRunCommand(first);
      assert.equal(owner.kind, "owner");
      if (owner.kind !== "owner") throw new Error("expected command owner");

      const replay = await harness.store.reserveRunCommand({
        ...first,
        sessionId: "session-retry",
        turnId: "turn-retry",
        runId: "run-retry",
        attemptId: "attempt-retry",
        reservedAt: timestamp(1_000),
      });
      assert.equal(replay.kind, "replay");
      if (replay.kind !== "replay") throw new Error("expected command replay");
      assert.deepEqual(replay.command, owner.command);
      assert.equal(await harness.store.readPrivateUserInput({ sessionId: "session-retry", turnId: "turn-retry" }), null);

      const changed = commandInput("changed", {
        localPrincipalId: first.localPrincipalId,
        workspaceId: first.workspaceId,
        idempotencyKey: first.idempotencyKey,
        userMessage: "Inspect a different repository fact.",
      });
      assert.deepEqual(await harness.store.reserveRunCommand(changed), {
        kind: "conflict",
        code: "idempotency_key_conflict",
      });
      assert.equal(await harness.store.readPrivateUserInput({ sessionId: changed.sessionId, turnId: changed.turnId }), null);

      const otherWorkspace = commandInput("workspace", {
        workspaceId: "workspace-2",
        idempotencyKey: first.idempotencyKey,
      });
      assert.equal((await harness.store.reserveRunCommand(otherWorkspace)).kind, "owner");
      const otherPrincipal = commandInput("principal", {
        localPrincipalId: "other-local-user",
        workspaceId: first.workspaceId,
        idempotencyKey: first.idempotencyKey,
      });
      assert.equal((await harness.store.reserveRunCommand(otherPrincipal)).kind, "owner");

      const identityCollision = commandInput("identity-collision", { attemptId: first.attemptId });
      assert.deepEqual(await harness.store.reserveRunCommand(identityCollision), {
        kind: "conflict",
        code: "command_identity_conflict",
      });
      assert.equal(await harness.store.readPrivateUserInput({
        sessionId: identityCollision.sessionId,
        turnId: identityCollision.turnId,
      }), null);

      const privateInput = await harness.store.readPrivateUserInput({
        sessionId: first.sessionId,
        turnId: first.turnId,
      });
      assert.equal(privateInput?.visibility, "private");
      assert.equal(privateInput?.role, "user");
      assert.equal(privateInput?.content, first.userMessage);
      assert.equal(privateInput?.contentHash, hashBytes(first.userMessage));
    } finally {
      harness.close();
    }
  });

  test(`${adapter.name} enforces command state and Model Step checkpoints`, async (t) => {
    const harness = adapter.create(t);
    try {
      const input = commandInput("lifecycle");
      assert.equal((await harness.store.reserveRunCommand(input)).kind, "owner");
      const lease = await harness.store.acquireLease({
        runId: input.runId,
        attemptId: input.attemptId,
        ownerId: "worker-1",
        ttlMs: 60_000,
        requestedAt: timestamp(),
      });
      assert.equal(lease.kind, "acquired");
      if (lease.kind !== "acquired") throw new Error("expected lease");
      const transitionAuthority = {
        runId: input.runId,
        attemptId: input.attemptId,
        leaseToken: lease.leaseToken,
      } as const;
      assert.deepEqual(await harness.store.transitionRunCommand({
        localPrincipalId: input.localPrincipalId,
        workspaceId: input.workspaceId,
        idempotencyKey: input.idempotencyKey,
        ...transitionAuthority,
        leaseToken: "stale-lease",
        expectedStatus: "reserved",
        nextStatus: "accepted",
        updatedAt: timestamp(1_000),
      }), { kind: "conflict", code: "lease_not_held" });
      const accepted = await harness.store.transitionRunCommand({
        localPrincipalId: input.localPrincipalId,
        workspaceId: input.workspaceId,
        idempotencyKey: input.idempotencyKey,
        ...transitionAuthority,
        expectedStatus: "reserved",
        nextStatus: "accepted",
        updatedAt: timestamp(1_000),
      });
      assert.equal(accepted.kind, "updated");
      assert.equal((await harness.store.transitionRunCommand({
        localPrincipalId: input.localPrincipalId,
        workspaceId: input.workspaceId,
        idempotencyKey: input.idempotencyKey,
        ...transitionAuthority,
        expectedStatus: "reserved",
        nextStatus: "accepted",
        updatedAt: timestamp(1_000),
      })).kind, "replay");
      assert.deepEqual(await harness.store.transitionRunCommand({
        localPrincipalId: input.localPrincipalId,
        workspaceId: input.workspaceId,
        idempotencyKey: input.idempotencyKey,
        ...transitionAuthority,
        expectedStatus: "accepted",
        nextStatus: "reserved",
        updatedAt: timestamp(2_000),
      }), { kind: "conflict", code: "command_status_conflict" });
      assert.deepEqual(await harness.store.transitionRunCommand({
        localPrincipalId: input.localPrincipalId,
        workspaceId: input.workspaceId,
        idempotencyKey: input.idempotencyKey,
        ...transitionAuthority,
        expectedStatus: "accepted",
        nextStatus: "dispatched",
        updatedAt: timestamp(2_000),
      } as unknown as TransitionRunCommandInput), { kind: "conflict", code: "command_status_conflict" });
      const fingerprint = hashBytes("model-request-lifecycle");
      const startedInput = {
        runId: input.runId,
        attemptId: input.attemptId,
        leaseToken: lease.leaseToken,
        modelStepId: "model-step-1",
        requestFingerprint: fingerprint,
        startedAt: timestamp(3_000),
      } as const;
      const started = await harness.store.startModelStep(startedInput);
      assert.equal(started.kind, "started");
      assert.deepEqual(await harness.store.startModelStep(startedInput), {
        kind: "conflict",
        code: "model_step_in_progress",
      });
      assert.deepEqual(await harness.store.startModelStep({
        ...startedInput,
        requestFingerprint: hashBytes("different-model-request"),
      }), { kind: "conflict", code: "model_step_conflict" });
      assert.equal((await harness.store.readRunCommand(input))?.status, "dispatched");
      assert.deepEqual(
        deriveModelStepRecoveryDisposition((await harness.store.readModelStep({
          runId: input.runId,
          modelStepId: startedInput.modelStepId,
        }))!),
        { kind: "blocked", code: "model_step_outcome_unknown", retryProvider: false },
      );
      assert.deepEqual(await harness.store.startModelStep({
        ...startedInput,
        modelStepId: "model-step-2",
        requestFingerprint: hashBytes("model-request-2"),
      }), { kind: "conflict", code: "model_step_in_progress" });

      const finishInput = {
        runId: input.runId,
        attemptId: input.attemptId,
        leaseToken: lease.leaseToken,
        modelStepId: startedInput.modelStepId,
        requestFingerprint: fingerprint,
        outcome: { status: "terminal" as const, finishedAt: timestamp(4_000) },
      };
      assert.deepEqual(await harness.store.finishModelStep({
        ...finishInput,
        outcome: { status: "terminal", finishedAt: timestamp(2_000) },
      }), { kind: "conflict", code: "model_step_conflict" });
      assert.equal((await harness.store.finishModelStep(finishInput)).kind, "committed");
      assert.equal((await harness.store.finishModelStep(finishInput)).kind, "replay");
      assert.deepEqual(await harness.store.finishModelStep({
        ...finishInput,
        outcome: { status: "terminal", finishedAt: timestamp(5_000) },
      }), { kind: "conflict", code: "model_step_conflict" });
      assert.equal((await harness.store.readLatestModelStep({ runId: input.runId }))?.status, "terminal");

      const terminal = await harness.store.transitionRunCommand({
        localPrincipalId: input.localPrincipalId,
        workspaceId: input.workspaceId,
        idempotencyKey: input.idempotencyKey,
        ...transitionAuthority,
        expectedStatus: "dispatched",
        nextStatus: "terminal",
        terminalStatus: "completed",
        updatedAt: timestamp(6_000),
      });
      assert.equal(terminal.kind, "updated");
      assert.equal(terminal.kind === "updated" ? terminal.command.terminalStatus : null, "completed");
    } finally {
      harness.close();
    }
  });

  test(`${adapter.name} checkpoints recovered Attempts without duplicating an unresolved Model Step`, async (t) => {
    const harness = adapter.create(t);
    try {
      const recoverable = commandInput("recoverable");
      assert.equal((await harness.store.reserveRunCommand(recoverable)).kind, "owner");
      const initialLease = await harness.store.acquireLease({
        runId: recoverable.runId,
        attemptId: recoverable.attemptId,
        ownerId: "worker-initial",
        ttlMs: 1_000,
        requestedAt: timestamp(),
      });
      assert.equal(initialLease.kind, "acquired");
      if (initialLease.kind !== "acquired") throw new Error("expected initial lease");
      assert.equal((await harness.store.transitionRunCommand({
        localPrincipalId: recoverable.localPrincipalId,
        workspaceId: recoverable.workspaceId,
        idempotencyKey: recoverable.idempotencyKey,
        runId: recoverable.runId,
        attemptId: recoverable.attemptId,
        leaseToken: initialLease.leaseToken,
        expectedStatus: "reserved",
        nextStatus: "accepted",
        updatedAt: timestamp(),
      })).kind, "updated");
      harness.advance(1_000);
      assert.deepEqual(await harness.store.transitionRunCommand({
        localPrincipalId: recoverable.localPrincipalId,
        workspaceId: recoverable.workspaceId,
        idempotencyKey: recoverable.idempotencyKey,
        runId: recoverable.runId,
        attemptId: recoverable.attemptId,
        leaseToken: initialLease.leaseToken,
        expectedStatus: "accepted",
        nextStatus: "terminal",
        terminalStatus: "failed",
        terminalCode: "expired_worker",
        updatedAt: timestamp(1_000),
      }), { kind: "conflict", code: "lease_expired" });
      const recovered = await harness.store.createRunAttempt({
        sessionId: recoverable.sessionId,
        turnId: recoverable.turnId,
        runId: recoverable.runId,
        attemptId: "attempt-recoverable-2",
        expectedLatestAttemptNumber: 1,
        catalogHash: recoverable.catalogHash,
        intentRevision: recoverable.intentRevision,
        createdAt: timestamp(1_000),
        ownerId: "worker-recovered",
        ttlMs: 60_000,
        requestedAt: timestamp(1_000),
      });
      assert.equal(recovered.kind, "created");
      if (recovered.kind !== "created") throw new Error("expected recovered Attempt");
      assert.deepEqual(await harness.store.transitionRunCommand({
        localPrincipalId: recoverable.localPrincipalId,
        workspaceId: recoverable.workspaceId,
        idempotencyKey: recoverable.idempotencyKey,
        runId: recoverable.runId,
        attemptId: recoverable.attemptId,
        leaseToken: initialLease.leaseToken,
        expectedStatus: "accepted",
        nextStatus: "terminal",
        terminalStatus: "failed",
        terminalCode: "stale_worker",
        updatedAt: timestamp(1_000),
      }), { kind: "conflict", code: "run_attempt_conflict" });
      assert.equal((await harness.store.startModelStep({
        runId: recoverable.runId,
        attemptId: recovered.attempt.attemptId,
        leaseToken: recovered.lease.leaseToken,
        modelStepId: "model-step-recovered",
        requestFingerprint: hashBytes("model-request-recovered"),
        startedAt: timestamp(1_000),
      })).kind, "started");
      assert.equal((await harness.store.readRunCommand(recoverable))?.status, "dispatched");

      const unresolved = commandInput("unresolved", { reservedAt: timestamp(1_000) });
      assert.equal((await harness.store.reserveRunCommand(unresolved)).kind, "owner");
      const unresolvedLease = await harness.store.acquireLease({
        runId: unresolved.runId,
        attemptId: unresolved.attemptId,
        ownerId: "worker-unresolved",
        ttlMs: 1_000,
        requestedAt: timestamp(1_000),
      });
      assert.equal(unresolvedLease.kind, "acquired");
      if (unresolvedLease.kind !== "acquired") throw new Error("expected initial unresolved lease");
      assert.equal((await harness.store.transitionRunCommand({
        localPrincipalId: unresolved.localPrincipalId,
        workspaceId: unresolved.workspaceId,
        idempotencyKey: unresolved.idempotencyKey,
        runId: unresolved.runId,
        attemptId: unresolved.attemptId,
        leaseToken: unresolvedLease.leaseToken,
        expectedStatus: "reserved",
        nextStatus: "accepted",
        updatedAt: timestamp(1_000),
      })).kind, "updated");
      assert.equal((await harness.store.startModelStep({
        runId: unresolved.runId,
        attemptId: unresolved.attemptId,
        leaseToken: unresolvedLease.leaseToken,
        modelStepId: "model-step-unresolved-1",
        requestFingerprint: hashBytes("model-request-unresolved-1"),
        startedAt: timestamp(1_000),
      })).kind, "started");
      harness.advance(1_000);
      const unresolvedRecovery = await harness.store.createRunAttempt({
        sessionId: unresolved.sessionId,
        turnId: unresolved.turnId,
        runId: unresolved.runId,
        attemptId: "attempt-unresolved-2",
        expectedLatestAttemptNumber: 1,
        catalogHash: unresolved.catalogHash,
        intentRevision: unresolved.intentRevision,
        createdAt: timestamp(2_000),
        ownerId: "worker-unresolved-recovery",
        ttlMs: 60_000,
        requestedAt: timestamp(2_000),
      });
      assert.equal(unresolvedRecovery.kind, "created");
      if (unresolvedRecovery.kind !== "created") throw new Error("expected unresolved recovery Attempt");
      assert.deepEqual(await harness.store.startModelStep({
        runId: unresolved.runId,
        attemptId: unresolvedRecovery.attempt.attemptId,
        leaseToken: unresolvedRecovery.lease.leaseToken,
        modelStepId: "model-step-unresolved-2",
        requestFingerprint: hashBytes("model-request-unresolved-2"),
        startedAt: timestamp(2_000),
      }), { kind: "conflict", code: "model_step_in_progress" });
    } finally {
      harness.close();
    }
  });

  test(`${adapter.name} rejects invalid and sensitive command input before persistence`, async (t) => {
    const harness = adapter.create(t);
    try {
      for (const input of [
        commandInput("invalid-id", { runId: "../run" }),
        commandInput("bad-key", { idempotencyKey: "bad/key" }),
        commandInput("blank", { userMessage: "   ", canonicalRequestHash: "0".repeat(64) }),
        commandInput("large", {
          userMessage: "😀".repeat(RUN_COMMAND_USER_MESSAGE_MAX_UTF8_BYTES / 4 + 1),
          canonicalRequestHash: "0".repeat(64),
        }),
        commandInput("secret", {
          userMessage: "Authorization: Bearer opaque-provider-credential",
          canonicalRequestHash: "0".repeat(64),
        }),
      ]) {
        await assert.rejects(
          harness.store.reserveRunCommand(input),
          (error: unknown) => error instanceof RunCommandContractError,
        );
      }
      assert.equal(await harness.store.readRunCommand({
        localPrincipalId: "local-user",
        workspaceId: "workspace-1",
        idempotencyKey: "command-key-secret",
      }), null);
    } finally {
      harness.close();
    }
  });
}

test("SQLite replays commands and unresolved Model Steps after restart", async (t) => {
  const path = createTempDatabase(t);
  const options = { clock: () => new Date(timestamp()), nonce: () => "lease-restart" };
  const input = commandInput("restart");
  const first = new SqliteSessionStore(path, options);
  assert.equal((await first.reserveRunCommand(input)).kind, "owner");
  const lease = await first.acquireLease({
    runId: input.runId,
    attemptId: input.attemptId,
    ownerId: "worker-1",
    ttlMs: 60_000,
    requestedAt: timestamp(),
  });
  if (lease.kind !== "acquired") throw new Error("expected lease");
  await first.transitionRunCommand({
    localPrincipalId: input.localPrincipalId,
    workspaceId: input.workspaceId,
    idempotencyKey: input.idempotencyKey,
    runId: input.runId,
    attemptId: input.attemptId,
    leaseToken: lease.leaseToken,
    expectedStatus: "reserved",
    nextStatus: "accepted",
    updatedAt: timestamp(1_000),
  });
  await first.startModelStep({
    runId: input.runId,
    attemptId: input.attemptId,
    leaseToken: lease.leaseToken,
    modelStepId: "model-step-restart",
    requestFingerprint: hashBytes("model-request-restart"),
    startedAt: timestamp(3_000),
  });
  first.close();

  const reopened = new SqliteSessionStore(path, options);
  const replay = await reopened.reserveRunCommand({
    ...input,
    sessionId: "session-restart-new",
    turnId: "turn-restart-new",
    runId: "run-restart-new",
    attemptId: "attempt-restart-new",
  });
  assert.equal(replay.kind, "replay");
  assert.equal(replay.kind === "replay" ? replay.command.runId : null, input.runId);
  const checkpoint = await reopened.readLatestModelStep({ runId: input.runId });
  assert.equal(checkpoint?.status, "started");
  assert.deepEqual(deriveModelStepRecoveryDisposition(checkpoint!), {
    kind: "blocked",
    code: "model_step_outcome_unknown",
    retryProvider: false,
  });
  reopened.close();
});

test("SQLite serializes concurrent command reservation across processes", async (t) => {
  const path = createTempDatabase(t);
  new SqliteSessionStore(path).close();
  const first = commandInput("concurrent-a", { idempotencyKey: "shared-process-key" });
  const second = {
    ...first,
    sessionId: "session-concurrent-b",
    turnId: "turn-concurrent-b",
    runId: "run-concurrent-b",
    attemptId: "attempt-concurrent-b",
  };
  const results = await Promise.all([
    reserveInChildProcess(path, first),
    reserveInChildProcess(path, second),
  ]);
  assert.deepEqual(results.map((result) => result.kind).sort(), ["owner", "replay"]);
  assert.equal(results[0]?.command?.runId, results[1]?.command?.runId);

  const db = new Database(path, { readonly: true });
  for (const table of ["sessions", "turns", "runs", "run_attempts", "run_commands", "run_command_inputs"]) {
    assert.equal(db.prepare(`SELECT count(*) FROM ${table}`).pluck().get(), 1, table);
  }
  db.close();
});

test("SQLite rolls back every initial entity when command insertion fails", async (t) => {
  const path = createTempDatabase(t);
  const store = new SqliteSessionStore(path);
  const injector = new Database(path);
  injector.exec("CREATE TRIGGER reject_run_command BEFORE INSERT ON run_commands BEGIN SELECT RAISE(ABORT, 'injected'); END");
  injector.close();
  await assert.rejects(store.reserveRunCommand(commandInput("rollback")));
  store.close();

  const db = new Database(path, { readonly: true });
  for (const table of ["sessions", "turns", "runs", "run_attempts", "run_commands", "run_command_inputs"]) {
    assert.equal(db.prepare(`SELECT count(*) FROM ${table}`).pluck().get(), 0, table);
  }
  db.close();
});

test("SQLite rejects sensitive command input without DB, WAL or SHM residue", async (t) => {
  const path = createTempDatabase(t);
  const safe = new SqliteSessionStore(path);
  assert.equal((await safe.reserveRunCommand(commandInput("safe"))).kind, "owner");
  const secret = "sk-command-reservation-secret-123456789";
  await assert.rejects(safe.reserveRunCommand(commandInput("sensitive", {
    userMessage: `Authorization: Bearer ${secret}`,
    canonicalRequestHash: "0".repeat(64),
  })), RunCommandContractError);
  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
    if (existsSync(candidate)) assert.equal(readFileSync(candidate).includes(Buffer.from(secret, "utf8")), false);
  }
  safe.close();
  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
    if (existsSync(candidate)) assert.equal(readFileSync(candidate).includes(Buffer.from(secret, "utf8")), false);
  }
});
