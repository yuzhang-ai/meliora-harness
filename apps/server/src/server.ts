import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import {
  decodePublicStoredEvent,
  decodePublicRunResumeSnapshot,
  PUBLIC_RUN_RESUME_SNAPSHOT_SCHEMA_VERSION,
  type PublicRunEvent,
  type PublicRunResumeSnapshot,
} from "../../../packages/agent-runtime/index.js";
import { RunCommandContractError } from "../../../packages/session-store/run-command-contract.js";
import { canonicalJson } from "../../../packages/session-store/integrity.js";
import type { SessionStorePort, StoredEvent } from "../../../packages/session-store/contracts.js";
import type { JsonValue } from "../../../packages/model-protocol/contracts.js";
import {
  parseTurnCommandRequest,
  TURN_COMMAND_ERROR_SCHEMA_VERSION,
  type TurnCommandErrorCode,
  type TurnCommandErrorResponse,
  type TurnCommandRequest,
  type TurnCommandResponse,
} from "../api-contracts/turn-command.js";

export type TurnCommandSubmission =
  | Readonly<{ status: 200 | 202; body: TurnCommandResponse }>
  | Readonly<{ status: 400 | 404 | 409 | 503 | 500; body: TurnCommandErrorResponse }>;

export interface MelioraServerOptions {
  store: SessionStorePort;
  /** Store deliberately has no Run lookup; composition provides this projection dependency. */
  resolveSessionId: (runId: string) => Promise<string | null> | string | null;
  /** Local M0 principal resolver; non-loopback authentication remains out of scope. */
  resolveLocalPrincipalId: (runId: string) => Promise<string | null> | string | null;
  submitTurnCommand?: (request: TurnCommandRequest) => Promise<TurnCommandSubmission>;
  maxJsonBodyBytes?: number;
  pollIntervalMs?: number;
  heartbeatMs?: number;
  /** Optional local-server Host allowlist; reject DNS rebinding before any route or command work. */
  allowedHosts?: readonly string[];
}

const isTerminalPublicEvent = (event: PublicRunEvent): boolean =>
  event.kind === "run_blocked" || event.kind === "run_completed"
  || event.kind === "run_failed" || event.kind === "run_cancelled";

/** Compatibility helper; Server emission and cursor validation use the same decoder. */
export const projectPublicEvent = (event: StoredEvent, sessionId: string): PublicRunEvent => {
  const decoded = decodePublicStoredEvent(event, sessionId);
  if (decoded.kind !== "public") throw new TypeError("Stored event is not a valid PublicRunEvent.");
  return decoded.event;
};

const encodeSseField = (value: string, name: string): string => {
  if (/[\r\n]/u.test(value)) throw new TypeError(`${name} cannot contain line breaks.`);
  return value;
};

export const encodeSseEvent = (event: PublicRunEvent): string => {
  const kind = encodeSseField(event.kind, "event.kind");
  return `id: ${event.sequence}\nevent: ${kind}\ndata: ${JSON.stringify(event)}\n\n`;
};

const json = (value: unknown): string => JSON.stringify(value);
const canonicalPublicResumeJson = (snapshot: PublicRunResumeSnapshot): string => canonicalJson(snapshot as unknown as JsonValue);
const DEFAULT_MAX_JSON_BODY_BYTES = 70 * 1024;
// Thinking models can emit more than 1,000 private reasoning fragments before
// a small public terminal. Keep the scan bounded without stranding the browser.
const MAX_PUBLIC_RESUME_SOURCE_EVENTS = 5_000;
const MAX_PUBLIC_RESUME_RESPONSE_BYTES = 256 * 1024;
const PUBLIC_RESUME_PAGE_SIZE = 100;

export const writeWithBackpressure = async (response: ServerResponse, chunk: string): Promise<boolean> => {
  if (response.destroyed || response.writableEnded) return false;
  if (response.write(chunk)) return true;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (writable: boolean): void => {
      if (settled) return;
      settled = true;
      response.off("drain", onDrain);
      response.off("close", onClose);
      response.off("error", onError);
      resolve(writable);
    };
    const onDrain = (): void => finish(true);
    const onClose = (): void => finish(false);
    const onError = (): void => finish(false);
    response.once("drain", onDrain);
    response.once("close", onClose);
    response.once("error", onError);
  });
};

const writeJsonError = (response: ServerResponse, status: number, body: { error: string; message?: string }): void => {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(json(body));
};

const turnCommandErrorResponse = (code: TurnCommandErrorCode, retryable: boolean): TurnCommandErrorResponse => ({
  schemaVersion: TURN_COMMAND_ERROR_SCHEMA_VERSION,
  error: { code, retryable },
});

const writeTurnCommandSubmission = (response: ServerResponse, submission: TurnCommandSubmission): void => {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(submission.status, { "content-type": "application/json; charset=utf-8" });
  response.end(json(submission.body));
};

const turnCommandContractStatus = (
  code: TurnCommandErrorCode,
): 400 | 404 | 409 | 503 | 500 => {
  switch (code) {
    case "invalid_request":
    case "invalid_idempotency_key":
    case "user_message_empty":
    case "user_message_too_large":
    case "sensitive_input_rejected":
      return 400;
    case "invalid_workspace":
      return 404;
    case "idempotency_key_conflict":
    case "command_identity_conflict":
    case "command_status_conflict":
      return 409;
    case "service_unavailable":
      return 503;
    default:
      return 500;
  }
};

const readJsonBody = async (
  request: IncomingMessage,
  maxBytes: number,
): Promise<Readonly<{ ok: true; value: unknown }> | Readonly<{ ok: false; code: TurnCommandErrorCode }>> => {
  const contentType = Array.isArray(request.headers["content-type"])
    ? request.headers["content-type"][0]
    : request.headers["content-type"];
  if (contentType !== undefined && !/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    return { ok: false, code: "invalid_request" };
  }
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) return { ok: false, code: "invalid_request" };
    chunks.push(buffer);
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, code: "invalid_request" };
  }
};

const handleTurnCommandRequest = async (
  options: MelioraServerOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  if (!options.submitTurnCommand) {
    writeTurnCommandSubmission(response, {
      status: 503,
      body: turnCommandErrorResponse("service_unavailable", true),
    });
    return;
  }
  const parsedBody = await readJsonBody(request, options.maxJsonBodyBytes ?? DEFAULT_MAX_JSON_BODY_BYTES);
  if (!parsedBody.ok) {
    writeTurnCommandSubmission(response, {
      status: turnCommandContractStatus(parsedBody.code),
      body: turnCommandErrorResponse(parsedBody.code, false),
    });
    return;
  }
  let command: TurnCommandRequest;
  try {
    command = parseTurnCommandRequest(parsedBody.value);
  } catch (error) {
    const code = error instanceof RunCommandContractError
      ? error.code as TurnCommandErrorCode
      : "invalid_request";
    writeTurnCommandSubmission(response, {
      status: turnCommandContractStatus(code),
      body: turnCommandErrorResponse(code, false),
    });
    return;
  }
  try {
    writeTurnCommandSubmission(response, await options.submitTurnCommand(command));
  } catch {
    writeTurnCommandSubmission(response, {
      status: 500,
      body: turnCommandErrorResponse("internal_error", true),
    });
  }
};

const parseLastSequence = (header: string | undefined): number | null => {
  if (header === undefined) return 0;
  if (!/^(0|[1-9]\d*)$/u.test(header)) return null;
  const sequence = Number(header);
  return Number.isSafeInteger(sequence) ? sequence : null;
};

const decodeAndAuthorizePublicEvent = async (
  store: SessionStorePort,
  localPrincipalId: string,
  sessionId: string,
  storedEvent: StoredEvent,
): Promise<PublicRunEvent | null> => {
  const decoded = decodePublicStoredEvent(storedEvent, sessionId);
  if (decoded.kind !== "public") return null;
  // Plan evidence has no Receipt binding in this narrow slice. Do not invent
  // generic public-artifact authorization for it.
  if (decoded.event.kind === "plan_updated" && decoded.event.payload.steps.some((step) => step.evidenceRefs.length > 0)) return null;
  const authorization = await store.authorizePublicStoredEvent({ localPrincipalId, sessionId, event: storedEvent });
  return authorization.kind === "authorized" ? decoded.event : null;
};

type PublicCursorValidation =
  | Readonly<{ kind: "origin" }>
  | Readonly<{ kind: "event"; event: PublicRunEvent }>
  | Readonly<{ kind: "terminal_complete"; event: PublicRunEvent }>
  | Readonly<{ kind: "terminal_tail" }>
  | Readonly<{ kind: "invalid" }>;

/**
 * A resume cursor is not merely a number: it must name one exact event that
 * can be emitted to this principal.  For a terminal cursor, also capture a
 * fixed raw-log watermark.  A clean terminal has nothing left for an
 * EventSource reconnect to observe, while any raw tail is an integrity
 * conflict rather than something to silently skip.
 */
const validatePublicCursor = async (
  store: SessionStorePort,
  runId: string,
  localPrincipalId: string,
  sessionId: string,
  sequence: number,
): Promise<PublicCursorValidation> => {
  if (sequence === 0) return { kind: "origin" };
  const page = await store.readEventLogPage({ runId, afterSequence: sequence - 1, limit: 1 });
  if (page.kind !== "found") return { kind: "invalid" };
  const storedEvent = page.events[0];
  if (storedEvent?.sequence !== sequence) return { kind: "invalid" };
  const event = await decodeAndAuthorizePublicEvent(store, localPrincipalId, sessionId, storedEvent);
  if (event === null) return { kind: "invalid" };
  if (!isTerminalPublicEvent(event)) return { kind: "event", event };
  return page.nextSequence === null
    ? { kind: "terminal_complete", event }
    : { kind: "terminal_tail" };
};

type PublicResumeReadResult =
  | Readonly<{ kind: "found"; snapshot: PublicRunResumeSnapshot }>
  | Readonly<{ kind: "not_found" }>
  | Readonly<{ kind: "conflict" }>
  | Readonly<{ kind: "too_large" }>;

/**
 * Build a transient public projection only.  The Store fixes the raw log
 * watermark on its first page; every later page is bounded by that value.
 */
export const readPublicRunResumeSnapshot = async (
  store: SessionStorePort,
  runId: string,
  sessionId: string,
  localPrincipalId: string,
): Promise<PublicResumeReadResult> => {
  let throughSequence: number | undefined;
  let afterSequence = 0;
  let sourceEventCount = 0;
  const events: PublicRunEvent[] = [];
  let terminalSeen = false;

  for (;;) {
    const page = await store.readEventLogPage({
      runId,
      afterSequence,
      throughSequence,
      limit: PUBLIC_RESUME_PAGE_SIZE,
    });
    if (page.kind === "not_found") return { kind: "not_found" };
    if (page.kind === "conflict") return { kind: "conflict" };
    throughSequence = page.throughSequence;
    sourceEventCount += page.events.length;
    if (sourceEventCount > MAX_PUBLIC_RESUME_SOURCE_EVENTS) return { kind: "too_large" };

    // Quarantined records remain source-log gaps. They do not stop scanning,
    // enter the payload, or become a resume anchor.
    for (const storedEvent of page.events) {
      // SSE ends at the first exact public terminal event. A later raw record
      // would make a snapshot resume farther than an SSE client can ever see,
      // so fail closed rather than silently trim or advance its anchor.
      if (terminalSeen) return { kind: "conflict" };
      const event = await decodeAndAuthorizePublicEvent(store, localPrincipalId, sessionId, storedEvent);
      if (event !== null) {
        events.push(event);
        if (isTerminalPublicEvent(event)) terminalSeen = true;
      }
    }
    if (page.nextSequence === null) break;
    afterSequence = page.nextSequence;
  }

  const snapshot: PublicRunResumeSnapshot = {
    schemaVersion: PUBLIC_RUN_RESUME_SNAPSHOT_SCHEMA_VERSION,
    sessionId,
    runId,
    throughSequence: throughSequence ?? 0,
    resumePoint: events.length === 0 ? { kind: "origin" } : { kind: "public_event", event: events.at(-1)! },
    events,
  };
  // The response has a fixed, canonical field order.  Do this only after the
  // complete read so an oversized projection never leaks a partial page.
  if (Buffer.byteLength(canonicalPublicResumeJson(snapshot), "utf8") > MAX_PUBLIC_RESUME_RESPONSE_BYTES) return { kind: "too_large" };
  const validated = decodePublicRunResumeSnapshot(snapshot);
  return validated === null ? { kind: "conflict" } : { kind: "found", snapshot: validated };
};

const handleRequest = async (options: MelioraServerOptions, request: IncomingMessage, response: ServerResponse): Promise<void> => {
  if (options.allowedHosts && !options.allowedHosts.includes(request.headers.host?.toLowerCase() ?? "")) {
    writeJsonError(response, 403, { error: "forbidden_host" });
    return;
  }
  const pollIntervalMs = options.pollIntervalMs ?? 100;
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/api/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(json({ ok: true }));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/turns") {
    await handleTurnCommandRequest(options, request, response);
    return;
  }
  const runResume = /^\/api\/runs\/([^/]+)\/resume$/u.exec(url.pathname);
  const runEvents = /^\/api\/runs\/([^/]+)\/events$/u.exec(url.pathname);
  if (request.method !== "GET" || (!runResume && !runEvents)) {
    writeJsonError(response, 404, { error: "not_found" });
    return;
  }

  let runId: string;
  try { runId = decodeURIComponent((runResume ?? runEvents)![1]!); }
  catch { writeJsonError(response, 400, { error: "invalid_run_id" }); return; }

  if (runResume) {
    // This endpoint is a read-only public projection, not a cacheable private
    // recovery snapshot. Set it before any outcome, including safe failures.
    response.setHeader("cache-control", "no-store");
    const sessionId = await options.resolveSessionId(runId);
    const localPrincipalId = await options.resolveLocalPrincipalId(runId);
    if (sessionId === null || localPrincipalId === null) {
      writeJsonError(response, 404, { error: "run_not_found" });
      return;
    }
    let result: PublicResumeReadResult;
    try {
      result = await readPublicRunResumeSnapshot(options.store, runId, sessionId, localPrincipalId);
    } catch {
      writeJsonError(response, 500, { error: "resume_snapshot_failed" });
      return;
    }
    if (result.kind === "not_found") {
      writeJsonError(response, 404, { error: "run_not_found" });
      return;
    }
    if (result.kind === "conflict") {
      writeJsonError(response, 409, { error: "resume_snapshot_conflict" });
      return;
    }
    if (result.kind === "too_large") {
      writeJsonError(response, 413, { error: "resume_snapshot_too_large" });
      return;
    }
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(canonicalPublicResumeJson(result.snapshot));
    return;
  }

  const header = request.headers["last-event-id"];
  const lastSequence = parseLastSequence(Array.isArray(header) ? header[0] : header);
  if (lastSequence === null) {
    writeJsonError(response, 400, { error: "invalid_event_cursor" });
    return;
  }
  const sessionId = await options.resolveSessionId(runId);
  const localPrincipalId = await options.resolveLocalPrincipalId(runId);
  if (sessionId === null || localPrincipalId === null) {
    writeJsonError(response, 404, { error: "run_not_found" });
    return;
  }
  const cursorValidation = await validatePublicCursor(options.store, runId, localPrincipalId, sessionId, lastSequence);
  if (cursorValidation.kind === "invalid" || cursorValidation.kind === "terminal_tail") {
    writeJsonError(response, 409, {
      error: "event_cursor_conflict",
      message: "Last-Event-ID is unavailable or is not a public event sequence.",
    });
    return;
  }
  // A native EventSource reconnects after a terminal close with the last
  // delivered id.  There is no new public event to stream in a complete fixed
  // raw view, so explicitly end the protocol without a body or heartbeat.
  if (cursorValidation.kind === "terminal_complete") {
    response.writeHead(204, { "cache-control": "no-store" });
    response.end();
    return;
  }

  // Perform the first read before committing SSE headers so adapter failures
  // can still be represented as a structured HTTP error.
  const initialPage = await options.store.readEvents({ runId, afterSequence: lastSequence, limit: 500 });

  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  response.flushHeaders();

  let cursor = lastSequence;
  let lastHeartbeatAt = Date.now();
  let closed = false;
  let polling = false;
  let timer: NodeJS.Timeout | undefined;
  const stop = (endResponse: boolean): void => {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    if (endResponse && !response.destroyed && !response.writableEnded) response.end();
  };
  const emitEvents = async (events: readonly StoredEvent[]): Promise<void> => {
    for (const storedEvent of events) {
      cursor = storedEvent.sequence;
      const event = await decodeAndAuthorizePublicEvent(options.store, localPrincipalId, sessionId, storedEvent);
      if (event === null) continue;
      if (!(await writeWithBackpressure(response, encodeSseEvent(event)))) { stop(false); return; }
      if (isTerminalPublicEvent(event)) { stop(true); return; }
    }
  };
  const poll = async (): Promise<void> => {
    if (closed || polling) return;
    polling = true;
    try {
      const page = await options.store.readEvents({ runId, afterSequence: cursor, limit: 500 });
      await emitEvents(page.events);
      if (closed) return;
      if (Date.now() - lastHeartbeatAt >= heartbeatMs) {
        if (!(await writeWithBackpressure(response, ": heartbeat\n\n"))) { stop(false); return; }
        lastHeartbeatAt = Date.now();
      }
    } catch {
      // Once SSE headers are sent, a structured HTTP error is no longer possible.
      stop(true);
    } finally { polling = false; }
  };
  response.on("close", () => stop(false));
  await emitEvents(initialPage.events);
  if (!closed) timer = setInterval(() => void poll(), pollIntervalMs);
};

export const createMelioraServer = (options: MelioraServerOptions): Server =>
  createServer((request, response) => {
    void handleRequest(options, request, response).catch(() => {
      if (!response.headersSent) { writeJsonError(response, 500, { error: "event_stream_failed" }); return; }
      if (!response.destroyed && !response.writableEnded) response.end();
    });
  });
