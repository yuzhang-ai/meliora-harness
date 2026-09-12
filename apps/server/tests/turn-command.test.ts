import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { deepseekStreamTextSingleToolFixture } from "../../../fixtures/contracts/v1/deepseek-stream-text-single-tool.js";
import type { PublicRunEvent } from "../../../packages/agent-runtime/public-events.js";
import type { ReadOnlyRunModelPort } from "../../../packages/agent-runtime/read-only-run-loop.js";
import { MemorySessionStore } from "../../../packages/session-store/memory-session-store.js";
import type { SessionStorePort, StartModelStepInput, StartModelStepResult } from "../../../packages/session-store/contracts.js";
import { SqliteSessionStore } from "../../../packages/session-store/index.js";
import {
  TURN_COMMAND_REQUEST_SCHEMA_VERSION,
  type TurnCommandResponse,
} from "../api-contracts/turn-command.js";
import { createMelioraServer } from "../src/server.js";
import {
  createDefaultTurnCommandIds,
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
    pollIntervalMs: 10,
    ...(maxJsonBodyBytes === undefined ? {} : { maxJsonBodyBytes }),
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
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
