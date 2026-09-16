import { validatePublicRunEvent } from "../../../packages/agent-runtime/public-event-decoder";
import type { PublicRunEvent } from "../../../packages/agent-runtime/public-events";
import {
  decodeTurnCommandErrorResponse,
  decodeTurnCommandResponse,
  TURN_COMMAND_REQUEST_SCHEMA_VERSION,
  type TurnCommandRequest,
  type TurnCommandResponse,
} from "../../../packages/agent-runtime/turn-command-wire";
import {
  decodePublicRunResumeSnapshot,
  type PublicRunResumeSnapshot,
} from "../../../packages/agent-runtime/public-run-resume-snapshot";
import {
  initialLiveRunState,
  isTerminalPublicEvent,
  reduceLiveRun,
  type LiveRunState,
} from "./live-state";

export { TURN_COMMAND_REQUEST_SCHEMA_VERSION, type TurnCommandRequest, type TurnCommandResponse };

export class LiveAdapterError extends Error {
  constructor(public readonly code: string, public readonly status: number | null = null) {
    super(code);
    this.name = "LiveAdapterError";
  }
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const MAX_JSON_RESPONSE_BYTES = 512 * 1024;
const MAX_SSE_FRAME_BYTES = 512 * 1024;

async function readBoundedText(response: Response, maxBytes = MAX_JSON_RESPONSE_BYTES): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let total = 0;
  let text = "";
  let complete = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) { complete = true; break; }
      total += chunk.value.byteLength;
      if (total > maxBytes) throw new LiveAdapterError("http_response_too_large", response.status);
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch (error) {
    if (error instanceof LiveAdapterError) throw error;
    throw new LiveAdapterError("invalid_json_response", response.status);
  } finally {
    if (!complete) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function readBoundedJson(response: Response, invalidCode: string): Promise<unknown> {
  try { return JSON.parse(await readBoundedText(response)) as unknown; }
  catch (error) {
    if (error instanceof LiveAdapterError && error.code === "http_response_too_large") throw error;
    throw new LiveAdapterError(invalidCode, response.status);
  }
}

async function safeErrorCode(response: Response, fallback: string, allowCursorConflict = false): Promise<string> {
  try {
    const value = await readBoundedJson(response, fallback);
    const turnError = decodeTurnCommandErrorResponse(value);
    if (turnError) return turnError.error.code;
    if (allowCursorConflict && response.status === 409
      && typeof value === "object" && value !== null && !Array.isArray(value)
      && Object.keys(value).length === 1 && (value as { error?: unknown }).error === "event_cursor_conflict") {
      return "event_cursor_conflict";
    }
  } catch { /* fixed safe fallback */ }
  return fallback;
}

const endpoint = (baseUrl: string, path: string): string => `${baseUrl.replace(/\/$/u, "")}${path}`;

const trustedBaseUrl = (baseUrl: string): string => {
  const browserOrigin = typeof window === "undefined" ? null : window.location.origin;
  const candidate = baseUrl || browserOrigin;
  if (!candidate) throw new LiveAdapterError("untrusted_base_url");
  let parsed: URL;
  try { parsed = new URL(candidate); }
  catch { throw new LiveAdapterError("untrusted_base_url"); }
  const loopback = parsed.protocol === "http:"
    && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(parsed.hostname);
  if (!loopback && (!browserOrigin || parsed.origin !== browserOrigin)) throw new LiveAdapterError("untrusted_base_url");
  return parsed.href.replace(/\/$/u, "");
};

const sameJsonValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length && left.every((value, index) => sameJsonValue(value, right[index]));
  }
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameJsonValue(leftRecord[key], rightRecord[key]));
};

type ParsedSseEvent = Readonly<{ id: string; event: string; data: string }>;

async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<ParsedSseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let id = "";
  let event = "";
  let data: string[] = [];
  const encoder = new TextEncoder();
  let frameBytes = 0;
  let complete = false;
  const consumeLine = (line: string, encodedBytes = encoder.encode(line).byteLength + 1): ParsedSseEvent | null => {
    frameBytes += encodedBytes;
    if (frameBytes > MAX_SSE_FRAME_BYTES) throw new LiveAdapterError("sse_event_too_large");
    if (line === "") {
      if (data.length === 0) { id = ""; event = ""; frameBytes = 0; return null; }
      const parsed = { id, event, data: data.join("\n") };
      id = ""; event = ""; data = []; frameBytes = 0;
      return parsed;
    }
    if (line.startsWith(":")) return null;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /u, "");
    if (field === "id") id = value;
    else if (field === "event") event = value;
    else if (field === "data") data.push(value);
    return null;
  };
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const rawLine = buffer.slice(0, newline);
        const line = rawLine.replace(/\r$/u, "");
        buffer = buffer.slice(newline + 1);
        const parsed = consumeLine(line, encoder.encode(rawLine).byteLength + 1);
        if (parsed) yield parsed;
      }
      if (encoder.encode(buffer).byteLength + frameBytes > MAX_SSE_FRAME_BYTES) throw new LiveAdapterError("sse_event_too_large");
      if (chunk.done) { complete = true; break; }
    }
    if (buffer.length > 0) {
      const parsed = consumeLine(buffer.replace(/\r$/u, ""), encoder.encode(buffer).byteLength);
      if (parsed) yield parsed;
    }
    const trailing = consumeLine("");
    if (trailing) yield trailing;
  } finally {
    if (!complete) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export type StreamResult = "closed" | "terminal";

export class WebLiveAdapter {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly fetcher: FetchLike = fetch) {
    this.baseUrl = trustedBaseUrl(baseUrl);
  }

  async submit(request: TurnCommandRequest, signal?: AbortSignal): Promise<TurnCommandResponse> {
    const response = await this.fetcher(endpoint(this.baseUrl, "/api/turns"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    if (response.status !== 200 && response.status !== 202) {
      throw new LiveAdapterError(await safeErrorCode(response, "turn_command_failed"), response.status);
    }
    const value = await readBoundedJson(response, "invalid_turn_response");
    const decoded = decodeTurnCommandResponse(value);
    if (!decoded) throw new LiveAdapterError("invalid_turn_response", response.status);
    return decoded;
  }

  async resume(runId: string, signal?: AbortSignal): Promise<PublicRunResumeSnapshot> {
    const response = await this.fetcher(endpoint(this.baseUrl, `/api/runs/${encodeURIComponent(runId)}/resume`), {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal,
    });
    if (!response.ok) throw new LiveAdapterError(await safeErrorCode(response, "resume_failed"), response.status);
    const value = await readBoundedJson(response, "invalid_resume_snapshot");
    const snapshot = decodePublicRunResumeSnapshot(value);
    if (!snapshot || snapshot.runId !== runId) throw new LiveAdapterError("invalid_resume_snapshot", response.status);
    return snapshot;
  }

  async stream(
    identity: Readonly<{ sessionId: string; runId: string }>,
    afterEvent: PublicRunEvent | null,
    onEvent: (event: PublicRunEvent) => void,
    signal?: AbortSignal,
  ): Promise<StreamResult> {
    const headers: Record<string, string> = { accept: "text/event-stream", "cache-control": "no-cache" };
    const afterSequence = afterEvent?.sequence ?? 0;
    if (afterSequence > 0) headers["last-event-id"] = String(afterSequence);
    const response = await this.fetcher(endpoint(this.baseUrl, `/api/runs/${encodeURIComponent(identity.runId)}/events`), {
      method: "GET", headers, cache: "no-store", signal,
    });
    if (response.status === 204) return "terminal";
    if (!response.ok) throw new LiveAdapterError(await safeErrorCode(response, "event_stream_failed", true), response.status);
    if (!response.body || !response.headers.get("content-type")?.toLowerCase().startsWith("text/event-stream")) {
      throw new LiveAdapterError("invalid_event_stream", response.status);
    }
    let cursor = afterSequence;
    let cursorEvent = afterEvent;
    for await (const frame of parseSse(response.body)) {
      let value: unknown;
      try { value = JSON.parse(frame.data); }
      catch { throw new LiveAdapterError("invalid_public_event", response.status); }
      const event = validatePublicRunEvent(value);
      if (!event || event.runId !== identity.runId || event.sessionId !== identity.sessionId
        || frame.id !== String(event.sequence) || (frame.event !== "" && frame.event !== event.kind)
        || event.sequence < cursor) throw new LiveAdapterError("invalid_public_event", response.status);
      if (event.sequence === cursor) {
        if (!cursorEvent || !sameJsonValue(cursorEvent, event)) throw new LiveAdapterError("invalid_public_event", response.status);
        continue;
      }
      cursor = event.sequence;
      cursorEvent = event;
      onEvent(event);
      if (isTerminalPublicEvent(event)) return "terminal";
    }
    return "closed";
  }
}

export class LiveRunController {
  state: LiveRunState = initialLiveRunState();
  constructor(private readonly adapter: WebLiveAdapter) {}

  private dispatch(action: Parameters<typeof reduceLiveRun>[1]): void {
    this.state = reduceLiveRun(this.state, action);
  }

  private async consume(signal?: AbortSignal): Promise<void> {
    const identity = this.state.identity;
    if (!identity) throw new LiveAdapterError("missing_run_identity");
    this.dispatch({ type: "stream_opened" });
    const result = await this.adapter.stream(identity, this.state.events.at(-1) ?? null, (event) => this.dispatch({ type: "event_received", event }), signal);
    if (result === "terminal" && this.state.phase !== "terminal") {
      this.dispatch({ type: "resume_requested", runId: identity.runId });
      const snapshot = await this.adapter.resume(identity.runId, signal);
      this.dispatch({ type: "resume_loaded", snapshot });
      const terminal = snapshot.events.at(-1);
      if (!terminal || !isTerminalPublicEvent(terminal)) throw new LiveAdapterError("terminal_cursor_without_terminal_event");
    }
    this.dispatch({ type: "stream_closed" });
  }

  async start(request: TurnCommandRequest, signal?: AbortSignal): Promise<LiveRunState> {
    this.dispatch({ type: "submit_requested" });
    try {
      const response = await this.adapter.submit(request, signal);
      this.dispatch({ type: "command_accepted", identity: { sessionId: response.sessionId, runId: response.runId } });
      if (response.commandStatus === "terminal") {
        const snapshot = await this.adapter.resume(response.runId, signal);
        this.dispatch({ type: "resume_loaded", snapshot });
      } else await this.consume(signal);
    } catch (error) {
      this.dispatch({ type: "failed", code: error instanceof LiveAdapterError ? error.code : "live_adapter_failed" });
    }
    return this.state;
  }

  async restore(runId: string, signal?: AbortSignal): Promise<LiveRunState> {
    this.dispatch({ type: "resume_requested", runId });
    try {
      const snapshot = await this.adapter.resume(runId, signal);
      this.dispatch({ type: "resume_loaded", snapshot });
      if (this.state.phase !== "terminal") await this.consume(signal);
    } catch (error) {
      this.dispatch({ type: "failed", code: error instanceof LiveAdapterError ? error.code : "live_adapter_failed" });
    }
    return this.state;
  }

  async reconnect(signal?: AbortSignal): Promise<LiveRunState> {
    const runId = this.state.identity?.runId;
    if (!runId) throw new LiveAdapterError("missing_run_identity");
    this.dispatch({ type: "reconnect_requested" });
    try {
      await this.consume(signal);
    } catch (error) {
      if (error instanceof LiveAdapterError && error.code === "event_cursor_conflict") {
        try {
          this.dispatch({ type: "resume_requested", runId });
          const snapshot = await this.adapter.resume(runId, signal);
          this.dispatch({ type: "resume_loaded", snapshot });
          if (this.state.phase !== "terminal") await this.consume(signal);
        } catch (fallbackError) {
          this.dispatch({ type: "failed", code: fallbackError instanceof LiveAdapterError ? fallbackError.code : "live_adapter_failed" });
        }
      } else this.dispatch({ type: "failed", code: error instanceof LiveAdapterError ? error.code : "live_adapter_failed" });
    }
    return this.state;
  }
}
