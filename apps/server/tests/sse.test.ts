import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import test from "node:test";

import type { PublicRunEvent } from "../../../packages/agent-runtime/public-events.js";
import { listenOnFetchSafeLoopbackPort } from "../../../tests/helpers/fetch-safe-listener.js";
import type { ReadEventLogPageInput, ReadEventsInput, SessionStorePort, StoredEvent } from "../../../packages/session-store/contracts.js";
import { createLocalMelioraServer } from "../src/persistence.js";
import { createMelioraServer, encodeSseEvent, projectPublicEvent } from "../src/server.js";

const storedEvent = (sequence: number, kind: string, visibility: "public" | "private" = "public"): StoredEvent => ({
  schemaVersion: "meliora.session-event.v1",
  eventId: `event-${sequence}`,
  runId: "run-1",
  attemptId: "attempt-1",
  sequence,
  kind,
  visibility,
  payload: kind === "run_completed"
    ? { outcomeId: "outcome-1", summary: "done" }
    : kind === "run_blocked"
      ? { code: "approval_required", message: "waiting for approval", userActions: ["approve"] }
      : { delta: "hello" },
  createdAt: `2026-09-11T00:00:0${sequence}.000Z`,
});

const fakeStore = (
  events: readonly StoredEvent[],
  authorizePublicStoredEvent: SessionStorePort["authorizePublicStoredEvent"] = async () => ({ kind: "authorized" as const }),
): SessionStorePort => ({
  readEvents: async ({ runId, afterSequence = 0, limit }: ReadEventsInput) => {
    const eligible = events.filter((event) => event.runId === runId && event.sequence > afterSequence);
    const page = eligible.slice(0, limit);
    return { events: page, nextSequence: eligible.length > page.length ? page.at(-1)?.sequence ?? null : null };
  },
  readEventLogPage: async ({ runId, afterSequence = 0, throughSequence, limit }: ReadEventLogPageInput) => {
    const eligible = events.filter((event) => event.runId === runId);
    const head = eligible.at(-1)?.sequence ?? 0;
    if (!events.some((event) => event.runId === runId)) return { kind: "not_found" as const, code: "run_not_found" as const };
    if (throughSequence !== undefined && (!Number.isSafeInteger(throughSequence) || throughSequence < 0 || throughSequence > head)) {
      return { kind: "conflict" as const, code: "event_watermark_conflict" as const };
    }
    const watermark = throughSequence ?? head;
    const page = eligible.filter((event) => event.sequence > afterSequence && event.sequence <= watermark).slice(0, limit);
    const hasMore = eligible.some((event) => event.sequence > (page.at(-1)?.sequence ?? afterSequence) && event.sequence <= watermark);
    return { kind: "found" as const, events: page, nextSequence: hasMore ? page.at(-1)?.sequence ?? null : null, throughSequence: watermark };
  },
  authorizePublicStoredEvent,
} as unknown as SessionStorePort);

const startServer = async (
  store: SessionStorePort,
  resolveSessionId: () => Promise<string | null> = async () => "session-1",
) => {
  const server = createMelioraServer({ store, resolveSessionId, resolveLocalPrincipalId: async () => "local-user", pollIntervalMs: 10 });
  const port = await listenOnFetchSafeLoopbackPort(server);
  return {
    server,
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
};

const rawGet = async (
  baseUrl: string,
  path: string,
  headers: Readonly<Record<string, string>> = {},
): Promise<Readonly<{ statusCode: number | undefined; body: string }>> => new Promise((resolve, reject) => {
  const url = new URL(baseUrl);
  const request = httpRequest({
    headers,
    hostname: url.hostname,
    method: "GET",
    path,
    port: url.port,
  }, (response) => {
    let body = "";
    response.setEncoding("utf8");
    response.on("data", (chunk: string) => { body += chunk; });
    response.on("end", () => resolve({ statusCode: response.statusCode, body }));
  });
  request.on("error", reject);
  request.end();
});

test("GET resume and SSE reads never trigger the recovery coordinator scan", async () => {
  let recoveryScans = 0;
  const store = {
    ...fakeStore([storedEvent(1, "run_blocked")]),
    listRecoverableCommands: async () => {
      recoveryScans += 1;
      throw new Error("GET/SSE must not start recovery");
    },
  } as SessionStorePort;
  const app = await startServer(store);
  try {
    const resume = await fetch(`${app.url}/api/runs/run-1/resume`);
    assert.equal(resume.status, 200);
    const sse = await rawGet(app.url, "/api/runs/run-1/events");
    assert.equal(sse.statusCode, 200);
    assert.equal(recoveryScans, 0);
  } finally { await app.close(); }
});

test("public resume snapshot fixes the raw watermark and only returns exact authorized events", async () => {
  const resumeEvents: readonly StoredEvent[] = [
    { ...storedEvent(1, "assistant_text_delta"), visibility: "private" },
    { ...storedEvent(2, "unknown_public_kind"), payload: { anything: "nope" } },
    {
      ...storedEvent(3, "plan_updated"),
      payload: { steps: [{ id: "step-1", title: "private evidence", status: "completed", evidenceRefs: [{ artifactId: "alias-1", visibility: "public" }] }] },
    },
    {
      ...storedEvent(4, "tool_result_presented"),
      payload: { invocationId: "invocation-1", status: "succeeded", summary: "done", artifactRefs: [{ artifactId: "unbound-alias", visibility: "public" }] },
    },
    { ...storedEvent(5, "assistant_text_delta"), payload: { delta: "Bearer opaque-public-secret" } },
    { ...storedEvent(6, "run_completed"), payload: { outcomeId: "outcome-1", summary: "done" } },
    { ...storedEvent(7, "assistant_text_delta"), visibility: "private" },
  ];
  const app = await startServer(fakeStore(resumeEvents, async ({ event }) =>
    event.kind === "tool_result_presented" ? { kind: "rejected" } : { kind: "authorized" },
  ));
  try {
    const response = await fetch(`${app.url}/api/runs/run-1/resume`);
    assert.equal(response.status, 409);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { error: "resume_snapshot_conflict" });
  } finally { await app.close(); }
});

test("public resume point is not a raw throughSequence or SSE Last-Event-ID", async () => {
  const app = await startServer(fakeStore([
    storedEvent(1, "assistant_text_delta"),
    { ...storedEvent(2, "model.reasoning_delta"), visibility: "private" },
  ]));
  try {
    const response = await fetch(`${app.url}/api/runs/run-1/resume`);
    assert.equal(response.status, 200);
    const snapshot = await response.json() as Record<string, unknown>;
    assert.equal(snapshot.throughSequence, 2);
    assert.deepEqual((snapshot.events as { sequence: number }[]).map((event) => event.sequence), [1]);
    assert.equal(((snapshot.resumePoint as { event: { sequence: number } }).event).sequence, 1);
  } finally { await app.close(); }
});

test("public resume snapshot safely rejects source and response size limits", async () => {
  const sourceOverflow = Array.from({ length: 5_001 }, (_, index) => ({
    ...storedEvent(index + 1, "model.reasoning_delta"), visibility: "private" as const,
  }));
  const sourceApp = await startServer(fakeStore(sourceOverflow));
  try {
    const response = await fetch(`${sourceApp.url}/api/runs/run-1/resume`);
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: "resume_snapshot_too_large" });
  } finally { await sourceApp.close(); }

  const responseApp = await startServer(fakeStore([{
    ...storedEvent(1, "assistant_text_delta"), payload: { delta: "x".repeat(300 * 1024) },
  }]));
  try {
    const response = await fetch(`${responseApp.url}/api/runs/run-1/resume`);
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: "resume_snapshot_too_large" });
  } finally { await responseApp.close(); }
});

test("public resume reaches a terminal after a real-sized private reasoning prefix", async () => {
  const privatePrefix = Array.from({ length: 1_329 }, (_, index) => ({
    ...storedEvent(index + 1, "model.reasoning_delta"), visibility: "private" as const,
  }));
  const events = [
    ...privatePrefix,
    { ...storedEvent(1_330, "run_completed"), createdAt: "2026-09-11T00:00:00.000Z" },
  ];
  const app = await startServer(fakeStore(events));
  try {
    const response = await fetch(`${app.url}/api/runs/run-1/resume`);
    assert.equal(response.status, 200);
    const snapshot = await response.json() as { throughSequence: number; events: PublicRunEvent[] };
    assert.equal(snapshot.throughSequence, 1_330);
    assert.deepEqual(snapshot.events.map((event) => event.kind), ["run_completed"]);
    assert.equal(snapshot.events[0]?.sequence, 1_330);
  } finally { await app.close(); }
});

test("SSE resumes from numeric Last-Event-ID and filters private events", async () => {
  const fixture = [
    storedEvent(1, "assistant_text_delta"),
    storedEvent(2, "model.reasoning_delta", "private"),
    storedEvent(3, "run_completed"),
  ];
  const app = await startServer(fakeStore(fixture));
  try {
    const response = await rawGet(app.url, "/api/runs/run-1/events", { "Last-Event-ID": "1" });
    assert.equal(response.statusCode, 200);
    const body = response.body;
    assert.match(body, /id: 3\nevent: run_completed/u);
    assert.doesNotMatch(body, /model\.reasoning_delta|event-2/u);
    const data = JSON.parse(body.split("\n").find((line) => line.startsWith("data: "))!.slice(6)) as PublicRunEvent;
    assert.deepEqual(Object.keys(data).sort(), [
      "eventId", "kind", "payload", "runId", "schemaVersion", "sequence", "sessionId", "timestamp", "visibility",
    ]);
    assert.equal(data.schemaVersion, "meliora.public-run-event.v1");
    assert.equal(data.sessionId, "session-1");
    assert.equal(data.visibility, "public");
  } finally { await app.close(); }
});

test("run_blocked is terminal and closes SSE without heartbeats", async () => {
  const app = await startServer(fakeStore([storedEvent(1, "run_blocked")]));
  try {
    const response = await rawGet(app.url, "/api/runs/run-1/events");
    assert.equal(response.statusCode, 200);
    const body = response.body;
    assert.match(body, /id: 1\nevent: run_blocked/u);
    assert.doesNotMatch(body, /heartbeat/u);
  } finally { await app.close(); }
});

test("unknown public events are quarantined so a later terminal event remains reachable", async () => {
  const fixture = [
    storedEvent(1, "assistant_text_delta"),
    storedEvent(2, "invented_public_kind"),
    storedEvent(3, "run_completed"),
  ];
  const app = await startServer(fakeStore(fixture));
  try {
    const response = await rawGet(app.url, "/api/runs/run-1/events", { "Last-Event-ID": "1" });
    assert.equal(response.statusCode, 200);
    const body = response.body;
    assert.match(body, /id: 3\nevent: run_completed/u);
    assert.doesNotMatch(body, /invented_public_kind|event-2/u);
  } finally { await app.close(); }
});

test("unbound artifact events cannot emit or anchor SSE, while a later terminal remains reachable", async () => {
  const unbound = {
    ...storedEvent(1, "tool_result_presented"),
    payload: {
      invocationId: "invocation-1", status: "succeeded", summary: "safe-looking but unbound",
      artifactRefs: [{ artifactId: "receipt-backed-alias-reused-by-attacker", visibility: "public" }],
    },
  } as StoredEvent;
  const fixture = [unbound, storedEvent(2, "run_completed")];
  const store = fakeStore(fixture, async ({ event }) =>
    event.eventId === unbound.eventId ? { kind: "rejected" as const } : { kind: "authorized" as const });
  const app = await startServer(store);
  try {
    const rejected = await rawGet(app.url, "/api/runs/run-1/events", { "Last-Event-ID": "1" });
    assert.equal(rejected.statusCode, 409, "an unbound event must never become a resume anchor");
    const response = await rawGet(app.url, "/api/runs/run-1/events");
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /id: 2\nevent: run_completed/u);
    assert.doesNotMatch(response.body, /receipt-backed-alias-reused-by-attacker|id: 1/u);
  } finally { await app.close(); }
});

test("private, unknown, and malformed sequences cannot be public cursors", async () => {
  const store = fakeStore([
    storedEvent(1, "assistant_text_delta"),
    storedEvent(2, "model.reasoning_delta", "private"),
    storedEvent(3, "invented_public_kind"),
    { ...storedEvent(4, "run_completed"), payload: { outcomeId: "missing-summary" } },
    storedEvent(5, "run_completed"),
  ]);
  for (const cursor of ["2", "3", "4", "99"]) {
    const app = await startServer(store);
    try {
      const response = await rawGet(app.url, "/api/runs/run-1/events", { "Last-Event-ID": cursor });
      assert.equal(response.statusCode, 409);
      assert.equal((JSON.parse(response.body) as { error: string }).error, "event_cursor_conflict");
    } finally { await app.close(); }
  }
});

test("malformed Last-Event-ID values return 400", async () => {
  for (const cursor of ["event-1", "-1", "1.5", "9007199254740992"]) {
    const app = await startServer(fakeStore([]));
    try {
      const response = await rawGet(app.url, "/api/runs/run-1/events", { "Last-Event-ID": cursor });
      assert.equal(response.statusCode, 400);
      assert.deepEqual(JSON.parse(response.body), { error: "invalid_event_cursor" });
    } finally { await app.close(); }
  }
});

test("missing Run projection returns 404", async () => {
  const app = await startServer(fakeStore([]), async () => null);
  try {
    const response = await rawGet(app.url, "/api/runs/missing/events");
    assert.equal(response.statusCode, 404);
    assert.deepEqual(JSON.parse(response.body), { error: "run_not_found" });
  } finally { await app.close(); }
});

test("local persistence composition resolves Runs through the SQLite adapter", async () => {
  const local = createLocalMelioraServer(":memory:");
  const port = await listenOnFetchSafeLoopbackPort(local.server);
  try {
    const response = await rawGet(`http://127.0.0.1:${port}`, "/api/runs/missing/events");
    assert.equal(response.statusCode, 404);
    assert.deepEqual(JSON.parse(response.body), { error: "run_not_found" });
  } finally {
    local.server.closeAllConnections();
    await new Promise<void>((resolve, reject) => local.server.close((error) => error ? reject(error) : resolve()));
    local.store.close();
  }
});

test("unexpected store failures return 500", async () => {
  const store = { readEvents: async () => { throw new Error("database unavailable"); } } as unknown as SessionStorePort;
  const app = await startServer(store);
  try {
    const response = await rawGet(app.url, "/api/runs/run-1/events");
    assert.equal(response.statusCode, 500);
    assert.deepEqual(JSON.parse(response.body), { error: "event_stream_failed" });
  } finally { await app.close(); }
});

test("malformed encoded run ids return 400", async () => {
  const app = await startServer(fakeStore([]));
  try {
    const response = await rawGet(app.url, "/api/runs/%E0%A4%A/events");
    assert.equal(response.statusCode, 400);
    assert.deepEqual(JSON.parse(response.body), { error: "invalid_run_id" });
  } finally { await app.close(); }
});

test("projection rejects private and unknown public event kinds", () => {
  assert.throws(() => projectPublicEvent(storedEvent(1, "model.delta", "private"), "session-1"), TypeError);
  assert.throws(() => projectPublicEvent(storedEvent(1, "invented_public_kind"), "session-1"), TypeError);
});

test("projection rejects payload fields outside the public contract", () => {
  const event = storedEvent(1, "assistant_text_delta");
  assert.throws(() => projectPublicEvent({ ...event, payload: { delta: "hello", rawReasoning: "secret" } }, "session-1"), TypeError);
});

test("projection rejects private artifact references from nested public payloads", () => {
  const event = storedEvent(1, "tool_result_presented");
  assert.throws(() => projectPublicEvent({ ...event, payload: {
    invocationId: "invocation-1",
    status: "succeeded",
    summary: "safe summary",
    artifactRefs: [
      { artifactId: "artifact-public", visibility: "public" },
      { artifactId: "artifact-private", visibility: "private" },
    ],
  } }, "session-1"), TypeError);
});

test("SSE scans across quarantined records and pagination without granting them anchor status", async () => {
  const fixture = Array.from({ length: 498 }, (_, index) => storedEvent(index + 1, "assistant_text_delta"));
  fixture.push(
    storedEvent(499, "model.reasoning_delta", "private"),
    storedEvent(500, "invented_public_kind"),
    { ...storedEvent(501, "run_completed"), payload: { outcomeId: "malformed-terminal", marker: "MALFORMED_SECRET" } },
    storedEvent(502, "run_completed"),
  );
  const store = fakeStore(fixture);
  const app = await startServer(store);
  try {
    for (const cursor of ["499", "500", "501"]) {
      const rejected = await rawGet(app.url, "/api/runs/run-1/events", { "Last-Event-ID": cursor });
      assert.equal(rejected.statusCode, 409, `quarantined sequence ${cursor} must not be an anchor`);
    }
    const response = await rawGet(app.url, "/api/runs/run-1/events", { "Last-Event-ID": "498" });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /^id: 502$/mu, "the legal terminal after the raw scan gap remains reachable");
    assert.doesNotMatch(response.body, /id: 499|id: 500|id: 501|invented_public_kind|MALFORMED_SECRET/u);
  } finally { await app.close(); }
});

test("SSE framing uses sequence ids and rejects kind line breaks", () => {
  const event = projectPublicEvent(storedEvent(1, "run_completed"), "session-1");
  assert.match(encodeSseEvent(event), /^id: 1$/mu);
  assert.throws(() => encodeSseEvent({ ...event, kind: "run_completed\nid: injected" } as unknown as PublicRunEvent), TypeError);
});

test("local Host allowlist rejects DNS-rebinding hosts before command submission", async () => {
  let submissions = 0;
  const server = createMelioraServer({
    store: fakeStore([]),
    resolveSessionId: () => null,
    resolveLocalPrincipalId: () => null,
    allowedHosts: ["127.0.0.1:8787", "localhost:8787"],
    submitTurnCommand: async () => { submissions += 1; throw new Error("must not submit"); },
  });
  const port = await listenOnFetchSafeLoopbackPort(server);
  const url = `http://127.0.0.1:${port}`;
  try {
    const rejectedRead = await rawGet(url, "/api/health", { Host: "attacker.example:8787" });
    assert.equal(rejectedRead.statusCode, 403);
    const rejectedPost = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest({
        hostname: "127.0.0.1", port, path: "/api/turns", method: "POST",
        headers: { Host: "attacker.example:8787", "content-type": "application/json" },
      }, (response) => { response.resume(); response.on("end", () => resolve(response.statusCode)); });
      request.on("error", reject);
      request.end("{}");
    });
    assert.equal(rejectedPost, 403);
    assert.equal(submissions, 0);
    assert.equal((await rawGet(url, "/api/health", { Host: "127.0.0.1:8787" })).statusCode, 200);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
