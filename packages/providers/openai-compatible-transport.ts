import {
  MODEL_EVENT_SCHEMA_VERSION,
  type CanonicalInputMessage,
  type CanonicalModelEvent,
  type JsonObject,
} from "../model-protocol/contracts";
import type { ProviderCodecContext, ProviderId } from "./contracts";
import { createOpenAiCompatibleProviderFailureEvent } from "./errors";
import { decodeOpenAiCompatibleChatCompletionChunks } from "./openai-compatible";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_EVENT_BYTES = 512 * 1024;
const DEFAULT_MAX_STREAM_BYTES = 8 * 1024 * 1024;
const MAX_MODEL_LENGTH = 256;
const MAX_API_KEY_LENGTH = 16 * 1024;
const MAX_INVOCATION_ID_LENGTH = 256;
const DEFAULT_PROVIDER_ORIGINS: Readonly<Record<ProviderId, string>> = {
  deepseek: "https://api.deepseek.com",
  kimi: "https://api.moonshot.cn",
};

export type OpenAiCompatibleTransportOptions = Readonly<{
  provider: ProviderId;
  /** A complete absolute chat/completions URL. It never appears in returned events. */
  endpoint: string;
  model: string;
  apiKey: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxEventBytes?: number;
  maxStreamBytes?: number;
  /** Server-owned allowlist: exact origins only, never browser-controlled input. */
  trustedEndpointOrigins?: readonly string[];
  fetchImplementation?: typeof fetch;
}>;

export type OpenAiCompatibleTransportRequest = Readonly<{
  messages: readonly CanonicalInputMessage[];
  /** Provider-local projection; this intentionally does not depend on Tool Runtime. */
  tools?: readonly OpenAiCompatibleRequestTool[];
  context: ProviderCodecContext;
  signal?: AbortSignal;
}>;

export type OpenAiCompatibleRequestTool = Readonly<{
  name: string;
  description: string;
  inputSchema: JsonObject;
}>;

export type OpenAiCompatibleTransport = Readonly<{
  next(input: OpenAiCompatibleTransportRequest): Promise<readonly CanonicalModelEvent[]>;
}>;

/**
 * Intentionally generic: callers receive no endpoint, header, body, or thrown
 * provider detail. Configuration is rejected before a network connection.
 */
export class OpenAiCompatibleTransportConfigurationError extends Error {
  constructor() {
    super("Invalid OpenAI-compatible provider configuration.");
    this.name = "OpenAiCompatibleTransportConfigurationError";
  }
}

type ValidatedOptions = Readonly<{
  provider: ProviderId;
  endpoint: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  maxResponseBytes: number;
  maxEventBytes: number;
  maxStreamBytes: number;
  trustedEndpointOrigins: ReadonlySet<string>;
  fetchImplementation: typeof fetch;
}>;

type OpenAiMessage = Readonly<Record<string, unknown>>;

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function positiveSafeInteger(value: unknown, fallback: number): number {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || (candidate as number) <= 0) {
    throw new OpenAiCompatibleTransportConfigurationError();
  }
  return candidate as number;
}

function validateTrustedOrigins(value: unknown): ReadonlySet<string> {
  if (value === undefined) return new Set();
  if (!Array.isArray(value) || value.length > 16) throw new OpenAiCompatibleTransportConfigurationError();
  const origins = new Set<string>();
  for (const rawOrigin of value) {
    if (typeof rawOrigin !== "string" || rawOrigin.length === 0 || rawOrigin.length > 2_048) {
      throw new OpenAiCompatibleTransportConfigurationError();
    }
    let parsed: URL;
    try { parsed = new URL(rawOrigin); } catch { throw new OpenAiCompatibleTransportConfigurationError(); }
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      (parsed.protocol === "http:" && !isLoopbackHost(parsed.hostname)) ||
      parsed.username !== "" || parsed.password !== "" || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== ""
    ) {
      throw new OpenAiCompatibleTransportConfigurationError();
    }
    origins.add(parsed.origin);
  }
  return origins;
}

function validateOptions(options: OpenAiCompatibleTransportOptions): ValidatedOptions {
  if (options === null || typeof options !== "object") throw new OpenAiCompatibleTransportConfigurationError();
  if (options.provider !== "deepseek" && options.provider !== "kimi") throw new OpenAiCompatibleTransportConfigurationError();
  if (typeof options.endpoint !== "string" || options.endpoint.length === 0 || options.endpoint.length > 2_048) {
    throw new OpenAiCompatibleTransportConfigurationError();
  }
  if (typeof options.model !== "string" || options.model.trim().length === 0 || options.model.length > MAX_MODEL_LENGTH) {
    throw new OpenAiCompatibleTransportConfigurationError();
  }
  if (typeof options.apiKey !== "string" || options.apiKey.trim().length === 0 || options.apiKey.length > MAX_API_KEY_LENGTH || /[\r\n]/u.test(options.apiKey)) {
    throw new OpenAiCompatibleTransportConfigurationError();
  }

  let endpoint: URL;
  try {
    endpoint = new URL(options.endpoint);
  } catch {
    throw new OpenAiCompatibleTransportConfigurationError();
  }
  const trustedEndpointOrigins = validateTrustedOrigins(options.trustedEndpointOrigins);
  const endpointAllowed =
    (endpoint.protocol === "https:" && (
      endpoint.origin === DEFAULT_PROVIDER_ORIGINS[options.provider] || trustedEndpointOrigins.has(endpoint.origin)
    )) || trustedEndpointOrigins.has(endpoint.origin);
  if (
    endpoint.username !== "" || endpoint.password !== "" || endpoint.search !== "" || endpoint.hash !== "" ||
    !endpoint.pathname.endsWith("/chat/completions") ||
    (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") || !endpointAllowed
  ) {
    throw new OpenAiCompatibleTransportConfigurationError();
  }
  if (typeof options.fetchImplementation !== "undefined" && typeof options.fetchImplementation !== "function") {
    throw new OpenAiCompatibleTransportConfigurationError();
  }

  const maxStreamBytes = positiveSafeInteger(options.maxStreamBytes, DEFAULT_MAX_STREAM_BYTES);
  const maxResponseBytes = positiveSafeInteger(options.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES);
  const maxEventBytes = positiveSafeInteger(options.maxEventBytes, Math.min(DEFAULT_MAX_EVENT_BYTES, maxStreamBytes));
  if (maxEventBytes > maxStreamBytes) {
    throw new OpenAiCompatibleTransportConfigurationError();
  }
  return {
    provider: options.provider,
    endpoint: endpoint.toString(),
    model: options.model,
    apiKey: options.apiKey,
    timeoutMs: positiveSafeInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS),
    maxResponseBytes,
    maxEventBytes,
    maxStreamBytes,
    trustedEndpointOrigins,
    fetchImplementation: options.fetchImplementation ?? fetch,
  };
}

function mapMessages(messages: readonly CanonicalInputMessage[]): readonly OpenAiMessage[] {
  const toolCallIds = new Map<string, string>();
  const validInvocationId = (value: string): boolean =>
    value.trim().length > 0 && value.length <= MAX_INVOCATION_ID_LENGTH && !/[\r\n]/u.test(value);
  return messages.map((message) => {
    if (message.role === "system" || message.role === "user") {
      return { role: message.role, content: message.content };
    }
    if (message.role === "assistant") {
      const toolCalls = message.toolCalls?.map((toolCall) => {
        // Provider IDs may be missing or duplicated. Only Runtime's invocation
        // ID is stable enough to be replayed as the OpenAI association key.
        const id = toolCall.invocationId;
        if (!validInvocationId(id) || toolCallIds.has(id)) throw new OpenAiCompatibleTransportConfigurationError();
        toolCallIds.set(id, id);
        return {
          id,
          type: "function",
          function: { name: toolCall.toolName, arguments: toolCall.rawArguments },
        };
      });
      return {
        role: "assistant",
        content: message.content,
        ...(toolCalls === undefined || toolCalls.length === 0 ? {} : { tool_calls: toolCalls }),
      };
    }
    if (message.role === "tool") {
      if (!validInvocationId(message.invocationId)) throw new OpenAiCompatibleTransportConfigurationError();
      const toolCallId = toolCallIds.get(message.invocationId);
      if (toolCallId === undefined) throw new OpenAiCompatibleTransportConfigurationError();
      return { role: "tool", tool_call_id: toolCallId, content: message.content };
    }
    throw new OpenAiCompatibleTransportConfigurationError();
  });
}

function mapTools(tools: readonly OpenAiCompatibleRequestTool[] | undefined): readonly OpenAiMessage[] | undefined {
  if (tools === undefined) return undefined;
  if (tools.length > 128) throw new OpenAiCompatibleTransportConfigurationError();
  const names = new Set<string>();
  return tools.map((tool) => {
    if (
      tool === null || typeof tool !== "object" || typeof tool.name !== "string" ||
      !/^[A-Za-z0-9_-]{1,64}$/u.test(tool.name) || names.has(tool.name) ||
      typeof tool.description !== "string" || tool.description.trim().length === 0 || tool.description.length > 8_192 ||
      tool.inputSchema === null || typeof tool.inputSchema !== "object" || Array.isArray(tool.inputSchema)
    ) {
      throw new OpenAiCompatibleTransportConfigurationError();
    }
    names.add(tool.name);
    let parameters: string;
    try { parameters = JSON.stringify(tool.inputSchema); } catch { throw new OpenAiCompatibleTransportConfigurationError(); }
    if (parameters.length > 512 * 1024) throw new OpenAiCompatibleTransportConfigurationError();
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    };
  });
}

function contentLengthWithinLimit(response: Response, maxResponseBytes: number): boolean {
  const value = response.headers.get("content-length");
  if (value === null) return true;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= maxResponseBytes;
}

function isEventStream(response: Response): boolean {
  return /^text\/event-stream(?:\s*;|$)/iu.test(response.headers.get("content-type") ?? "");
}

function abortError(): Error {
  return new Error("abort");
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.message === "abort");
}

async function raceWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw abortError();
  let abort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(abortError());
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    if (abort !== undefined) signal.removeEventListener("abort", abort);
  }
}

function cancelledEvent(context: ProviderCodecContext): Extract<CanonicalModelEvent, { kind: "model_step_completed" }> {
  return {
    schemaVersion: MODEL_EVENT_SCHEMA_VERSION,
    modelStepId: context.modelStepId,
    streamIndex: 0,
    occurredAt: context.occurredAt(0),
    kind: "model_step_completed",
    finishReason: "cancelled",
  };
}

/** Reads an OpenAI SSE response without retaining its raw text outside this call. */
async function readOpenAiSse(
  response: Response,
  limits: Pick<ValidatedOptions, "maxResponseBytes" | "maxEventBytes" | "maxStreamBytes">,
  signal: AbortSignal,
): Promise<readonly Readonly<Record<string, unknown>>[]> {
  if (!response.ok) throw { kind: "http", status: response.status } as const;
  if (!isEventStream(response) || response.body === null || !contentLengthWithinLimit(response, limits.maxResponseBytes)) {
    throw { kind: "malformed_stream" } as const;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const encoder = new TextEncoder();
  const chunks: Readonly<Record<string, unknown>>[] = [];
  let buffer = "";
  let dataLines: string[] = [];
  let eventBytes = 0;
  let totalBytes = 0;
  let seenDone = false;
  let seenTerminal = false;

  const dispatch = (): void => {
    if (dataLines.length === 0) return;
    const data = dataLines.join("\n");
    dataLines = [];
    eventBytes = 0;
    if (data === "[DONE]") {
      seenDone = true;
      return;
    }
    if (seenDone) throw { kind: "malformed_stream" } as const;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      throw { kind: "malformed_stream" } as const;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw { kind: "malformed_stream" } as const;
    }
    const choices = (parsed as Readonly<Record<string, unknown>>).choices;
    if (Array.isArray(choices) && choices.some((choice) =>
      choice !== null && typeof choice === "object" && typeof (choice as Readonly<Record<string, unknown>>).finish_reason === "string",
    )) {
      seenTerminal = true;
    }
    chunks.push(parsed as Readonly<Record<string, unknown>>);
  };

  const consumeLine = (line: string): void => {
    if (line === "") {
      dispatch();
      return;
    }
    if (line.startsWith(":")) return;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field !== "data") return;
    eventBytes += encoder.encode(value).byteLength;
    if (eventBytes > limits.maxEventBytes) throw { kind: "malformed_stream" } as const;
    dataLines.push(value);
  };

  const consumeBuffer = (final: boolean): void => {
    let start = 0;
    for (let index = 0; index < buffer.length; index += 1) {
      const code = buffer.charCodeAt(index);
      if (code !== 10 && code !== 13) continue;
      if (code === 13 && index + 1 === buffer.length && !final) break;
      consumeLine(buffer.slice(start, index));
      if (code === 13 && buffer.charCodeAt(index + 1) === 10) index += 1;
      start = index + 1;
    }
    buffer = buffer.slice(start);
    if (final && buffer.length > 0) {
      consumeLine(buffer);
      buffer = "";
    }
  };

  try {
    while (true) {
      if (signal.aborted) throw abortError();
      const { done, value } = await raceWithAbort(reader.read(), signal);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > limits.maxResponseBytes || totalBytes > limits.maxStreamBytes) {
        throw { kind: "malformed_stream" } as const;
      }
      buffer += decoder.decode(value, { stream: true });
      consumeBuffer(false);
      if (seenDone) {
        // [DONE] is the protocol terminator. Some providers keep the TCP
        // connection open for reuse, so waiting for EOF would turn success
        // into a timeout. Do not retain or wait for anything after it.
        if (!seenTerminal) throw { kind: "malformed_stream" } as const;
        void reader.cancel().catch(() => undefined);
        return chunks;
      }
    }
    buffer += decoder.decode();
    consumeBuffer(true);
    dispatch();
  } catch (error) {
    try { await reader.cancel(); } catch { /* no provider data escapes on cancellation */ }
    throw error;
  } finally {
    try { reader.releaseLock(); } catch { /* reader may already be released */ }
  }
  if (!seenTerminal) throw { kind: "malformed_stream" } as const;
  return chunks;
}

function isFailure(value: unknown): value is { readonly kind: "http"; readonly status: number } | { readonly kind: "timeout" | "malformed_stream" | "transport" } {
  return value !== null && typeof value === "object" && "kind" in value;
}

export function createOpenAiCompatibleChatTransport(options: OpenAiCompatibleTransportOptions): OpenAiCompatibleTransport {
  const config = validateOptions(options);
  return {
    async next(input: OpenAiCompatibleTransportRequest): Promise<readonly CanonicalModelEvent[]> {
      // Validate the outbound shape before creating a request or attaching credentials.
      const requestBody = JSON.stringify({
        model: config.model,
        messages: mapMessages(input.messages),
        ...(input.tools === undefined ? {} : { tools: mapTools(input.tools) }),
        stream: true,
      });
      const request = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        request.abort();
      }, config.timeoutMs);
      const abortFromCaller = () => request.abort();
      input.signal?.addEventListener("abort", abortFromCaller, { once: true });
      try {
        if (input.signal?.aborted) throw abortError();
        const response = await raceWithAbort(config.fetchImplementation(config.endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.apiKey}`,
            accept: "text/event-stream",
          },
          body: requestBody,
          signal: request.signal,
          redirect: "error",
        }), request.signal);
        const chunks = await readOpenAiSse(response, config, request.signal);
        return decodeOpenAiCompatibleChatCompletionChunks(config.provider, chunks, input.context);
      } catch (error) {
        if (!timedOut && input.signal?.aborted) {
          return [cancelledEvent(input.context)];
        }
        const failure = isFailure(error)
          ? error
          : timedOut
            ? { kind: "timeout" as const }
            : isAbort(error)
              ? { kind: "transport" as const }
              : { kind: "transport" as const };
        return [createOpenAiCompatibleProviderFailureEvent(config.provider, failure, input.context, 0)];
      } finally {
        clearTimeout(timer);
        input.signal?.removeEventListener("abort", abortFromCaller);
      }
    },
  };
}
