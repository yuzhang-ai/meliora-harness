import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { PUBLIC_RUN_EVENT_SCHEMA_VERSION, type PublicRunEvent } from "../../../packages/agent-runtime/public-events.js";
import type { JsonObject } from "../../../packages/model-protocol/contracts.js";
import { RunCommandContractError } from "../../../packages/session-store/run-command-contract.js";
import type { SessionStorePort, StoredEvent } from "../../../packages/session-store/contracts.js";
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
  submitTurnCommand?: (request: TurnCommandRequest) => Promise<TurnCommandSubmission>;
  maxJsonBodyBytes?: number;
  pollIntervalMs?: number;
  heartbeatMs?: number;
  isTerminalEvent?: (event: PublicRunEvent) => boolean;
}

const PUBLIC_EVENT_KINDS = new Set<PublicRunEvent["kind"]>([
  "run_status_changed", "assistant_text_delta", "plan_updated", "tool_call_presented",
  "approval_requested", "tool_result_presented", "context_compacted", "verification_updated",
  "run_blocked", "run_completed", "run_failed", "run_cancelled",
]);

const isTerminalPublicEvent = (event: PublicRunEvent): boolean =>
  event.kind === "run_blocked" || event.kind === "run_completed"
  || event.kind === "run_failed" || event.kind === "run_cancelled";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pick = (source: Record<string, unknown>, keys: readonly string[]): JsonObject =>
  Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]])) as JsonObject;

/** Strip fields that are not part of the frozen payload for the selected kind. */
const projectPayload = (kind: PublicRunEvent["kind"], payload: unknown): JsonObject => {
  if (!isRecord(payload)) throw new TypeError(`Public event ${kind} payload must be an object.`);
  if (kind === "plan_updated" && Array.isArray(payload.steps)) {
    return {
      steps: payload.steps.filter(isRecord).map((step) => ({
        ...pick(step, ["id", "title", "status"]),
        evidenceRefs: Array.isArray(step.evidenceRefs)
          ? step.evidenceRefs
              .filter((ref): ref is Record<string, unknown> => isRecord(ref) && ref.visibility === "public")
              .map((ref) => pick(ref, ["artifactId", "visibility"]))
          : [],
      })),
    } as JsonObject;
  }
  if (kind === "tool_result_presented") {
    return {
      ...pick(payload, ["invocationId", "status", "summary"]),
      artifactRefs: Array.isArray(payload.artifactRefs)
        ? payload.artifactRefs
            .filter((ref): ref is Record<string, unknown> => isRecord(ref) && ref.visibility === "public")
            .map((ref) => pick(ref, ["artifactId", "visibility"]))
        : [],
    } as JsonObject;
  }
  if (kind === "verification_updated") {
    return {
      ...pick(payload, ["verificationId", "status"]),
      evidenceRefs: Array.isArray(payload.evidenceRefs)
        ? payload.evidenceRefs
            .filter((ref): ref is Record<string, unknown> => isRecord(ref) && ref.visibility === "public")
            .map((ref) => pick(ref, ["artifactId", "visibility"]))
        : [],
    } as JsonObject;
  }
  const keys: Record<Exclude<PublicRunEvent["kind"], "plan_updated" | "tool_result_presented" | "verification_updated">, readonly string[]> = {
    run_status_changed: ["status", "reason"],
    assistant_text_delta: ["delta"],
    tool_call_presented: ["invocationId", "toolName", "risk", "summary"],
    approval_requested: ["approvalId", "invocationId", "argumentsHash", "summary", "expiresAt"],
    context_compacted: ["checkpointId", "summary"],
    run_blocked: ["code", "message", "userActions"],
    run_completed: ["outcomeId", "summary"],
    run_failed: ["code", "retryable", "message"],
    run_cancelled: ["reason"],
  };
  return pick(payload, keys[kind as keyof typeof keys]);
};

/** Convert a persisted public event into the frozen browser-facing contract. */
export const projectPublicEvent = (event: StoredEvent, sessionId: string): PublicRunEvent => {
  if (event.visibility !== "public" || !PUBLIC_EVENT_KINDS.has(event.kind as PublicRunEvent["kind"])) {
    throw new TypeError(`Stored event ${event.eventId} is not a PublicRunEvent.`);
  }
  return {
    schemaVersion: PUBLIC_RUN_EVENT_SCHEMA_VERSION,
    eventId: event.eventId,
    sessionId,
    runId: event.runId,
    sequence: event.sequence,
    timestamp: event.createdAt,
    visibility: "public",
    kind: event.kind,
    payload: projectPayload(event.kind as PublicRunEvent["kind"], event.payload),
  } as PublicRunEvent;
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
const DEFAULT_MAX_JSON_BODY_BYTES = 70 * 1024;

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

const validatePublicCursor = async (store: SessionStorePort, runId: string, sequence: number): Promise<boolean> => {
  if (sequence === 0) return true;
  const page = await store.readEvents({ runId, afterSequence: sequence - 1, limit: 1 });
  const event = page.events[0];
  return event?.sequence === sequence && event.visibility === "public";
};

const handleRequest = async (options: MelioraServerOptions, request: IncomingMessage, response: ServerResponse): Promise<void> => {
  const pollIntervalMs = options.pollIntervalMs ?? 100;
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const isTerminalEvent = options.isTerminalEvent ?? isTerminalPublicEvent;
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
  const runEvents = /^\/api\/runs\/([^/]+)\/events$/u.exec(url.pathname);
  if (request.method !== "GET" || !runEvents) {
    writeJsonError(response, 404, { error: "not_found" });
    return;
  }

  let runId: string;
  try { runId = decodeURIComponent(runEvents[1]!); }
  catch { writeJsonError(response, 400, { error: "invalid_run_id" }); return; }

  const header = request.headers["last-event-id"];
  const lastSequence = parseLastSequence(Array.isArray(header) ? header[0] : header);
  if (lastSequence === null) {
    writeJsonError(response, 400, { error: "invalid_event_cursor" });
    return;
  }
  const sessionId = await options.resolveSessionId(runId);
  if (sessionId === null) {
    writeJsonError(response, 404, { error: "run_not_found" });
    return;
  }
  if (!(await validatePublicCursor(options.store, runId, lastSequence))) {
    writeJsonError(response, 409, {
      error: "event_cursor_conflict",
      message: "Last-Event-ID is unavailable or is not a public event sequence.",
    });
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
      if (storedEvent.visibility !== "public") continue;
      let event: PublicRunEvent;
      try {
        event = projectPublicEvent(storedEvent, sessionId);
      } catch (error) {
        if (error instanceof TypeError) {
          // Quarantine an invalid persisted public event without pinning the
          // stream cursor. A later valid event must remain reachable.
          continue;
        }
        throw error;
      }
      if (!(await writeWithBackpressure(response, encodeSseEvent(event)))) { stop(false); return; }
      if (isTerminalEvent(event)) { stop(true); return; }
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
