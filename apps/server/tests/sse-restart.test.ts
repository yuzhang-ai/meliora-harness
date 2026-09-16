import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { request as httpRequest, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalRunCommandRequestHash, SqliteSessionStore } from "../../../packages/session-store/index.js";
import type {
  ReadEventLogPageInput,
  ReadEventsInput,
  SessionStorePort,
  StoredEvent,
} from "../../../packages/session-store/contracts.js";
import { listenOnFetchSafeLoopbackPort } from "../../../tests/helpers/fetch-safe-listener.js";
import { createMelioraServer, writeWithBackpressure, type MelioraServerOptions } from "../src/server.js";

const timestamp = (sequence: number): string => `2026-09-15T00:00:0${sequence}.000Z`;

const event = (
  sequence: number,
  kind: "assistant_text_delta" | "run_completed" | "model.reasoning_delta" | "unknown_public_kind",
  visibility: "public" | "private" = "public",
): StoredEvent => ({
  schemaVersion: "meliora.session-event.v1",
  eventId: `event-${sequence}`,
  runId: "run-restart",
  attemptId: "attempt-restart",
  sequence,
  kind,
  visibility,
  payload: kind === "run_completed"
    ? { outcomeId: "outcome-restart", summary: "done" }
    : kind === "assistant_text_delta"
      ? { delta: `public-${sequence}` }
      : { ignored: sequence },
  createdAt: timestamp(sequence),
});

type ReadOnlyStoreState = Readonly<{ events: StoredEvent[]; recoveryCalls: number; writeCalls: number }>;

type ReadOnlyStoreOptions = Readonly<{
  authorizePublicStoredEvent?: SessionStorePort["authorizePublicStoredEvent"];
  afterFixedRead?: () => void;
}>;

const createReadOnlyStore = (
  state: { events: StoredEvent[]; recoveryCalls: number; writeCalls: number },
  options: ReadOnlyStoreOptions = {},
): SessionStorePort => ({
  readEvents: async ({ runId, afterSequence = 0, limit }: ReadEventsInput) => {
    const eligible = state.events.filter((item) => item.runId === runId && item.sequence > afterSequence);
    const page = eligible.slice(0, limit);
    return { events: page, nextSequence: eligible.length > page.length ? page.at(-1)?.sequence ?? null : null };
  },
  readEventLogPage: async ({ runId, afterSequence = 0, throughSequence, limit }: ReadEventLogPageInput) => {
    const all = state.events.filter((item) => item.runId === runId);
    if (all.length === 0) return { kind: "not_found" as const, code: "run_not_found" as const };
    const head = all.at(-1)!.sequence;
    if (throughSequence !== undefined && (!Number.isSafeInteger(throughSequence) || throughSequence < 0 || throughSequence > head)) {
      return { kind: "conflict" as const, code: "event_watermark_conflict" as const };
    }
    const watermark = throughSequence ?? head;
    const eligible = all.filter((item) => item.sequence > afterSequence && item.sequence <= watermark);
    const page = eligible.slice(0, limit);
    const result = {
      kind: "found" as const,
      events: page,
      nextSequence: eligible.length > page.length ? page.at(-1)?.sequence ?? null : null,
      throughSequence: watermark,
    };
    options.afterFixedRead?.();
    return result;
  },
  authorizePublicStoredEvent: options.authorizePublicStoredEvent ?? (async () => ({ kind: "authorized" as const })),
  listRecoverableCommands: async () => {
    state.recoveryCalls += 1;
    throw new Error("SSE/read routes must not invoke recovery");
  },
  transitionRunCommand: async () => {
    state.writeCalls += 1;
    throw new Error("SSE/read routes must not write Commands");
  },
  appendEvents: async () => {
    state.writeCalls += 1;
    throw new Error("SSE/read routes must not append events");
  },
} as unknown as SessionStorePort);

const start = async (
  store: SessionStorePort,
  options: Pick<MelioraServerOptions, "submitTurnCommand"> = {},
) => {
  const server = createMelioraServer({
    ...options,
    store,
    resolveSessionId: async () => "session-restart",
    resolveLocalPrincipalId: async () => "local-user",
    pollIntervalMs: 5,
    heartbeatMs: 60_000,
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

const rawGet = async (url: string, path: string, headers: Readonly<Record<string, string>> = {}) => new Promise<Readonly<{
  statusCode: number | undefined;
  body: string;
  headers: Readonly<Record<string, string | string[] | undefined>>;
}>>((resolve, reject) => {
  const target = new URL(url);
  const request = httpRequest({ hostname: target.hostname, port: target.port, path, method: "GET", headers }, (response) => {
    let body = "";
    response.setEncoding("utf8");
    response.on("data", (chunk: string) => { body += chunk; });
    response.on("end", () => resolve({ statusCode: response.statusCode, body, headers: response.headers }));
  });
  request.on("error", reject);
  request.end();
});

const openSse = (url: string, path: string, headers: Readonly<Record<string, string>> = {}) => {
  let resolveOpened: (() => void) | undefined;
  let rejectOpened: ((error: Error) => void) | undefined;
  const opened = new Promise<void>((resolve, reject) => { resolveOpened = resolve; rejectOpened = reject; });
  const completed = new Promise<Readonly<{ statusCode: number | undefined; body: string }>>((resolve, reject) => {
    const target = new URL(url);
    const request = httpRequest({ hostname: target.hostname, port: target.port, path, method: "GET", headers }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { body += chunk; });
      response.on("end", () => resolve({ statusCode: response.statusCode, body }));
      response.on("error", reject);
      resolveOpened?.();
    });
    request.on("error", (error) => { rejectOpened?.(error); reject(error); });
    request.end();
  });
  return { opened, completed };
};

const disconnectAfterFirstEvent = async (url: string): Promise<string> => new Promise((resolve, reject) => {
  const target = new URL(url);
  const request = httpRequest({ hostname: target.hostname, port: target.port, path: "/api/runs/run-restart/events", method: "GET" }, (response) => {
    let body = "";
    response.setEncoding("utf8");
    response.on("data", (chunk: string) => {
      body += chunk;
      if (body.includes("id: 1\nevent: assistant_text_delta")) response.destroy();
    });
    response.on("close", () => resolve(body));
    response.on("error", reject);
  });
  request.on("error", reject);
  request.end();
});

test("SSE restart: disconnect resumes only later authorized events across raw gaps without any write path", async () => {
  const state = {
    events: [event(1, "assistant_text_delta"), event(2, "model.reasoning_delta", "private"), event(3, "unknown_public_kind")],
    recoveryCalls: 0,
    writeCalls: 0,
  };
  const before: ReadOnlyStoreState = { events: structuredClone(state.events), recoveryCalls: 0, writeCalls: 0 };
  const app = await start(createReadOnlyStore(state));
  try {
    const disconnected = await disconnectAfterFirstEvent(app.url);
    assert.match(disconnected, /id: 1\nevent: assistant_text_delta/u);
    state.events.push(event(4, "assistant_text_delta"), event(5, "run_completed"));

    const resumed = await rawGet(app.url, "/api/runs/run-restart/events", { "Last-Event-ID": "1" });
    assert.equal(resumed.statusCode, 200);
    assert.match(resumed.body, /id: 4\nevent: assistant_text_delta/u);
    assert.match(resumed.body, /id: 5\nevent: run_completed/u);
    assert.doesNotMatch(resumed.body, /id: 1|id: 2|id: 3|reasoning|unknown_public_kind/u);
    assert.equal(state.recoveryCalls, before.recoveryCalls);
    assert.equal(state.writeCalls, before.writeCalls);
    assert.deepEqual(state.events.slice(0, 3), before.events, "SSE reads must not mutate existing durable semantics");
  } finally { await app.close(); }
});

test("SSE restart: a terminal cursor with a complete fixed raw view returns bodyless 204, while a raw tail fails closed", async () => {
  const complete = { events: [event(1, "run_completed")], recoveryCalls: 0, writeCalls: 0 };
  const completeApp = await start(createReadOnlyStore(complete));
  try {
    const response = await rawGet(completeApp.url, "/api/runs/run-restart/events", { "Last-Event-ID": "1" });
    assert.equal(response.statusCode, 204);
    assert.equal(response.body, "");
    assert.equal(complete.recoveryCalls, 0);
    assert.equal(complete.writeCalls, 0);
  } finally { await completeApp.close(); }

  const tailed = { events: [event(1, "run_completed"), event(2, "model.reasoning_delta", "private")], recoveryCalls: 0, writeCalls: 0 };
  const tailedApp = await start(createReadOnlyStore(tailed));
  try {
    const response = await rawGet(tailedApp.url, "/api/runs/run-restart/events", { "Last-Event-ID": "1" });
    assert.equal(response.statusCode, 409);
    assert.match(response.body, /event_cursor_conflict/u);
    assert.equal(tailed.recoveryCalls, 0);
    assert.equal(tailed.writeCalls, 0);
  } finally { await tailedApp.close(); }
});

test("SSE cursor authorization rejection, fixed-view terminal race, and GET spies remain fail-closed and read-only", async () => {
  const rejected = { events: [event(1, "assistant_text_delta")], recoveryCalls: 0, writeCalls: 0 };
  let submitCalls = 0;
  const rejectedApp = await start(createReadOnlyStore(rejected, {
    authorizePublicStoredEvent: async () => ({ kind: "rejected" as const }),
  }), {
    submitTurnCommand: async () => {
      submitCalls += 1;
      throw new Error("GET must not submit a turn");
    },
  });
  try {
    const response = await rawGet(rejectedApp.url, "/api/runs/run-restart/events", { "Last-Event-ID": "1" });
    assert.equal(response.statusCode, 409);
    assert.match(response.body, /event_cursor_conflict/u);
    assert.doesNotMatch(response.body, /public-1|assistant_text_delta/u, "rejected cursor payload must not leak into the HTTP error");
    assert.equal(submitCalls, 0);
    assert.equal(rejected.recoveryCalls, 0);
    assert.equal(rejected.writeCalls, 0);
  } finally { await rejectedApp.close(); }

  const raced = { events: [event(1, "run_completed")], recoveryCalls: 0, writeCalls: 0 };
  let appendedTail = false;
  const racedApp = await start(createReadOnlyStore(raced, {
    afterFixedRead: () => {
      if (appendedTail) return;
      appendedTail = true;
      raced.events.push(event(2, "model.reasoning_delta", "private"));
    },
  }));
  try {
    const snapshotWinner = await rawGet(racedApp.url, "/api/runs/run-restart/events", { "Last-Event-ID": "1" });
    assert.equal(snapshotWinner.statusCode, 204, "the first request uses its already captured clean watermark");
    assert.equal(snapshotWinner.body, "");
    assert.equal(snapshotWinner.headers["cache-control"], "no-store");
    const laterRead = await rawGet(racedApp.url, "/api/runs/run-restart/events", { "Last-Event-ID": "1" });
    assert.equal(laterRead.statusCode, 409, "a later fixed view sees the raw tail and fails closed");
    assert.equal(raced.recoveryCalls, 0);
    assert.equal(raced.writeCalls, 0);
  } finally { await racedApp.close(); }
});

test("SSE uses the fixed terminal definition even when an untyped caller supplies a legacy override", async () => {
  const state = { events: [event(1, "run_completed")], recoveryCalls: 0, writeCalls: 0 };
  const app = await start(createReadOnlyStore(state), {
    isTerminalEvent: () => false,
  } as unknown as Pick<MelioraServerOptions, "submitTurnCommand">);
  try {
    const response = await rawGet(app.url, "/api/runs/run-restart/events");
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /id: 1\nevent: run_completed/u);
    assert.equal(state.recoveryCalls, 0);
    assert.equal(state.writeCalls, 0);
  } finally { await app.close(); }
});

class BackpressuredResponse extends EventEmitter {
  destroyed = false;
  writableEnded = false;
  writes = 0;

  write(_chunk: string): boolean {
    this.writes += 1;
    return false;
  }
}

test("writeWithBackpressure resumes on drain and fails closed on close or error without listener leaks", async () => {
  const drain = new BackpressuredResponse();
  const drained = writeWithBackpressure(drain as unknown as ServerResponse, "event");
  assert.equal(drain.listenerCount("drain"), 1);
  drain.emit("drain");
  assert.equal(await drained, true);
  assert.equal(drain.listenerCount("drain") + drain.listenerCount("close") + drain.listenerCount("error"), 0);

  for (const signal of ["close", "error"] as const) {
    const response = new BackpressuredResponse();
    const pending = writeWithBackpressure(response as unknown as ServerResponse, "event");
    response.emit(signal, ...(signal === "error" ? [new Error("socket failed")] : []));
    assert.equal(await pending, false, `${signal} before drain must not resume emission`);
    assert.equal(response.listenerCount("drain") + response.listenerCount("close") + response.listenerCount("error"), 0);
  }
});

test("SSE restart: Server B resumes a concurrent SQLite suffix after Server A consumed its cursor and preserves durable state", async () => {
  const parent = await mkdtemp(join(tmpdir(), "meliora-sse-restart-"));
  const databasePath = join(parent, "meliora.sqlite");
  const reservedAt = "2026-09-15T00:00:00.000Z";
  const commandScope = { localPrincipalId: "local-user", workspaceId: "workspace-restart", idempotencyKey: "restart-key" };
  let storeA: SqliteSessionStore | undefined;
  let writer: SqliteSessionStore | undefined;
  let storeB: SqliteSessionStore | undefined;
  let appA: Awaited<ReturnType<typeof start>> | undefined;
  let appB: Awaited<ReturnType<typeof start>> | undefined;
  try {
    storeA = new SqliteSessionStore(databasePath, { clock: () => new Date(reservedAt), nonce: () => "restart-a-nonce" });
    const reservation = await storeA.reserveRunCommand({
      localPrincipalId: "local-user",
      workspaceId: "workspace-restart",
      idempotencyKey: "restart-key",
      canonicalRequestHash: canonicalRunCommandRequestHash({ workspaceId: "workspace-restart", message: "replay terminal" }),
      sessionId: "session-restart",
      turnId: "turn-restart",
      runId: "run-restart",
      attemptId: "attempt-restart",
      catalogHash: "catalog-restart",
      intentRevision: 1,
      userMessage: "replay terminal",
      reservedAt,
    });
    assert.equal(reservation.kind, "owner");
    const lease = await storeA.acquireLease({
      runId: "run-restart", attemptId: "attempt-restart", ownerId: "seed", ttlMs: 60_000, requestedAt: reservedAt,
    });
    assert.equal(lease.kind, "acquired");
    if (lease.kind !== "acquired") throw new Error("expected_seed_lease");
    assert.equal((await storeA.appendEvents({
      runId: "run-restart", attemptId: "attempt-restart", leaseToken: lease.leaseToken, expectedSequence: 0,
      events: [{
        schemaVersion: "meliora.session-event.v1", eventId: "event-1", kind: "assistant_text_delta", visibility: "public",
        payload: { delta: "first durable public event" }, createdAt: reservedAt,
      }],
    })).kind, "appended");

    appA = await start(storeA);
    const consumedByA = await disconnectAfterFirstEvent(appA.url);
    assert.match(consumedByA, /id: 1\nevent: assistant_text_delta/u);
    await appA.close();
    appA = undefined;
    storeA.close();
    storeA = undefined;

    const readSemantics = async (store: SqliteSessionStore) => {
      const recovery = await store.readRecoveryBundle({ runId: "run-restart", eventLimit: 10 });
      assert.equal(recovery.kind, "found");
      if (recovery.kind !== "found") throw new Error("expected_recovery_bundle");
      return {
        command: await store.readRunCommand(commandScope),
        activeAttempt: recovery.bundle.activeAttempt,
        latestAttemptNumber: recovery.bundle.latestAttemptNumber,
        eventHeadSequence: recovery.bundle.eventHeadSequence,
        events: await store.readEvents({ runId: "run-restart", afterSequence: 0, limit: 10 }),
      };
    };

    // B establishes the Last-Event-ID:1 stream before this second SQLite
    // connection appends a raw private gap, another public event, and terminal.
    // That proves poll-based delivery observes only the authorized suffix.
    writer = new SqliteSessionStore(databasePath, { clock: () => new Date(reservedAt), nonce: () => "restart-writer-nonce" });
    storeB = new SqliteSessionStore(databasePath, { clock: () => new Date(reservedAt), nonce: () => "restart-b-nonce" });
    appB = await start(storeB);
    const liveSuffix = openSse(appB.url, "/api/runs/run-restart/events", { "Last-Event-ID": "1" });
    await liveSuffix.opened;
    assert.equal((await writer.appendEvents({
      runId: "run-restart", attemptId: "attempt-restart", leaseToken: lease.leaseToken, expectedSequence: 1,
      events: [
        {
          schemaVersion: "meliora.session-event.v1", eventId: "event-2", kind: "fixture.private_gap", visibility: "private",
          payload: { ignored: true }, createdAt: timestamp(2),
        },
        {
          schemaVersion: "meliora.session-event.v1", eventId: "event-3", kind: "assistant_text_delta", visibility: "public",
          payload: { delta: "concurrent public suffix" }, createdAt: timestamp(3),
        },
        {
          schemaVersion: "meliora.session-event.v1", eventId: "event-4", kind: "run_completed", visibility: "public",
          payload: { outcomeId: "outcome-restart", summary: "durable terminal" }, createdAt: timestamp(4),
        },
      ],
    })).kind, "appended");
    const beforeB = await readSemantics(writer);
    const suffix = await liveSuffix.completed;
    assert.equal(suffix.statusCode, 200);
    assert.match(suffix.body, /id: 3\nevent: assistant_text_delta/u);
    assert.match(suffix.body, /id: 4\nevent: run_completed/u);
    assert.doesNotMatch(suffix.body, /id: [12]\n|fixture\.private_gap/u);
    const terminalCursor = await rawGet(appB.url, "/api/runs/run-restart/events", { "Last-Event-ID": "4" });
    assert.equal(terminalCursor.statusCode, 204);
    assert.equal(terminalCursor.body, "");
    assert.deepEqual(await readSemantics(storeB), beforeB, "Server B SSE is a pure read of the existing Run/Attempt/Command/event semantics");
  } finally {
    await appA?.close();
    await appB?.close();
    storeA?.close();
    writer?.close();
    storeB?.close();
    await rm(parent, { recursive: true, force: true });
  }
});
