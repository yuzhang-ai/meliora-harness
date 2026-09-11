import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type { PublicRunEvent } from "../../../packages/agent-runtime/public-events.js";
import type { ReadEventsInput, SessionStorePort, StoredEvent } from "../../../packages/session-store/contracts.js";
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
  payload: kind === "run_completed" ? { outcomeId: "outcome-1", summary: "done" } : { delta: "hello" },
  createdAt: `2026-09-11T00:00:0${sequence}.000Z`,
});

const fakeStore = (events: readonly StoredEvent[]): SessionStorePort => ({
  readEvents: async ({ runId, afterSequence = 0, limit }: ReadEventsInput) => {
    const eligible = events.filter((event) => event.runId === runId && event.sequence > afterSequence);
    const page = eligible.slice(0, limit);
    return { events: page, nextSequence: eligible.length > page.length ? page.at(-1)?.sequence ?? null : null };
  },
} as unknown as SessionStorePort);

const startServer = async (
  store: SessionStorePort,
  resolveSessionId: () => Promise<string | null> = async () => "session-1",
) => {
  const server = createMelioraServer({ store, resolveSessionId, pollIntervalMs: 10 });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    server,
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
};

test("SSE resumes from numeric Last-Event-ID and filters private events", async () => {
  const fixture = [
    storedEvent(1, "assistant_text_delta"),
    storedEvent(2, "model.reasoning_delta", "private"),
    storedEvent(3, "run_completed"),
  ];
  const app = await startServer(fakeStore(fixture));
  try {
    const response = await fetch(`${app.url}/api/runs/run-1/events`, { headers: { "Last-Event-ID": "1" } });
    assert.equal(response.status, 200);
    const body = await response.text();
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

test("private and unavailable sequences cannot be public cursors", async () => {
  const store = fakeStore([
    storedEvent(1, "assistant_text_delta"),
    storedEvent(2, "model.reasoning_delta", "private"),
    storedEvent(3, "run_completed"),
  ]);
  for (const cursor of ["2", "99"]) {
    const app = await startServer(store);
    try {
      const response = await fetch(`${app.url}/api/runs/run-1/events`, { headers: { "Last-Event-ID": cursor } });
      assert.equal(response.status, 409);
      assert.equal((await response.json() as { error: string }).error, "event_cursor_conflict");
    } finally { await app.close(); }
  }
});

test("malformed Last-Event-ID values return 400", async () => {
  for (const cursor of ["event-1", "-1", "1.5", "9007199254740992"]) {
    const app = await startServer(fakeStore([]));
    try {
      const response = await fetch(`${app.url}/api/runs/run-1/events`, { headers: { "Last-Event-ID": cursor } });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "invalid_event_cursor" });
    } finally { await app.close(); }
  }
});

test("missing Run projection returns 404", async () => {
  const app = await startServer(fakeStore([]), async () => null);
  try {
    const response = await fetch(`${app.url}/api/runs/missing/events`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "run_not_found" });
  } finally { await app.close(); }
});

test("local persistence composition resolves Runs through the SQLite adapter", async () => {
  const local = createLocalMelioraServer(":memory:");
  await new Promise<void>((resolve, reject) => {
    local.server.once("error", reject);
    local.server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const port = (local.server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/api/runs/missing/events`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "run_not_found" });
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
    const response = await fetch(`${app.url}/api/runs/run-1/events`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "event_stream_failed" });
  } finally { await app.close(); }
});

test("malformed encoded run ids return 400", async () => {
  const app = await startServer(fakeStore([]));
  try {
    const response = await fetch(`${app.url}/api/runs/%E0%A4%A/events`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_run_id" });
  } finally { await app.close(); }
});

test("projection rejects private and unknown public event kinds", () => {
  assert.throws(() => projectPublicEvent(storedEvent(1, "model.delta", "private"), "session-1"), TypeError);
  assert.throws(() => projectPublicEvent(storedEvent(1, "invented_public_kind"), "session-1"), TypeError);
});

test("projection strips payload fields outside the public contract", () => {
  const event = storedEvent(1, "assistant_text_delta");
  const projected = projectPublicEvent({ ...event, payload: { delta: "hello", rawReasoning: "secret" } }, "session-1");
  assert.deepEqual(projected.payload, { delta: "hello" });
});

test("projection removes private artifact references from nested public payloads", () => {
  const event = storedEvent(1, "tool_result_presented");
  const projected = projectPublicEvent({ ...event, payload: {
    invocationId: "invocation-1",
    status: "succeeded",
    summary: "safe summary",
    artifactRefs: [
      { artifactId: "artifact-public", visibility: "public" },
      { artifactId: "artifact-private", visibility: "private" },
    ],
  } }, "session-1");
  assert.deepEqual(projected.payload, {
    invocationId: "invocation-1",
    status: "succeeded",
    summary: "safe summary",
    artifactRefs: [{ artifactId: "artifact-public", visibility: "public" }],
  });
  assert.equal(JSON.stringify(projected).includes("artifact-private"), false);
});

test("SSE framing uses sequence ids and rejects kind line breaks", () => {
  const event = projectPublicEvent(storedEvent(1, "run_completed"), "session-1");
  assert.match(encodeSseEvent(event), /^id: 1$/mu);
  assert.throws(() => encodeSseEvent({ ...event, kind: "run_completed\nid: injected" } as unknown as PublicRunEvent), TypeError);
});
