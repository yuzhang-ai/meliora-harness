import test from "node:test";
import assert from "node:assert/strict";

import { publicRunEventReplays } from "../../../fixtures/contracts/v1/public-run-event-replays";
import type { PublicRunEvent } from "../../../packages/agent-runtime/public-events";
import { PUBLIC_RUN_RESUME_SNAPSHOT_SCHEMA_VERSION, type PublicRunResumeSnapshot } from "../../../packages/agent-runtime/public-run-resume-snapshot";
import {
  LiveAdapterError,
  LiveRunController,
  TURN_COMMAND_REQUEST_SCHEMA_VERSION,
  WebLiveAdapter,
  type TurnCommandRequest,
} from "../src/live-adapter";

const source = publicRunEventReplays["read-only-success"].events;
const identity = { sessionId: source[0]!.sessionId, runId: source[0]!.runId };
const baseUrl = "http://127.0.0.1:8787";
const request: TurnCommandRequest = {
  schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
  workspaceId: "workspace-fixture",
  idempotencyKey: "web-live-adapter-1",
  message: "检查工作区",
};
const command = {
  schemaVersion: "meliora.turn-command-response.v1",
  disposition: "created",
  sessionId: identity.sessionId,
  turnId: "turn-live",
  runId: identity.runId,
  attemptId: "attempt-live",
  commandStatus: "reserved",
} as const;

const snapshot = (events: readonly PublicRunEvent[]): PublicRunResumeSnapshot => ({
  schemaVersion: PUBLIC_RUN_RESUME_SNAPSHOT_SCHEMA_VERSION,
  sessionId: identity.sessionId,
  runId: identity.runId,
  throughSequence: events.at(-1)?.sequence ?? 0,
  resumePoint: events.length === 0 ? { kind: "origin" } : { kind: "public_event", event: events.at(-1)! },
  events,
});

const sse = (events: readonly PublicRunEvent[]): string => events.map((event) =>
  `id: ${event.sequence}\nevent: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`).join("");

test("adapter accepts loopback transport and rejects untrusted origins", () => {
  assert.doesNotThrow(() => new WebLiveAdapter(baseUrl));
  assert.throws(() => new WebLiveAdapter("https://untrusted.example"),
    (error) => error instanceof LiveAdapterError && error.code === "untrusted_base_url");
});

test("submit uses the frozen browser command shape once", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const adapter = new WebLiveAdapter(`${baseUrl}/`, async (input, init) => {
    calls.push({ url: String(input), init });
    return Response.json(command, { status: 202 });
  });
  assert.deepEqual(await adapter.submit(request), command);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, `${baseUrl}/api/turns`);
  assert.equal(calls[0]!.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), request);
});

test("resume is read-only and rejects malformed public snapshots", async () => {
  const methods: string[] = [];
  const good = new WebLiveAdapter(baseUrl, async (_input, init) => {
    methods.push(init?.method ?? "GET");
    return Response.json(snapshot(source.slice(0, 2)), { status: 200, headers: { "cache-control": "no-store" } });
  });
  assert.equal((await good.resume(identity.runId)).events.length, 2);
  assert.deepEqual(methods, ["GET"]);

  const bad = new WebLiveAdapter(baseUrl, async () => Response.json({ runId: identity.runId }, { status: 200 }));
  await assert.rejects(() => bad.resume(identity.runId), (error) => error instanceof LiveAdapterError && error.code === "invalid_resume_snapshot");
});

test("SSE sends Last-Event-ID and validates frame identity before delivery", async () => {
  const delivered: PublicRunEvent[] = [];
  let observedHeaders: HeadersInit | undefined;
  const suffix = source.slice(2);
  const adapter = new WebLiveAdapter(baseUrl, async (_input, init) => {
    observedHeaders = init?.headers;
    return new Response(sse(suffix), { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } });
  });
  assert.equal(await adapter.stream(identity, source[1]!, (event) => delivered.push(event)), "terminal");
  assert.equal(new Headers(observedHeaders).get("last-event-id"), String(source[1]!.sequence));
  assert.deepEqual(delivered, suffix);

  const invalid = new WebLiveAdapter(baseUrl, async () => new Response(
    `id: 999\nevent: ${source[2]!.kind}\ndata: ${JSON.stringify(source[2])}\n\n`,
    { status: 200, headers: { "content-type": "text/event-stream" } },
  ));
  await assert.rejects(() => invalid.stream(identity, source[1]!, () => undefined), (error) => error instanceof LiveAdapterError && error.code === "invalid_public_event");
});

test("SSE ignores an identical cursor replay, rejects drift, and continues to terminal", async () => {
  const delivered: PublicRunEvent[] = [];
  const replay = new WebLiveAdapter(baseUrl, async () => new Response(
    sse(source.slice(1)),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  ));
  assert.equal(await replay.stream(identity, source[1]!, (event) => delivered.push(event)), "terminal");
  assert.deepEqual(delivered, source.slice(2));

  const changed = { ...source[1]!, timestamp: "2099-01-01T00:00:00.000Z" };
  const drift = new WebLiveAdapter(baseUrl, async () => new Response(
    sse([changed]),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  ));
  await assert.rejects(() => drift.stream(identity, source[1]!, () => undefined),
    (error) => error instanceof LiveAdapterError && error.code === "invalid_public_event");
});

test("terminal 204 is confirmed by one read-only resume and never POSTs", async () => {
  const methods: string[] = [];
  let resumeCalls = 0;
  const adapter = new WebLiveAdapter(baseUrl, async (input, init) => {
    methods.push(init?.method ?? "GET");
    if (String(input).endsWith("/resume")) {
      resumeCalls += 1;
      return Response.json(snapshot(resumeCalls === 1 ? source.slice(0, 1) : source), { status: 200 });
    }
    return new Response(null, { status: 204 });
  });
  const state = await new LiveRunController(adapter).restore(identity.runId);
  assert.equal(state.phase, "terminal");
  assert.deepEqual(methods, ["GET", "GET", "GET"]);
  assert.equal(methods.includes("POST"), false);
});

test("SSE enforces the UTF-8 byte cap across many short data lines", async () => {
  const oversized = `${"data: x\n".repeat(70_000)}\n`;
  const adapter = new WebLiveAdapter(baseUrl, async () => new Response(
    oversized,
    { status: 200, headers: { "content-type": "text/event-stream" } },
  ));
  await assert.rejects(() => adapter.stream(identity, null, () => undefined),
    (error) => error instanceof LiveAdapterError && error.code === "sse_event_too_large");

  const longValidStream = new WebLiveAdapter(baseUrl, async () => new Response(
    `${sse(Array.from({ length: 3_000 }, () => source[0]!))}${sse(source.slice(1))}`,
    { status: 200, headers: { "content-type": "text/event-stream" } },
  ));
  const delivered: PublicRunEvent[] = [];
  assert.equal(await longValidStream.stream(identity, source[0]!, (event) => delivered.push(event)), "terminal");
  assert.deepEqual(delivered, source.slice(1));
});

test("HTTP JSON bodies are bounded and arbitrary server error strings never enter state", async () => {
  const huge = JSON.stringify({ padding: "x".repeat(512 * 1024) });
  const oversized = new WebLiveAdapter(baseUrl, async () => new Response(huge, {
    status: 200, headers: { "content-type": "application/json" },
  }));
  await assert.rejects(() => oversized.resume(identity.runId),
    (error) => error instanceof LiveAdapterError && error.code === "http_response_too_large");

  const hostile = new WebLiveAdapter(baseUrl, async () => Response.json(
    { error: "raw_database_secret" }, { status: 500 },
  ));
  await assert.rejects(() => hostile.resume(identity.runId),
    (error) => error instanceof LiveAdapterError && error.code === "resume_failed");

  const fakeConflict = new WebLiveAdapter(baseUrl, async () => Response.json(
    { error: "event_cursor_conflict" }, { status: 500 },
  ));
  await assert.rejects(() => fakeConflict.stream(identity, null, () => undefined),
    (error) => error instanceof LiveAdapterError && error.code === "event_stream_failed");
});

test("refresh uses resume and reconnect continues from cursor without another POST", async () => {
  const calls: Array<{ method: string; url: string }> = [];
  let streamCalls = 0;
  const adapter = new WebLiveAdapter(baseUrl, async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url });
    if (url.endsWith("/resume")) {
      return Response.json(snapshot([]), { status: 200 });
    }
    if (url.endsWith("/events")) {
      streamCalls += 1;
      const events = streamCalls === 1 ? source.slice(0, 1) : source.slice(1);
      return new Response(sse(events), { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    throw new Error(`unexpected ${method} ${url}`);
  });
  const controller = new LiveRunController(adapter);
  const restored = await controller.restore(identity.runId);
  assert.equal(restored.phase, "disconnected");
  const reconnected = await controller.reconnect();
  assert.equal(reconnected.phase, "terminal");
  assert.equal(reconnected.reconnectCount, 1);
  assert.equal(calls.some((call) => call.method === "POST"), false);
  assert.deepEqual(calls.map((call) => call.url.endsWith("/resume") ? "resume" : "events"), ["resume", "events", "events"]);
});

test("cursor conflict falls back to public resume snapshot and never POSTs", async () => {
  const calls: string[] = [];
  let eventCalls = 0;
  let resumeCalls = 0;
  const adapter = new WebLiveAdapter(baseUrl, async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.endsWith("/resume")) {
      resumeCalls += 1;
      return Response.json(snapshot(resumeCalls === 1 ? [] : source.slice(0, 1)), { status: 200 });
    }
    eventCalls += 1;
    if (eventCalls === 1) return new Response(sse(source.slice(0, 1)), { status: 200, headers: { "content-type": "text/event-stream" } });
    if (eventCalls === 2) return Response.json({ error: "event_cursor_conflict" }, { status: 409 });
    return new Response(sse(source.slice(1)), { status: 200, headers: { "content-type": "text/event-stream" } });
  });
  const controller = new LiveRunController(adapter);
  assert.equal((await controller.restore(identity.runId)).phase, "disconnected");
  const recovered = await controller.reconnect();
  assert.equal(recovered.phase, "terminal");
  assert.equal(recovered.reconnectCount, 1);
  assert.equal(calls.some((call) => call.startsWith("POST ")), false);
  assert.deepEqual(calls.map((call) => call.endsWith("/resume") ? "resume" : "events"), ["resume", "events", "events", "resume", "events"]);
});

test("a new turn POSTs once and follows only its returned run", async () => {
  const methods: string[] = [];
  const adapter = new WebLiveAdapter(baseUrl, async (input, init) => {
    methods.push(init?.method ?? "GET");
    if (String(input).endsWith("/api/turns")) return Response.json(command, { status: 202 });
    return new Response(sse(source), { status: 200, headers: { "content-type": "text/event-stream" } });
  });
  const state = await new LiveRunController(adapter).start(request);
  assert.equal(state.phase, "terminal");
  assert.deepEqual(methods, ["POST", "GET"]);
});
