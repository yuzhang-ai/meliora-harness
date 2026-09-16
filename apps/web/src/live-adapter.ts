import { validatePublicRunEvent } from "../../../packages/agent-runtime/public-event-decoder";
import type { PublicRunEvent } from "../../../packages/agent-runtime/public-events";
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

export const TURN_COMMAND_REQUEST_SCHEMA_VERSION = "meliora.turn-command-request.v1" as const;
const TURN_COMMAND_RESPONSE_SCHEMA_VERSION = "meliora.turn-command-response.v1" as const;

export type TurnCommandRequest = Readonly<{
  schemaVersion: typeof TURN_COMMAND_REQUEST_SCHEMA_VERSION;
  workspaceId: string;
  idempotencyKey: string;
  message: string;
}>;

export type TurnCommandResponse = Readonly<{
  schemaVersion: typeof TURN_COMMAND_RESPONSE_SCHEMA_VERSION;
  disposition: "created" | "replay";
  sessionId: string;
  turnId: string;
  runId: string;
  attemptId: string;
  commandStatus: "reserved" | "accepted" | "dispatched" | "terminal";
  terminalStatus?: "completed" | "blocked" | "failed" | "cancelled";
  terminalCode?: string;
}>;

export class LiveAdapterError extends Error {
  constructor(public readonly code: string, public readonly status: number | null = null) {
    super(code);
    this.name = "LiveAdapterError";
  }
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

function decodeTurnCommandResponse(value: unknown): TurnCommandResponse | null {
  if (!isRecord(value) || value.schemaVersion !== TURN_COMMAND_RESPONSE_SCHEMA_VERSION
    || !["created", "replay"].includes(String(value.disposition))
    || !isNonEmptyString(value.sessionId) || !isNonEmptyString(value.turnId)
    || !isNonEmptyString(value.runId) || !isNonEmptyString(value.attemptId)
    || !["reserved", "accepted", "dispatched", "terminal"].includes(String(value.commandStatus))) return null;
  if (value.commandStatus === "terminal") {
    if (!["completed", "blocked", "failed", "cancelled"].includes(String(value.terminalStatus))) return null;
  } else if (value.terminalStatus !== undefined || value.terminalCode !== undefined) return null;
  if (value.terminalCode !== undefined && typeof value.terminalCode !== "string") return null;
  const allowed = new Set(["schemaVersion", "disposition", "sessionId", "turnId", "runId", "attemptId", "commandStatus", "terminalStatus", "terminalCode"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  return value as TurnCommandResponse;
}

async function safeErrorCode(response: Response, fallback: string): Promise<string> {
  try {
    const value = await response.json() as unknown;
    if (isRecord(value) && typeof value.error === "string") return value.error;
    if (isRecord(value) && isRecord(value.error) && typeof value.error.code === "string") return value.error.code;
  } catch { /* safe fallback */ }
  return fallback;
}

const endpoint = (baseUrl: string, path: string): string => `${baseUrl.replace(/\/$/u, "")}${path}`;

type ParsedSseEvent = Readonly<{ id: string; event: string; data: string }>;

async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<ParsedSseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let id = "";
  let event = "";
  let data: string[] = [];
  const MAX_BUFFER = 512 * 1024;
  const consumeLine = (line: string): ParsedSseEvent | null => {
    if (line === "") {
      if (data.length === 0) { id = ""; event = ""; return null; }
      const parsed = { id, event, data: data.join("\n") };
      id = ""; event = ""; data = [];
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
      if (buffer.length > MAX_BUFFER) throw new LiveAdapterError("sse_event_too_large");
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/u, "");
        buffer = buffer.slice(newline + 1);
        const parsed = consumeLine(line);
        if (parsed) yield parsed;
      }
      if (chunk.done) break;
    }
    if (buffer.length > 0) {
      const parsed = consumeLine(buffer.replace(/\r$/u, ""));
      if (parsed) yield parsed;
    }
    const trailing = consumeLine("");
    if (trailing) yield trailing;
  } finally { reader.releaseLock(); }
}

export type StreamResult = "closed" | "terminal";

export class WebLiveAdapter {
  constructor(private readonly baseUrl: string, private readonly fetcher: FetchLike = fetch) {}

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
    let value: unknown;
    try { value = await response.json(); }
    catch { throw new LiveAdapterError("invalid_turn_response", response.status); }
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
    let value: unknown;
    try { value = await response.json(); }
    catch { throw new LiveAdapterError("invalid_resume_snapshot", response.status); }
    const snapshot = decodePublicRunResumeSnapshot(value);
    if (!snapshot || snapshot.runId !== runId) throw new LiveAdapterError("invalid_resume_snapshot", response.status);
    return snapshot;
  }

  async stream(
    identity: Readonly<{ sessionId: string; runId: string }>,
    afterSequence: number,
    onEvent: (event: PublicRunEvent) => void,
    signal?: AbortSignal,
  ): Promise<StreamResult> {
    const headers: Record<string, string> = { accept: "text/event-stream", "cache-control": "no-cache" };
    if (afterSequence > 0) headers["last-event-id"] = String(afterSequence);
    const response = await this.fetcher(endpoint(this.baseUrl, `/api/runs/${encodeURIComponent(identity.runId)}/events`), {
      method: "GET", headers, cache: "no-store", signal,
    });
    if (response.status === 204) return "terminal";
    if (!response.ok) throw new LiveAdapterError(await safeErrorCode(response, "event_stream_failed"), response.status);
    if (!response.body || !response.headers.get("content-type")?.toLowerCase().startsWith("text/event-stream")) {
      throw new LiveAdapterError("invalid_event_stream", response.status);
    }
    let cursor = afterSequence;
    for await (const frame of parseSse(response.body)) {
      let value: unknown;
      try { value = JSON.parse(frame.data); }
      catch { throw new LiveAdapterError("invalid_public_event", response.status); }
      const event = validatePublicRunEvent(value);
      if (!event || event.runId !== identity.runId || event.sessionId !== identity.sessionId
        || frame.id !== String(event.sequence) || (frame.event !== "" && frame.event !== event.kind)
        || event.sequence <= cursor) throw new LiveAdapterError("invalid_public_event", response.status);
      cursor = event.sequence;
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
    const result = await this.adapter.stream(identity, this.state.cursor, (event) => this.dispatch({ type: "event_received", event }), signal);
    if (result === "terminal" && this.state.phase !== "terminal") throw new LiveAdapterError("terminal_cursor_without_terminal_event");
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
