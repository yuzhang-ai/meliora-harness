import type {
  ModelMessage,
  ModelRuntimeInfo,
  ModelToolCall,
  ModelTurnInput,
  ModelTurnOutput,
} from "./contracts";
import { createHash } from "node:crypto";
import {
  AGENT_HARNESS_CONTEXT_TOKEN_BUDGET,
  AGENT_HARNESS_MAX_COMPLETION_TOKENS,
  AGENT_HARNESS_VISUAL_MAX_COMPLETION_TOKENS,
} from "./contracts";
import { projectHarnessContextTokenEstimateV95 } from "./context/token-estimator-v9.5";

const DEFAULT_BASE_URL = "https://api.minimax.io/v1";
const DEFAULT_MODEL = "MiniMax-M3";
const DEFAULT_MODEL_TIMEOUT_MS = 300_000;
const PRIMARY_MINIMAX_BASE_URL = "https://api.minimaxi.com/anthropic";
const SECONDARY_MINIMAX_BASE_URL = "https://ai-openapi.beschannels.com/v1";
export const TRANSIENT_PROVIDER_HTTP_STATUSES_V95 = Object.freeze([
  429, 500, 502, 503, 504,
] as const);
const TRANSIENT_PROVIDER_STATUSES = new Set<number>(
  TRANSIENT_PROVIDER_HTTP_STATUSES_V95
);
export const isTransientProviderHttpStatusV95 = (
  status: number | null | undefined
) => typeof status === "number" && TRANSIENT_PROVIDER_STATUSES.has(status);
const PROVIDER_RETRY_DELAYS_MS = [1_500, 4_000, 8_000] as const;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

export const V95_GOVERNED_PROVIDER_ATTEMPT_ACCOUNTING_CONTRACT_VERSION =
  "governed-provider-attempt-accounting-v9.5-r1" as const;

export type GovernedProviderAttemptAccountingV95 = Readonly<{
  contractVersion: typeof V95_GOVERNED_PROVIDER_ATTEMPT_ACCOUNTING_CONTRACT_VERSION;
  authority: "v9_runtime_store_budget_controller" | "v93_governance_ledger_r3";
  reservationPolicy: "conservative_full_input_and_requested_output_per_attempt";
  settlementBeforeNextAttempt: true;
}>;

export const getHarnessModelTimeoutMs = () =>
  Math.min(
    Math.max(
      Number(
        process.env.ZHIQU_AGENT_MODEL_TIMEOUT_MS || DEFAULT_MODEL_TIMEOUT_MS
      ),
      1_000
    ),
    600_000
  );

export interface HarnessModelProvider {
  readonly info: ModelRuntimeInfo;
  readonly visualInfo?: ModelRuntimeInfo;
  readonly supportsGoalContracts?: boolean;
  readonly supportsProviderAttemptHooks?: boolean;
  readonly supportsVisualAttemptHooks?: boolean;
  readonly governedProviderAttemptAccounting?: GovernedProviderAttemptAccountingV95;
  completeTurn(input: ModelTurnInput): Promise<ModelTurnOutput>;
  analyzeReferenceImages?(input: {
    prompt: string;
    images: Array<{ mediaType: "image/jpeg" | "image/png"; bytes: Uint8Array }>;
    maxTokens?: number;
    timeoutMs?: number;
    totalAttemptBudgetMs?: number;
    abortSignal?: AbortSignal;
    onProviderAttemptStart?: ModelTurnInput["onProviderAttemptStart"];
    onProviderAttemptFinish?: ModelTurnInput["onProviderAttemptFinish"];
  }): Promise<ModelTurnOutput>;
}

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");

const wait = (durationMs: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new Error("Model request aborted."));
      return;
    }
    const timer = setTimeout(resolve, durationMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason || new Error("Model request aborted."));
      },
      { once: true }
    );
  });

const combineAbortSignals = (...signals: Array<AbortSignal | undefined>) => {
  const active = signals.filter((signal): signal is AbortSignal =>
    Boolean(signal)
  );
  if (active.length === 1) return active[0];
  if (active.length > 1 && typeof AbortSignal.any === "function") {
    return AbortSignal.any(active);
  }
  const controller = new AbortController();
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
    });
  }
  return controller.signal;
};

export const createMonotonicElapsedClockV81 = (
  initialElapsedMs = 0,
  monotonicNow: () => number = () => performance.now()
) => {
  const startedAt = monotonicNow();
  return {
    elapsedMs: () =>
      Math.max(0, initialElapsedMs + Math.max(0, monotonicNow() - startedAt)),
  };
};

export const normalizeTimerDelayMsV81 = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(
      `Timer delay must be a positive finite number; received ${String(value)}.`
    );
  }
  return Math.max(1, Math.min(MAX_TIMER_DELAY_MS, Math.floor(value)));
};

export const parseRetryAfterSecondsV95 = (
  value: string | null,
  nowMs = Date.now()
) => {
  const normalized = value?.trim();
  if (!normalized) return null;
  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric >= 0) return Math.ceil(numeric);
  const retryAtMs = Date.parse(normalized);
  if (!Number.isFinite(retryAtMs)) return null;
  return Math.ceil(Math.max(0, retryAtMs - nowMs) / 1_000);
};

const fetchModelResponse = async (
  url: string,
  init: Omit<RequestInit, "signal">,
  options: {
    timeoutMs?: number;
    totalAttemptBudgetMs?: number;
    abortSignal?: AbortSignal;
    onProviderAttemptStart?: ModelTurnInput["onProviderAttemptStart"];
    onProviderAttemptFinish?: ModelTurnInput["onProviderAttemptFinish"];
  } = {}
) => {
  let lastNetworkError: unknown;
  const attemptClock = createMonotonicElapsedClockV81();
  const timeoutMs = normalizeTimerDelayMsV81(
    Math.min(
      Math.max(options.timeoutMs || getHarnessModelTimeoutMs(), 1_000),
      600_000
    )
  );
  const totalAttemptBudgetMs = normalizeTimerDelayMsV81(
    Math.max(options.totalAttemptBudgetMs || timeoutMs, timeoutMs)
  );
  for (
    let attempt = 0;
    attempt <= PROVIDER_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
    let retryAfterMs: number | null = null;
    const remainingMs = totalAttemptBudgetMs - attemptClock.elapsedMs();
    if (remainingMs <= 0) {
      const error = new Error(
        "Model provider total attempt budget was exhausted."
      );
      error.name = "TimeoutError";
      throw Object.assign(error, { retryCount: attempt, timedOut: true });
    }
    const attemptStartedAt = performance.now();
    const permit = options.onProviderAttemptStart
      ? await options.onProviderAttemptStart({ attemptIndex: attempt })
      : null;
    let attemptFinished = false;
    try {
      const requestSignal = combineAbortSignals(
        options.abortSignal,
        AbortSignal.timeout(
          normalizeTimerDelayMsV81(Math.min(timeoutMs, remainingMs))
        )
      );
      const response = await fetch(url, {
        ...init,
        signal: requestSignal,
      });
      const retryAfterSeconds = parseRetryAfterSecondsV95(
        response.headers.get("retry-after")
      );
      retryAfterMs =
        retryAfterSeconds === null ? null : retryAfterSeconds * 1_000;
      if (permit && options.onProviderAttemptFinish) {
        attemptFinished = true;
        await options.onProviderAttemptFinish({
          attemptId: permit.attemptId,
          attemptIndex: attempt,
          status: "response",
          httpStatus: response.status,
          errorCode: null,
          retryAfterSeconds,
          durationMs: Math.max(0, performance.now() - attemptStartedAt),
        });
      }
      if (
        response.ok ||
        !TRANSIENT_PROVIDER_STATUSES.has(response.status) ||
        attempt === PROVIDER_RETRY_DELAYS_MS.length
      ) {
        return { response, retryCount: attempt, requestSignal };
      }
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      if (permit && options.onProviderAttemptFinish && !attemptFinished) {
        attemptFinished = true;
        await options.onProviderAttemptFinish({
          attemptId: permit.attemptId,
          attemptIndex: attempt,
          status: options.abortSignal?.aborted ? "cancelled" : "network_error",
          httpStatus: null,
          errorCode:
            error instanceof Error
              ? error.name || "provider_network_error"
              : "provider_network_error",
          retryAfterSeconds: null,
          durationMs: Math.max(0, performance.now() - attemptStartedAt),
        });
      }
      lastNetworkError = error;
      if (attempt === PROVIDER_RETRY_DELAYS_MS.length) {
        throw Object.assign(
          error instanceof Error ? error : new Error(String(error)),
          {
            retryCount: attempt,
            timedOut:
              error instanceof Error &&
              (error.name === "TimeoutError" || error.name === "AbortError"),
          }
        );
      }
    }
    const delay = Math.max(
      PROVIDER_RETRY_DELAYS_MS[attempt],
      retryAfterMs || 0
    );
    if (attemptClock.elapsedMs() + delay >= totalAttemptBudgetMs) {
      const error = new Error(
        "Model provider total attempt budget was exhausted before retry."
      );
      error.name = "TimeoutError";
      throw Object.assign(error, {
        retryCount: attempt,
        timedOut: true,
      });
    }
    await wait(delay, options.abortSignal);
  }
  throw lastNetworkError instanceof Error
    ? lastNetworkError
    : new Error("Model provider request failed after transient retries.");
};

export const estimateModelInputTokens = (
  messages: ModelMessage[],
  tools: ModelTurnInput["tools"]
) => projectHarnessContextTokenEstimateV95({ messages, tools }).tokenCount;

const assertModelInputBudget = (input: ModelTurnInput) => {
  const estimatedTokens = estimateModelInputTokens(input.messages, input.tools);
  if (estimatedTokens > AGENT_HARNESS_CONTEXT_TOKEN_BUDGET) {
    throw new Error(
      `Model input exceeds the fixed ${AGENT_HARNESS_CONTEXT_TOKEN_BUDGET}-token Harness context budget (estimated ${estimatedTokens}).`
    );
  }
};

type ResolvedHarnessModelProfile = {
  info: ModelRuntimeInfo;
  apiKey: string | null;
};

const exactMinimaxAnthropicEnvironment = () => {
  const baseUrl = process.env.ANTHROPIC_BASE_URL?.trim();
  return baseUrl && normalizeBaseUrl(baseUrl) === PRIMARY_MINIMAX_BASE_URL
    ? process.env.ANTHROPIC_AUTH_TOKEN?.trim() || null
    : null;
};

const primaryHarnessModelProfile = (): ResolvedHarnessModelProfile => {
  const apiKey =
    process.env.ZHIQU_AGENT_PRIMARY_MODEL_API_KEY?.trim() ||
    exactMinimaxAnthropicEnvironment();
  return {
    info: {
      provider: "minimax",
      profileId: "primary",
      model: "MiniMax-M3",
      baseUrl: PRIMARY_MINIMAX_BASE_URL,
      requestUrl: `${PRIMARY_MINIMAX_BASE_URL}/v1/messages`,
      configured: Boolean(apiKey),
      protocol: "anthropic_messages",
      serviceTier: "standard",
    },
    apiKey,
  };
};

const secondaryHarnessModelProfile = (): ResolvedHarnessModelProfile => {
  const apiKey =
    process.env.ZHIQU_AGENT_SECONDARY_MODEL_API_KEY?.trim() ||
    process.env.ZHIQU_AGENT_MODEL_API_KEY?.trim() ||
    null;
  return {
    info: {
      provider: "minimax",
      profileId: "secondary",
      model: "minimax-m3",
      baseUrl: SECONDARY_MINIMAX_BASE_URL,
      requestUrl: `${SECONDARY_MINIMAX_BASE_URL}/chat/completions`,
      configured: Boolean(apiKey),
      protocol: "openai_chat_completions",
      serviceTier: "standard",
    },
    apiKey,
  };
};

const legacyHarnessModelProfile = (): ResolvedHarnessModelProfile => {
  const baseUrl = normalizeBaseUrl(
    process.env.ZHIQU_AGENT_MODEL_BASE_URL?.trim() ||
      process.env.ANTHROPIC_BASE_URL?.trim() ||
      DEFAULT_BASE_URL
  );
  const anthropic = shouldUseAnthropicMessagesProtocol();
  const apiKey =
    process.env.ZHIQU_AGENT_MODEL_API_KEY?.trim() ||
    process.env.ANTHROPIC_AUTH_TOKEN?.trim() ||
    null;
  return {
    info: {
      provider: "minimax",
      profileId: "legacy",
      model:
        process.env.ZHIQU_AGENT_MODEL_NAME?.trim() ||
        process.env.ANTHROPIC_MODEL?.trim() ||
        DEFAULT_MODEL,
      baseUrl,
      requestUrl: normalizeBaseUrl(
        anthropic
          ? `${baseUrl}/v1/messages`
          : process.env.ZHIQU_AGENT_MODEL_API_URL?.trim() ||
              `${baseUrl}/chat/completions`
      ),
      configured: Boolean(apiKey),
      protocol: anthropic ? "anthropic_messages" : "openai_chat_completions",
      serviceTier:
        process.env.ZHIQU_AGENT_MODEL_SERVICE_TIER?.trim().toLowerCase() ===
        "priority"
          ? "priority"
          : "standard",
    },
    apiKey,
  };
};

export const resolveHarnessModelProfile = (): ResolvedHarnessModelProfile => {
  const requested = process.env.ZHIQU_AGENT_MODEL_PROFILE?.trim().toLowerCase();
  const primary = primaryHarnessModelProfile();
  const secondary = secondaryHarnessModelProfile();
  if (requested === "primary") return primary;
  if (requested === "secondary") return secondary;
  if (requested && requested !== "auto" && requested !== "legacy") {
    throw new Error(`Unknown Harness model profile: ${requested}`);
  }
  if (requested === "legacy") return legacyHarnessModelProfile();
  if (primary.info.configured) return primary;
  if (secondary.info.configured) return secondary;
  return legacyHarnessModelProfile();
};

export const getHarnessModelRuntimeInfo = (): ModelRuntimeInfo => ({
  ...resolveHarnessModelProfile().info,
});

const shouldUseAnthropicMessagesProtocol = () =>
  process.env.ZHIQU_AGENT_MODEL_PROTOCOL?.trim().toLowerCase() ===
    "anthropic" ||
  (Boolean(process.env.ANTHROPIC_BASE_URL?.trim()) &&
    !process.env.ZHIQU_AGENT_MODEL_API_URL?.trim() &&
    !process.env.ZHIQU_AGENT_MODEL_BASE_URL?.trim());

export const resolveHarnessVisionModelProfile =
  (): ResolvedHarnessModelProfile => {
    const dedicatedApiKey = process.env.ZHIQU_AGENT_VISION_API_KEY?.trim();
    const secondaryApiKey =
      process.env.ZHIQU_AGENT_SECONDARY_MODEL_API_KEY?.trim();
    const genericApiKey = process.env.ZHIQU_AGENT_MODEL_API_KEY?.trim();
    const explicitVisionApiUrl = process.env.ZHIQU_AGENT_VISION_API_URL?.trim();
    const credentialSource = dedicatedApiKey
      ? "dedicated"
      : secondaryApiKey
      ? "secondary"
      : genericApiKey
      ? "legacy"
      : "none";
    const apiKey = dedicatedApiKey || secondaryApiKey || genericApiKey || null;
    const legacyBaseUrl = normalizeBaseUrl(
      process.env.ZHIQU_AGENT_MODEL_BASE_URL?.trim() ||
        SECONDARY_MINIMAX_BASE_URL
    );
    const apiUrl = normalizeBaseUrl(
      explicitVisionApiUrl ||
        (credentialSource === "secondary"
          ? `${SECONDARY_MINIMAX_BASE_URL}/chat/completions`
          : process.env.ZHIQU_AGENT_MODEL_API_URL?.trim() ||
            `${legacyBaseUrl}/chat/completions`)
    );
    const isCanonicalSecondaryProfile =
      credentialSource === "secondary" &&
      apiUrl === `${SECONDARY_MINIMAX_BASE_URL}/chat/completions`;
    return {
      info: {
        provider: "minimax",
        profileId: isCanonicalSecondaryProfile ? "secondary" : "legacy",
        model: isCanonicalSecondaryProfile
          ? "minimax-m3"
          : process.env.ZHIQU_AGENT_VISION_MODEL_NAME?.trim() ||
            process.env.ZHIQU_AGENT_MODEL_NAME?.trim() ||
            DEFAULT_MODEL,
        baseUrl: normalizeBaseUrl(
          apiUrl.replace(/\/chat\/completions\/?$/, "")
        ),
        requestUrl: apiUrl,
        configured: Boolean(apiKey),
        protocol: "openai_chat_completions",
        serviceTier:
          process.env.ZHIQU_AGENT_VISION_SERVICE_TIER?.trim().toLowerCase() ===
          "priority"
            ? "priority"
            : "standard",
      },
      apiKey,
    };
  };

export const getHarnessVisionRuntimeInfo = (): ModelRuntimeInfo => ({
  ...resolveHarnessVisionModelProfile().info,
});

export const normalizeToolArgumentsForProviderHistory = (value: string) => {
  try {
    return JSON.stringify(JSON.parse(value || "{}"));
  } catch {
    // The local tool result already carries the validation error. Replaying a
    // malformed arguments string makes MiniMax reject the entire repair turn
    // before the Actor can see that result.
    return "{}";
  }
};

const toMiniMaxMessage = (message: ModelMessage) => ({
  role: message.role,
  content: message.content,
  ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
  ...(message.toolCalls?.length
    ? {
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: {
            name: call.name,
            arguments: normalizeToolArgumentsForProviderHistory(call.arguments),
          },
        })),
      }
    : {}),
});

const readOutput = (payload: unknown): ModelTurnOutput => {
  if (!payload || typeof payload !== "object") {
    throw new Error("MiniMax returned an invalid response.");
  }
  const choice = (payload as { choices?: unknown[] }).choices?.[0];
  if (!choice || typeof choice !== "object") {
    throw new Error("MiniMax returned no response choice.");
  }
  const message = (choice as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    throw new Error("MiniMax returned no assistant message.");
  }
  const raw = message as { content?: unknown; tool_calls?: unknown };
  const toolCalls: ModelToolCall[] = Array.isArray(raw.tool_calls)
    ? raw.tool_calls.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const value = item as {
          id?: unknown;
          function?: { name?: unknown; arguments?: unknown };
        };
        if (
          typeof value.id !== "string" ||
          typeof value.function?.name !== "string" ||
          typeof value.function?.arguments !== "string"
        ) {
          return [];
        }
        return [
          {
            id: value.id,
            name: value.function.name,
            arguments: value.function.arguments,
          },
        ];
      })
    : [];
  const usage = (
    payload as {
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        completion_tokens_details?: { reasoning_tokens?: number };
      };
    }
  ).usage;
  return {
    content: typeof raw.content === "string" ? raw.content : "",
    toolCalls,
    finishReason:
      typeof (choice as { finish_reason?: unknown }).finish_reason === "string"
        ? String((choice as { finish_reason?: unknown }).finish_reason)
        : undefined,
    usage: usage
      ? {
          promptTokens: usage.prompt_tokens,
          uncachedInputTokens: usage.prompt_tokens,
          totalInputTokens: usage.prompt_tokens,
          cacheStatus: "unsupported",
          completionTokens: usage.completion_tokens,
          reasoningTokens: usage.completion_tokens_details?.reasoning_tokens,
        }
      : undefined,
  };
};

type AnthropicContentBlock =
  | {
      type: "text";
      text: string;
      cache_control?: { type: "ephemeral" };
    }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: unknown;
      cache_control?: { type: "ephemeral" };
    }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string;
      cache_control?: { type: "ephemeral" };
    };

const parseToolArgumentsForAnthropic = (value: string) => {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const toAnthropicMessages = (messages: ModelMessage[]) => {
  const system = messages
    .filter(({ role }) => role === "system")
    .map(({ content }) => content)
    .filter(Boolean)
    .join("\n\n");
  const projected: Array<{
    role: "user" | "assistant";
    content: AnthropicContentBlock[];
  }> = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    const role = message.role === "assistant" ? "assistant" : "user";
    const content: AnthropicContentBlock[] = [];
    if (message.role === "tool" && message.toolCallId) {
      content.push({
        type: "tool_result",
        tool_use_id: message.toolCallId,
        content: message.content,
      });
    } else {
      if (message.content)
        content.push({ type: "text", text: message.content });
      for (const call of message.toolCalls || []) {
        content.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: parseToolArgumentsForAnthropic(call.arguments),
        });
      }
    }
    if (!content.length) continue;
    const previous = projected.at(-1);
    if (previous?.role === role) previous.content.push(...content);
    else projected.push({ role, content });
  }
  return { system, messages: projected };
};

const sha256Json = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

type PromptCacheHashSnapshot = {
  stableToolHash?: string | null;
  stableSystemHash?: string | null;
  stableMessagePrefixHash?: string | null;
};

export const derivePromptCacheBreakReason = (input: {
  cacheStatus?: "reported" | "unreported" | "unsupported";
  current: PromptCacheHashSnapshot;
  previous?: PromptCacheHashSnapshot | null;
}) => {
  if (input.cacheStatus === "unsupported") return "provider_cache_unsupported";
  if (!input.previous?.stableToolHash) return "initial_warmup";
  if (input.previous.stableToolHash !== input.current.stableToolHash) {
    return "tool_hash_changed";
  }
  if (input.previous.stableSystemHash !== input.current.stableSystemHash) {
    return "system_hash_changed";
  }
  if (
    input.previous.stableMessagePrefixHash !==
    input.current.stableMessagePrefixHash
  ) {
    return "message_prefix_changed";
  }
  return "stable_prefix_unchanged";
};

type PromptCacheBoundaryKind =
  | "terminal_dynamic_delta"
  | "decision_capsule"
  | "legacy_terminal_composition"
  | "fallback_message_prefix"
  | "none";

type PromptCacheLayerObservabilityV95 = {
  cacheBoundaryKind?: PromptCacheBoundaryKind;
  cacheBoundaryFound?: boolean;
  cacheMarkerCount?: number;
  terminalRunStaticLayerBytes?: number;
  terminalRunStaticLayerHash?: string | null;
  terminalCandidateVersionLayerBytes?: number;
  terminalCandidateVersionLayerHash?: string | null;
  terminalDynamicDeltaLayerBytes?: number;
  terminalDynamicDeltaLayerHash?: string | null;
};

type AnthropicBlockPosition = {
  messageIndex: number;
  blockIndex: number;
};

const jsonBlockType = (block: AnthropicContentBlock) => {
  if (block.type !== "text") return null;
  try {
    const parsed = JSON.parse(block.text) as { type?: unknown };
    return typeof parsed.type === "string" ? parsed.type : null;
  } catch {
    return null;
  }
};

const positionBefore = (
  messages: Array<{ content: AnthropicContentBlock[] }>,
  position: AnthropicBlockPosition
): AnthropicBlockPosition | null =>
  position.blockIndex > 0
    ? {
        messageIndex: position.messageIndex,
        blockIndex: position.blockIndex - 1,
      }
    : position.messageIndex > 0
    ? {
        messageIndex: position.messageIndex - 1,
        blockIndex: messages[position.messageIndex - 1].content.length - 1,
      }
    : null;

const findLastJsonBlock = (
  messages: Array<{ content: AnthropicContentBlock[] }>,
  acceptedTypes: ReadonlySet<string>,
  before?: AnthropicBlockPosition | null
): (AnthropicBlockPosition & { blockType: string }) | null => {
  const startMessageIndex = before?.messageIndex ?? messages.length - 1;
  for (
    let messageIndex = startMessageIndex;
    messageIndex >= 0;
    messageIndex -= 1
  ) {
    const maximumBlockIndex =
      messageIndex === before?.messageIndex
        ? before.blockIndex - 1
        : messages[messageIndex].content.length - 1;
    for (let blockIndex = maximumBlockIndex; blockIndex >= 0; blockIndex -= 1) {
      const blockType = jsonBlockType(
        messages[messageIndex].content[blockIndex]
      );
      if (blockType && acceptedTypes.has(blockType)) {
        return { messageIndex, blockIndex, blockType };
      }
    }
  }
  return null;
};

const blockAt = (
  messages: Array<{ content: AnthropicContentBlock[] }>,
  position: AnthropicBlockPosition | null
) =>
  position
    ? messages[position.messageIndex]?.content[position.blockIndex] || null
    : null;

const textBlockStats = (block: AnthropicContentBlock | null) => {
  const text = block?.type === "text" ? block.text : null;
  return {
    bytes: text ? Buffer.byteLength(text, "utf8") : 0,
    hash: text ? createHash("sha256").update(text, "utf8").digest("hex") : null,
  };
};

export const buildMiniMaxAnthropicCacheProjection = (input: ModelTurnInput) => {
  const projected = toAnthropicMessages(input.messages);
  const tools = [...input.tools]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
  if (tools.length) {
    Object.assign(tools[tools.length - 1], {
      cache_control: { type: "ephemeral" as const },
    });
  }
  const system = projected.system
    ? [
        {
          type: "text" as const,
          text: projected.system,
          cache_control: { type: "ephemeral" as const },
        },
      ]
    : undefined;
  const messages = projected.messages.map((message) => ({
    ...message,
    content: message.content.map((block) => ({ ...block })),
  }));
  const dynamicPosition = findLastJsonBlock(
    messages,
    new Set(["v9.5_terminal_context_dynamic_delta"])
  );
  const capsulePosition = findLastJsonBlock(
    messages,
    new Set(["v9_actor_decision_capsule"])
  );
  const legacyTerminalPosition = findLastJsonBlock(
    messages,
    new Set(["v9_terminal_composition_view"])
  );
  const recognizedPositions = [
    dynamicPosition
      ? {
          ...dynamicPosition,
          boundaryKind: "terminal_dynamic_delta" as const,
        }
      : null,
    capsulePosition
      ? { ...capsulePosition, boundaryKind: "decision_capsule" as const }
      : null,
    legacyTerminalPosition
      ? {
          ...legacyTerminalPosition,
          boundaryKind: "legacy_terminal_composition" as const,
        }
      : null,
  ].filter((value): value is NonNullable<typeof value> => Boolean(value));
  const boundaryTarget =
    recognizedPositions.sort(
      (left, right) =>
        right.messageIndex - left.messageIndex ||
        right.blockIndex - left.blockIndex
    )[0] || null;
  const cacheBoundaryKind: PromptCacheBoundaryKind = boundaryTarget
    ? boundaryTarget.boundaryKind
    : messages.length > 1
    ? "fallback_message_prefix"
    : "none";
  const stablePrefix = boundaryTarget
    ? messages
        .slice(0, boundaryTarget.messageIndex + 1)
        .map((message, messageIndex) => ({
          ...message,
          content:
            messageIndex === boundaryTarget.messageIndex
              ? message.content.slice(0, boundaryTarget.blockIndex)
              : message.content,
        }))
        .filter(({ content }) => content.length > 0)
    : messages.slice(0, Math.max(0, messages.length - 1));
  const stableMessagePrefixHash = sha256Json(stablePrefix);
  const terminalCandidatePosition = dynamicPosition
    ? findLastJsonBlock(
        messages,
        new Set(["v9.5_terminal_context_candidate_version"]),
        dynamicPosition
      )
    : null;
  const terminalRunStaticPosition = terminalCandidatePosition
    ? findLastJsonBlock(
        messages,
        new Set(["v9.5_terminal_context_run_static"]),
        terminalCandidatePosition
      )
    : null;
  const desiredMessageBoundaries = dynamicPosition
    ? [terminalRunStaticPosition, terminalCandidatePosition].flatMap((value) =>
        value
          ? [{ messageIndex: value.messageIndex, blockIndex: value.blockIndex }]
          : []
      )
    : boundaryTarget
    ? [positionBefore(messages, boundaryTarget)].flatMap((value) =>
        value ? [value] : []
      )
    : messages.length > 1
    ? [
        {
          messageIndex: messages.length - 2,
          blockIndex: messages[messages.length - 2].content.length - 1,
        },
      ]
    : [];
  let cacheMarkerCount = (tools.length ? 1 : 0) + (system ? 1 : 0);
  const markedPositions = new Set<string>();
  for (const position of desiredMessageBoundaries) {
    if (cacheMarkerCount >= 4) break;
    const positionKey = `${position.messageIndex}:${position.blockIndex}`;
    if (markedPositions.has(positionKey)) continue;
    const block = blockAt(messages, position);
    if (!block) continue;
    block.cache_control = { type: "ephemeral" };
    markedPositions.add(positionKey);
    cacheMarkerCount += 1;
  }
  const decisionCapsule = blockAt(messages, capsulePosition);
  const terminalRunStaticStats = textBlockStats(
    blockAt(messages, terminalRunStaticPosition)
  );
  const terminalCandidateVersionStats = textBlockStats(
    blockAt(messages, terminalCandidatePosition)
  );
  const terminalDynamicDeltaStats = textBlockStats(
    blockAt(messages, dynamicPosition)
  );
  return {
    tools,
    system,
    messages,
    observability: {
      decisionCapsuleBytes: decisionCapsule
        ? Buffer.byteLength(
            decisionCapsule.type === "text"
              ? decisionCapsule.text
              : JSON.stringify(decisionCapsule),
            "utf8"
          )
        : 0,
      cacheBoundaryKind,
      cacheBoundaryFound: Boolean(boundaryTarget),
      cacheMarkerCount,
      terminalRunStaticLayerBytes: terminalRunStaticStats.bytes,
      terminalRunStaticLayerHash: terminalRunStaticStats.hash,
      terminalCandidateVersionLayerBytes: terminalCandidateVersionStats.bytes,
      terminalCandidateVersionLayerHash: terminalCandidateVersionStats.hash,
      terminalDynamicDeltaLayerBytes: terminalDynamicDeltaStats.bytes,
      terminalDynamicDeltaLayerHash: terminalDynamicDeltaStats.hash,
      stableToolHash: sha256Json(
        tools.map(({ name, description, input_schema }) => ({
          name,
          description,
          input_schema,
        }))
      ),
      stableSystemHash: sha256Json(projected.system),
      stableMessagePrefixHash,
    },
  };
};

export const readAnthropicStreamingOutput = async (
  response: Response,
  onContentDelta?: ModelTurnInput["onContentDelta"],
  trace?: {
    startedAt: number;
    responseAt: number;
    requestBytes: number;
    messageBytes: number;
    toolSchemaBytes: number;
    estimatedInputTokens: number;
    retryCount: number;
    decisionCapsuleBytes?: number;
    stableToolHash?: string;
    stableSystemHash?: string;
    stableMessagePrefixHash?: string;
    cacheBreakReason?: string;
    cacheBoundaryKind?: PromptCacheBoundaryKind;
    cacheBoundaryFound?: boolean;
    cacheMarkerCount?: number;
    terminalRunStaticLayerBytes?: number;
    terminalRunStaticLayerHash?: string | null;
    terminalCandidateVersionLayerBytes?: number;
    terminalCandidateVersionLayerHash?: string | null;
    terminalDynamicDeltaLayerBytes?: number;
    terminalDynamicDeltaLayerHash?: string | null;
  },
  requestSignal?: AbortSignal
): Promise<ModelTurnOutput> => {
  if (!response.body) {
    throw new Error("MiniMax Anthropic endpoint returned no streaming body.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const calls = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();
  let sourceBuffer = "";
  let content = "";
  let finishReason: string | undefined;
  let usage: ModelTurnOutput["usage"];
  let responseBytes = 0;
  let firstChunkAt: number | undefined;
  let firstOutputAt: number | undefined;
  let lastChunkAt: number | undefined;
  let messageStopped = false;
  const startedAt = trace?.startedAt ?? performance.now();
  const consumeFrame = async (frame: string) => {
    const dataLines = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    if (!dataLines.length) return;
    const raw = dataLines.join("\n");
    if (!raw || raw === "[DONE]") return;
    const payload = JSON.parse(raw) as {
      type?: unknown;
      index?: unknown;
      message?: {
        usage?: {
          input_tokens?: unknown;
          output_tokens?: unknown;
          cache_creation_input_tokens?: unknown;
          cache_read_input_tokens?: unknown;
        };
      };
      content_block?: {
        type?: unknown;
        id?: unknown;
        name?: unknown;
        input?: unknown;
      };
      delta?: {
        type?: unknown;
        text?: unknown;
        partial_json?: unknown;
        stop_reason?: unknown;
      };
      usage?: {
        input_tokens?: unknown;
        output_tokens?: unknown;
        cache_creation_input_tokens?: unknown;
        cache_read_input_tokens?: unknown;
      };
    };
    const index = typeof payload.index === "number" ? payload.index : 0;
    if (payload.type === "message_start" && payload.message?.usage) {
      const rawUsage = payload.message.usage;
      const uncachedInputTokens =
        typeof rawUsage.input_tokens === "number"
          ? rawUsage.input_tokens
          : undefined;
      const cacheCreationInputTokens =
        typeof rawUsage.cache_creation_input_tokens === "number"
          ? rawUsage.cache_creation_input_tokens
          : undefined;
      const cacheReadInputTokens =
        typeof rawUsage.cache_read_input_tokens === "number"
          ? rawUsage.cache_read_input_tokens
          : undefined;
      const cacheTelemetryReported =
        Object.prototype.hasOwnProperty.call(
          rawUsage,
          "cache_creation_input_tokens"
        ) ||
        Object.prototype.hasOwnProperty.call(
          rawUsage,
          "cache_read_input_tokens"
        );
      usage = {
        promptTokens: uncachedInputTokens,
        uncachedInputTokens,
        cacheCreationInputTokens,
        cacheReadInputTokens,
        totalInputTokens:
          cacheTelemetryReported || typeof uncachedInputTokens === "number"
            ? (uncachedInputTokens || 0) +
              (cacheCreationInputTokens || 0) +
              (cacheReadInputTokens || 0)
            : undefined,
        cacheStatus: cacheTelemetryReported ? "reported" : "unreported",
        completionTokens:
          typeof rawUsage.output_tokens === "number"
            ? rawUsage.output_tokens
            : undefined,
      };
      return;
    }
    if (
      payload.type === "content_block_start" &&
      payload.content_block?.type === "tool_use"
    ) {
      firstOutputAt ||= performance.now();
      calls.set(index, {
        id:
          typeof payload.content_block.id === "string"
            ? payload.content_block.id
            : "",
        name:
          typeof payload.content_block.name === "string"
            ? payload.content_block.name
            : "",
        arguments:
          payload.content_block.input &&
          typeof payload.content_block.input === "object" &&
          Object.keys(payload.content_block.input).length
            ? JSON.stringify(payload.content_block.input)
            : "",
      });
      return;
    }
    if (
      payload.type === "content_block_delta" &&
      payload.delta?.type === "text_delta" &&
      typeof payload.delta.text === "string"
    ) {
      firstOutputAt ||= performance.now();
      content += payload.delta.text;
      await onContentDelta?.(payload.delta.text);
      return;
    }
    if (
      payload.type === "content_block_delta" &&
      payload.delta?.type === "input_json_delta" &&
      typeof payload.delta.partial_json === "string"
    ) {
      firstOutputAt ||= performance.now();
      const call = calls.get(index) || { id: "", name: "", arguments: "" };
      call.arguments += payload.delta.partial_json;
      calls.set(index, call);
      return;
    }
    if (payload.type === "message_delta") {
      if (typeof payload.delta?.stop_reason === "string") {
        finishReason = payload.delta.stop_reason;
      }
      if (payload.usage) {
        const uncachedInputTokens =
          typeof payload.usage.input_tokens === "number"
            ? payload.usage.input_tokens
            : usage?.uncachedInputTokens;
        const cacheCreationInputTokens =
          typeof payload.usage.cache_creation_input_tokens === "number"
            ? payload.usage.cache_creation_input_tokens
            : usage?.cacheCreationInputTokens;
        const cacheReadInputTokens =
          typeof payload.usage.cache_read_input_tokens === "number"
            ? payload.usage.cache_read_input_tokens
            : usage?.cacheReadInputTokens;
        const cacheTelemetryReported =
          usage?.cacheStatus === "reported" ||
          Object.prototype.hasOwnProperty.call(
            payload.usage,
            "cache_creation_input_tokens"
          ) ||
          Object.prototype.hasOwnProperty.call(
            payload.usage,
            "cache_read_input_tokens"
          );
        usage = {
          ...usage,
          promptTokens: uncachedInputTokens,
          uncachedInputTokens,
          cacheCreationInputTokens,
          cacheReadInputTokens,
          totalInputTokens:
            cacheTelemetryReported || typeof uncachedInputTokens === "number"
              ? (uncachedInputTokens || 0) +
                (cacheCreationInputTokens || 0) +
                (cacheReadInputTokens || 0)
              : usage?.totalInputTokens,
          cacheStatus: cacheTelemetryReported ? "reported" : "unreported",
          completionTokens:
            typeof payload.usage.output_tokens === "number"
              ? payload.usage.output_tokens
              : usage?.completionTokens,
        };
      }
      return;
    }
    if (payload.type === "message_stop") messageStopped = true;
  };
  try {
    while (true) {
      if (requestSignal?.aborted) {
        throw requestSignal.reason || new Error("Model request aborted.");
      }
      const { done, value } = await reader.read();
      if (done) break;
      const now = performance.now();
      firstChunkAt ||= now;
      lastChunkAt = now;
      responseBytes += value.byteLength;
      sourceBuffer += decoder.decode(value, { stream: true });
      const frames = sourceBuffer.split(/\r?\n\r?\n/);
      sourceBuffer = frames.pop() || "";
      for (const frame of frames) await consumeFrame(frame);
    }
    sourceBuffer += decoder.decode();
    if (sourceBuffer.trim()) await consumeFrame(sourceBuffer);
  } finally {
    reader.releaseLock();
  }
  const toolCalls = [...calls.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, call]) => ({
      ...call,
      arguments: call.arguments || "{}",
    }));
  if (toolCalls.some(({ id, name }) => !id || !name)) {
    throw new Error(
      "MiniMax Anthropic stream ended with an incomplete tool-call batch."
    );
  }
  if (!messageStopped) {
    throw new Error(
      "MiniMax Anthropic stream ended before the message_stop marker."
    );
  }
  const completedAt = performance.now();
  return {
    content,
    toolCalls,
    finishReason,
    usage,
    observability: trace
      ? ({
          transport: "stream",
          httpStatus: response.status,
          requestBytes: trace.requestBytes,
          messageBytes: trace.messageBytes,
          toolSchemaBytes: trace.toolSchemaBytes,
          decisionCapsuleBytes: trace.decisionCapsuleBytes,
          stableToolHash: trace.stableToolHash,
          stableSystemHash: trace.stableSystemHash,
          stableMessagePrefixHash: trace.stableMessagePrefixHash,
          cacheBreakReason: trace.cacheBreakReason,
          cacheBoundaryKind: trace.cacheBoundaryKind,
          cacheBoundaryFound: trace.cacheBoundaryFound,
          cacheMarkerCount: trace.cacheMarkerCount,
          terminalRunStaticLayerBytes: trace.terminalRunStaticLayerBytes,
          terminalRunStaticLayerHash: trace.terminalRunStaticLayerHash,
          terminalCandidateVersionLayerBytes:
            trace.terminalCandidateVersionLayerBytes,
          terminalCandidateVersionLayerHash:
            trace.terminalCandidateVersionLayerHash,
          terminalDynamicDeltaLayerBytes: trace.terminalDynamicDeltaLayerBytes,
          terminalDynamicDeltaLayerHash: trace.terminalDynamicDeltaLayerHash,
          estimatedInputTokens: trace.estimatedInputTokens,
          responseBytes,
          responseHeaderLatencyMs: trace.responseAt - startedAt,
          ...(firstChunkAt
            ? { firstChunkLatencyMs: firstChunkAt - startedAt }
            : {}),
          ...(firstOutputAt
            ? { firstOutputLatencyMs: firstOutputAt - startedAt }
            : {}),
          ...(lastChunkAt
            ? { lastChunkLatencyMs: lastChunkAt - startedAt }
            : {}),
          providerDurationMs: completedAt - startedAt,
          streamCompleted: true,
          doneMarkerReceived: messageStopped,
          partialContentChars: content.length,
          partialToolCallCount: toolCalls.length,
          retryCount: trace.retryCount,
          contentChars: content.length,
          contentBytes: Buffer.byteLength(content, "utf8"),
          toolArgumentBytes: toolCalls.reduce(
            (sum, call) => sum + Buffer.byteLength(call.arguments, "utf8"),
            0
          ),
          reasoningTokensAvailable: false,
        } as NonNullable<ModelTurnOutput["observability"]> &
          PromptCacheLayerObservabilityV95)
      : undefined,
  };
};

const redactProviderError = (value: string) =>
  value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1_000);

const providerHttpError = async (
  response: Response,
  label = "MiniMax request"
) => {
  const detail = redactProviderError(await response.text().catch(() => ""));
  const error = new Error(
    `${label} failed with HTTP ${response.status}${
      detail ? `: ${detail}` : "."
    }`
  );
  return Object.assign(error, {
    code:
      response.status === 401 || response.status === 403
        ? "provider_configuration_error"
        : response.status >= 400 &&
          response.status < 500 &&
          response.status !== 429
        ? "provider_protocol_error"
        : "provider_unavailable",
    httpStatus: response.status,
  });
};

type StreamDiagnostics = Pick<
  NonNullable<ModelTurnOutput["observability"]>,
  | "transport"
  | "httpStatus"
  | "requestBytes"
  | "messageBytes"
  | "toolSchemaBytes"
  | "estimatedInputTokens"
  | "responseBytes"
  | "responseHeaderLatencyMs"
  | "firstChunkLatencyMs"
  | "firstOutputLatencyMs"
  | "lastChunkLatencyMs"
  | "providerDurationMs"
  | "streamCompleted"
  | "doneMarkerReceived"
  | "partialContentChars"
  | "partialToolCallCount"
  | "retryCount"
>;

export type ModelStreamError = Error & {
  streamDiagnostics?: StreamDiagnostics;
  timedOut?: boolean;
};

export const readStreamingOutput = async (
  response: Response,
  onContentDelta?: ModelTurnInput["onContentDelta"],
  trace?: {
    startedAt: number;
    responseAt: number;
    startedAtMonotonic?: number;
    responseAtMonotonic?: number;
    requestBytes: number;
    messageBytes: number;
    toolSchemaBytes: number;
    estimatedInputTokens: number;
    retryCount: number;
  },
  requestSignal?: AbortSignal
): Promise<ModelTurnOutput> => {
  if (!response.body) throw new Error("MiniMax returned no streaming body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const calls = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();
  let sourceBuffer = "";
  let content = "";
  let finishReason: string | undefined;
  let usage: ModelTurnOutput["usage"];
  let responseBytes = 0;
  let firstChunkAt: number | undefined;
  let firstOutputAt: number | undefined;
  let lastChunkAt: number | undefined;
  let doneMarkerReceived = false;
  const traceStartedAt = trace?.startedAtMonotonic ?? performance.now();
  const traceResponseAt =
    trace?.responseAtMonotonic ??
    traceStartedAt +
      Math.max(0, (trace?.responseAt || 0) - (trace?.startedAt || 0));
  const consumeLine = async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("event:")) return;
    const raw = trimmed.startsWith("data:")
      ? trimmed.slice(5).trim()
      : trimmed.startsWith("{")
      ? trimmed
      : "";
    if (!raw) return;
    if (raw === "[DONE]") {
      doneMarkerReceived = true;
      return;
    }
    const payload = JSON.parse(raw) as {
      choices?: Array<{
        delta?: {
          content?: unknown;
          tool_calls?: Array<{
            index?: unknown;
            id?: unknown;
            function?: { name?: unknown; arguments?: unknown };
          }>;
        };
        finish_reason?: unknown;
      }>;
      usage?: {
        prompt_tokens?: unknown;
        completion_tokens?: unknown;
        completion_tokens_details?: { reasoning_tokens?: unknown };
      };
    };
    const choice = payload.choices?.[0];
    const delta = choice?.delta;
    if (typeof delta?.content === "string" && delta.content) {
      firstOutputAt ||= performance.now();
      content += delta.content;
      await onContentDelta?.(delta.content);
    }
    for (const rawCall of delta?.tool_calls || []) {
      firstOutputAt ||= performance.now();
      const index =
        typeof rawCall.index === "number" ? rawCall.index : calls.size;
      const current = calls.get(index) || { id: "", name: "", arguments: "" };
      if (typeof rawCall.id === "string") current.id += rawCall.id;
      if (typeof rawCall.function?.name === "string") {
        current.name += rawCall.function.name;
      }
      if (typeof rawCall.function?.arguments === "string") {
        current.arguments += rawCall.function.arguments;
      }
      calls.set(index, current);
    }
    if (typeof choice?.finish_reason === "string") {
      finishReason = choice.finish_reason;
    }
    if (payload.usage) {
      usage = {
        promptTokens:
          typeof payload.usage.prompt_tokens === "number"
            ? payload.usage.prompt_tokens
            : undefined,
        uncachedInputTokens:
          typeof payload.usage.prompt_tokens === "number"
            ? payload.usage.prompt_tokens
            : undefined,
        totalInputTokens:
          typeof payload.usage.prompt_tokens === "number"
            ? payload.usage.prompt_tokens
            : undefined,
        cacheStatus: "unsupported",
        completionTokens:
          typeof payload.usage.completion_tokens === "number"
            ? payload.usage.completion_tokens
            : undefined,
        reasoningTokens:
          typeof payload.usage.completion_tokens_details?.reasoning_tokens ===
          "number"
            ? payload.usage.completion_tokens_details.reasoning_tokens
            : undefined,
      };
    }
  };

  const diagnostics = (completedAt: number): StreamDiagnostics => ({
    transport: "stream",
    httpStatus: response.status,
    requestBytes: trace?.requestBytes || 0,
    messageBytes: trace?.messageBytes || 0,
    toolSchemaBytes: trace?.toolSchemaBytes || 0,
    estimatedInputTokens: trace?.estimatedInputTokens || 0,
    responseBytes,
    responseHeaderLatencyMs: trace ? traceResponseAt - traceStartedAt : 0,
    ...(firstChunkAt && trace
      ? { firstChunkLatencyMs: firstChunkAt - traceStartedAt }
      : {}),
    ...(firstOutputAt && trace
      ? { firstOutputLatencyMs: firstOutputAt - traceStartedAt }
      : {}),
    ...(lastChunkAt && trace
      ? { lastChunkLatencyMs: lastChunkAt - traceStartedAt }
      : {}),
    providerDurationMs: trace ? completedAt - traceStartedAt : 0,
    streamCompleted: false,
    doneMarkerReceived,
    partialContentChars: content.length,
    partialToolCallCount: calls.size,
    retryCount: trace?.retryCount || 0,
  });

  let removeAbortListener = () => {};
  const aborted = requestSignal
    ? new Promise<never>((_resolve, reject) => {
        const rejectWithSignalReason = () =>
          reject(
            requestSignal.reason ||
              Object.assign(new Error("Model stream request was aborted."), {
                name: "AbortError",
              })
          );
        if (requestSignal.aborted) {
          rejectWithSignalReason();
          return;
        }
        requestSignal.addEventListener("abort", rejectWithSignalReason, {
          once: true,
        });
        removeAbortListener = () => {
          requestSignal.removeEventListener("abort", rejectWithSignalReason);
        };
      })
    : null;

  try {
    while (true) {
      const { value, done } = await (aborted
        ? Promise.race([reader.read(), aborted])
        : reader.read());
      if (value?.length) {
        const receivedAt = performance.now();
        firstChunkAt ||= receivedAt;
        lastChunkAt = receivedAt;
        responseBytes += value.length;
      }
      sourceBuffer += decoder.decode(value, { stream: !done });
      const lines = sourceBuffer.split(/\r?\n/);
      sourceBuffer = done ? "" : lines.pop() || "";
      for (const line of lines) await consumeLine(line);
      if (done) break;
    }
    if (sourceBuffer.trim()) await consumeLine(sourceBuffer);
  } catch (error) {
    void reader.cancel(error).catch(() => undefined);
    const streamError = new Error(
      `MiniMax SSE stream interrupted before completion: ${
        error instanceof Error ? error.message : String(error)
      }`
    ) as ModelStreamError;
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      streamError.name = error.name;
      streamError.timedOut = true;
    }
    streamError.cause = error;
    streamError.streamDiagnostics = diagnostics(performance.now());
    throw streamError;
  } finally {
    removeAbortListener();
  }

  if (!doneMarkerReceived && !finishReason) {
    const streamError = new Error(
      "MiniMax SSE stream ended without a completion marker."
    ) as ModelStreamError;
    streamError.streamDiagnostics = diagnostics(performance.now());
    throw streamError;
  }

  const assembledToolCalls = Array.from(calls.entries())
    .sort(([left], [right]) => left - right)
    .map(([, call]) => call);
  if (finishReason === "tool_calls" && assembledToolCalls.length === 0) {
    const streamError = new Error(
      "MiniMax SSE stream declared tool calls without a tool-call batch."
    ) as ModelStreamError;
    streamError.streamDiagnostics = {
      ...diagnostics(performance.now()),
      streamCompleted: true,
    };
    throw streamError;
  }
  if (assembledToolCalls.some((call) => !call.id || !call.name)) {
    const streamError = new Error(
      "MiniMax SSE stream ended with an incomplete tool-call batch."
    ) as ModelStreamError;
    streamError.streamDiagnostics = {
      ...diagnostics(performance.now()),
      streamCompleted: true,
    };
    throw streamError;
  }
  if (
    new Set(assembledToolCalls.map(({ id }) => id)).size !==
    assembledToolCalls.length
  ) {
    const streamError = new Error(
      "MiniMax SSE stream ended with duplicate tool-call IDs."
    ) as ModelStreamError;
    streamError.streamDiagnostics = {
      ...diagnostics(performance.now()),
      streamCompleted: true,
    };
    throw streamError;
  }
  const toolCalls = assembledToolCalls;
  const completedAt = performance.now();
  return {
    content,
    toolCalls,
    finishReason,
    usage,
    ...(trace
      ? {
          observability: {
            transport: "stream" as const,
            httpStatus: response.status,
            requestBytes: trace.requestBytes,
            messageBytes: trace.messageBytes,
            toolSchemaBytes: trace.toolSchemaBytes,
            estimatedInputTokens: trace.estimatedInputTokens,
            responseBytes,
            responseHeaderLatencyMs: traceResponseAt - traceStartedAt,
            ...(firstChunkAt
              ? { firstChunkLatencyMs: firstChunkAt - traceStartedAt }
              : {}),
            ...(firstOutputAt
              ? { firstOutputLatencyMs: firstOutputAt - traceStartedAt }
              : {}),
            ...(lastChunkAt
              ? { lastChunkLatencyMs: lastChunkAt - traceStartedAt }
              : {}),
            providerDurationMs: completedAt - traceStartedAt,
            streamCompleted: true,
            doneMarkerReceived,
            partialContentChars: content.length,
            partialToolCallCount: toolCalls.length,
            retryCount: trace.retryCount,
            contentChars: content.length,
            contentBytes: Buffer.byteLength(content, "utf8"),
            toolArgumentBytes: toolCalls.reduce(
              (sum, call) => sum + Buffer.byteLength(call.arguments, "utf8"),
              0
            ),
            reasoningTokensAvailable:
              typeof usage?.reasoningTokens === "number",
          },
        }
      : {}),
  };
};

const completeAnthropicMiniMaxTurn = async (
  input: ModelTurnInput,
  runtimeInfo: ModelRuntimeInfo,
  apiKey: string
) => {
  const projected = buildMiniMaxAnthropicCacheProjection(input);
  const apiUrl = runtimeInfo.requestUrl;
  if (!apiUrl) {
    throw new Error("MiniMax Anthropic request URL is not configured.");
  }
  const requestBody = JSON.stringify({
    model: runtimeInfo.model,
    ...(projected.system ? { system: projected.system } : {}),
    messages: projected.messages,
    ...(input.tools.length
      ? {
          tools: projected.tools,
          tool_choice:
            typeof input.toolChoice === "object"
              ? { type: "tool", name: input.toolChoice.name }
              : input.toolChoice === "required"
              ? { type: "any" }
              : { type: "auto" },
        }
      : {}),
    max_tokens: Math.min(
      Math.max(input.maxTokens || AGENT_HARNESS_MAX_COMPLETION_TOKENS, 1),
      AGENT_HARNESS_MAX_COMPLETION_TOKENS
    ),
    temperature: 0.2,
    stream: true,
  });
  const startedAt = performance.now();
  const { response, retryCount, requestSignal } = await fetchModelResponse(
    apiUrl,
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: requestBody,
    },
    {
      timeoutMs: input.timeoutMs,
      totalAttemptBudgetMs: input.totalAttemptBudgetMs,
      abortSignal: input.abortSignal,
      onProviderAttemptStart: input.onProviderAttemptStart,
      onProviderAttemptFinish: input.onProviderAttemptFinish,
    }
  );
  const responseAt = performance.now();
  if (!response.ok) {
    throw await providerHttpError(response, "MiniMax Anthropic request");
  }
  return readAnthropicStreamingOutput(
    response,
    input.onContentDelta,
    {
      startedAt,
      responseAt,
      requestBytes: Buffer.byteLength(requestBody, "utf8"),
      messageBytes: Buffer.byteLength(
        JSON.stringify(projected.messages),
        "utf8"
      ),
      toolSchemaBytes: Buffer.byteLength(
        JSON.stringify(projected.tools),
        "utf8"
      ),
      estimatedInputTokens: estimateModelInputTokens(
        input.messages,
        input.tools
      ),
      retryCount,
      ...projected.observability,
    },
    requestSignal
  );
};

export class MiniMaxHarnessModelProvider implements HarnessModelProvider {
  readonly info: Readonly<ModelRuntimeInfo>;
  readonly visualInfo: Readonly<ModelRuntimeInfo>;
  readonly supportsGoalContracts = true;
  readonly supportsProviderAttemptHooks = true;
  readonly supportsVisualAttemptHooks = true;
  readonly governedProviderAttemptAccounting = Object.freeze({
    contractVersion: V95_GOVERNED_PROVIDER_ATTEMPT_ACCOUNTING_CONTRACT_VERSION,
    authority: "v9_runtime_store_budget_controller" as const,
    reservationPolicy:
      "conservative_full_input_and_requested_output_per_attempt" as const,
    settlementBeforeNextAttempt: true as const,
  });
  private readonly actorApiKey: string | null;
  private readonly visualApiKey: string | null;

  constructor() {
    // Endpoint, model, protocol and tier form one immutable transport identity.
    // Requests below use these snapshots and never re-read mutable env values.
    const profile = resolveHarnessModelProfile();
    const visualProfile = resolveHarnessVisionModelProfile();
    this.info = Object.freeze({ ...profile.info });
    this.actorApiKey = profile.apiKey;
    this.visualInfo = Object.freeze({ ...visualProfile.info });
    this.visualApiKey = visualProfile.apiKey;
  }

  async completeTurn(input: ModelTurnInput) {
    assertModelInputBudget(input);
    const apiKey = this.actorApiKey;
    if (!apiKey) throw new Error("MiniMax model API key is not configured.");
    if (this.info.protocol === "anthropic_messages") {
      return completeAnthropicMiniMaxTurn(input, this.info, apiKey);
    }
    const apiUrl = this.info.requestUrl;
    if (!apiUrl)
      throw new Error("MiniMax model request URL is not configured.");
    const requestBody = JSON.stringify({
      model: this.info.model,
      ...(supportsMiniMaxThinkingControl(this.info.model)
        ? {
            thinking: {
              type: input.thinking || "adaptive",
            },
          }
        : {}),
      messages: input.messages.map(toMiniMaxMessage),
      ...(input.tools.length
        ? {
            tools: input.tools.map((tool) => ({
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema,
              },
            })),
            tool_choice:
              typeof input.toolChoice === "object"
                ? {
                    type: "function",
                    function: { name: input.toolChoice.name },
                  }
                : input.toolChoice || "auto",
          }
        : {}),
      max_completion_tokens: Math.min(
        Math.max(input.maxTokens || AGENT_HARNESS_MAX_COMPLETION_TOKENS, 1),
        AGENT_HARNESS_MAX_COMPLETION_TOKENS
      ),
      temperature: 0.2,
      stream: true,
      stream_options: { include_usage: true },
    });
    const startedAt = Date.now();
    const startedAtMonotonic = performance.now();
    const { response, retryCount, requestSignal } = await fetchModelResponse(
      apiUrl,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
      },
      {
        timeoutMs: input.timeoutMs,
        totalAttemptBudgetMs: input.totalAttemptBudgetMs,
        abortSignal: input.abortSignal,
        onProviderAttemptStart: input.onProviderAttemptStart,
        onProviderAttemptFinish: input.onProviderAttemptFinish,
      }
    );
    const responseAt = Date.now();
    const responseAtMonotonic = performance.now();
    if (!response.ok) {
      throw await providerHttpError(response);
    }
    return readStreamingOutput(
      response,
      input.onContentDelta,
      {
        startedAt,
        responseAt,
        startedAtMonotonic,
        responseAtMonotonic,
        requestBytes: Buffer.byteLength(requestBody, "utf8"),
        messageBytes: Buffer.byteLength(JSON.stringify(input.messages), "utf8"),
        toolSchemaBytes: Buffer.byteLength(JSON.stringify(input.tools), "utf8"),
        estimatedInputTokens: estimateModelInputTokens(
          input.messages,
          input.tools
        ),
        retryCount,
      },
      requestSignal
    );
  }

  async analyzeReferenceImages(input: {
    prompt: string;
    images: Array<{ mediaType: "image/jpeg" | "image/png"; bytes: Uint8Array }>;
    maxTokens?: number;
    timeoutMs?: number;
    totalAttemptBudgetMs?: number;
    abortSignal?: AbortSignal;
    onProviderAttemptStart?: ModelTurnInput["onProviderAttemptStart"];
    onProviderAttemptFinish?: ModelTurnInput["onProviderAttemptFinish"];
  }) {
    const apiKey = this.visualApiKey;
    if (!apiKey) throw new Error("MiniMax model API key is not configured.");
    const apiUrl = this.visualInfo.requestUrl;
    if (!apiUrl)
      throw new Error("MiniMax visual request URL is not configured.");
    const requestBody = JSON.stringify({
      model: this.visualInfo.model,
      ...(supportsMiniMaxThinkingControl(this.visualInfo.model)
        ? { thinking: { type: "disabled" as const } }
        : {}),
      messages: [
        {
          role: "system",
          content:
            "Analyze reference-page screenshots. Return only compact JSON and never expose chain-of-thought.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: input.prompt },
            ...input.images.slice(0, 4).map((image) => ({
              type: "image_url",
              image_url: {
                url: `data:${image.mediaType};base64,${Buffer.from(
                  image.bytes
                ).toString("base64")}`,
                detail: "high",
              },
            })),
          ],
        },
      ],
      max_completion_tokens: Math.min(
        Math.max(
          input.maxTokens || AGENT_HARNESS_VISUAL_MAX_COMPLETION_TOKENS,
          1
        ),
        AGENT_HARNESS_VISUAL_MAX_COMPLETION_TOKENS
      ),
      temperature: 0.1,
    });
    const startedAt = Date.now();
    const startedAtMonotonic = performance.now();
    const { response, retryCount } = await fetchModelResponse(
      apiUrl,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
      },
      {
        timeoutMs: input.timeoutMs,
        totalAttemptBudgetMs: input.totalAttemptBudgetMs,
        abortSignal: input.abortSignal,
        onProviderAttemptStart: input.onProviderAttemptStart,
        onProviderAttemptFinish: input.onProviderAttemptFinish,
      }
    );
    const responseAt = Date.now();
    const responseAtMonotonic = performance.now();
    if (!response.ok) {
      throw await providerHttpError(response, "MiniMax visual analysis");
    }
    const responseText = await response.text();
    const completedAt = Date.now();
    const completedAtMonotonic = performance.now();
    const output = readOutput(JSON.parse(responseText));
    return {
      ...output,
      observability: {
        transport: "json" as const,
        httpStatus: response.status,
        requestBytes: Buffer.byteLength(requestBody, "utf8"),
        messageBytes: Buffer.byteLength(requestBody, "utf8"),
        toolSchemaBytes: 0,
        estimatedInputTokens: Math.ceil(
          (Buffer.byteLength(input.prompt, "utf8") +
            input.images.reduce((sum, image) => sum + image.bytes.length, 0)) /
            3
        ),
        promptBytes: Buffer.byteLength(input.prompt, "utf8"),
        imageCount: input.images.length,
        imageBytes: input.images.reduce(
          (sum, image) => sum + image.bytes.length,
          0
        ),
        responseBytes: Buffer.byteLength(responseText, "utf8"),
        responseHeaderLatencyMs: responseAtMonotonic - startedAtMonotonic,
        firstChunkLatencyMs: responseAtMonotonic - startedAtMonotonic,
        firstOutputLatencyMs: responseAtMonotonic - startedAtMonotonic,
        providerDurationMs: completedAtMonotonic - startedAtMonotonic,
        contentChars: output.content.length,
        contentBytes: Buffer.byteLength(output.content, "utf8"),
        toolArgumentBytes: 0,
        reasoningTokensAvailable: false as const,
        retryCount,
      },
    };
  }
}

export const supportsMiniMaxThinkingControl = (model: string) =>
  /^minimax-m3/iu.test(model.trim());

export const createHarnessModelProvider = (): HarnessModelProvider =>
  new MiniMaxHarnessModelProvider();
