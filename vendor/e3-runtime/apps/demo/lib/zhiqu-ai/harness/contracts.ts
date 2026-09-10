export const AGENT_HARNESS_CONTRACT_VERSION = "agent-harness-v0.9.0" as const;
export const AGENT_HARNESS_SCHEMA_VERSION = 3 as const;
export const AGENT_HARNESS_CONTEXT_TOKEN_BUDGET = 192_000 as const;
export const AGENT_HARNESS_MAX_COMPLETION_TOKENS = 32_768 as const;
export const AGENT_HARNESS_VISUAL_MAX_COMPLETION_TOKENS = 16_384 as const;
export const HARNESS_TRACE_CONTRACT_VERSION = "harness-trace-v1" as const;
export const AGENT_HARNESS_V4_CONTRACT_VERSION =
  "agent-harness-v4" as const;

export type HarnessToolCapability = {
  name: string;
  category: "observe" | "plan" | "execute" | "evaluate" | "repair";
  sideEffect: "none" | "review_draft";
  idempotent: boolean;
  estimatedCost: "low" | "medium" | "high";
  prerequisite: string;
  outputContract: string;
};

export type ThreadStatus = "active" | "archived";
export type MessageRole = "user" | "assistant" | "system" | "tool";
export type RunStatus =
  | "queued"
  | "understanding"
  | "gathering_context"
  | "executing"
  | "validating"
  | "evaluating_goal"
  | "stopped"
  // Legacy V4 states remain readable for persisted runs and old fixtures.
  | "packing_context"
  | "planning"
  | "tool_execution"
  | "observing"
  | "rendering"
  | "evaluating"
  | "repairing"
  | "completed"
  | "awaiting_user"
  | "ready_for_review"
  | "failed"
  | "cancelled";

export type ArtifactStatus =
  | "none"
  | "draft_invalid"
  | "draft_valid"
  | "ready_for_review";

export type GoalStatus =
  | "unknown"
  | "in_progress"
  | "satisfied"
  | "partial"
  | "not_satisfied"
  | "needs_clarification"
  | "not_applicable";

export type PageVersionStatus = "draft" | "reviewed" | "superseded";

export type HarnessError = {
  code: string;
  message: string;
  retryable: boolean;
  stage?: RunStatus;
};

export type Thread = {
  contractVersion: typeof AGENT_HARNESS_CONTRACT_VERSION;
  id: string;
  title: string;
  status: ThreadStatus;
  summary: string | null;
  currentPageVersionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: string;
  threadId: string;
  runId: string | null;
  role: MessageRole;
  content: string;
  createdAt: string;
};

export type Run = {
  contractVersion: typeof AGENT_HARNESS_CONTRACT_VERSION;
  id: string;
  threadId: string;
  triggerMessageId: string;
  status: RunStatus;
  iteration: number;
  maxTurns: number;
  contextPackHash: string | null;
  currentCheckpointId: string | null;
  attempt: number;
  workerId: string | null;
  leaseExpiresAt: string | null;
  cancellationRequested: boolean;
  error: HarnessError | null;
  artifactStatus: ArtifactStatus;
  goalStatus: GoalStatus;
  goalSpecArtifactId: string | null;
  goalJudgmentArtifactId: string | null;
  baselineVersionId: string | null;
  baselineHash: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type ContextPack = {
  contractVersion: typeof AGENT_HARNESS_CONTRACT_VERSION;
  runId: string;
  threadId: string;
  currentUserMessage: string;
  recentMessages: Array<Pick<Message, "id" | "role" | "content" | "createdAt">>;
  threadSummary: string | null;
  currentPage: {
    versionId: string;
    pageId: string;
    componentCount: number;
    componentTypes: string[];
  } | null;
  currentReference: {
    artifactId: string;
    snapshotId: string;
    sourceUrl: string;
    title: string;
    sectionCount: number;
    assetCount: number;
    visualStatus: string;
  } | null;
  recentErrors: HarnessError[];
  componentSkill: Record<string, unknown>;
  allowedTools: string[];
  toolCapabilities?: HarnessToolCapability[];
  budgets: {
    maxTurns: number;
    maxPageVersions: number;
    maxInputTokens: typeof AGENT_HARNESS_CONTEXT_TOKEN_BUDGET;
    maxCompletionTokens: typeof AGENT_HARNESS_MAX_COMPLETION_TOKENS;
  };
  createdAt: string;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /**
   * Explicit acceptance effects advertised by this exact Tool definition.
   * Absence means no acceptance capability may be inferred from the Tool name.
   */
  acceptanceCapabilityFamilies?: HarnessAcceptanceCapabilityFamily[];
};

export const HARNESS_ACCEPTANCE_CAPABILITY_FAMILIES = [
  "material_read",
  "candidate_structure",
  "source_content",
  "source_asset",
  "authored_props",
  "component_visual",
  "root_visual",
] as const;

export type HarnessAcceptanceCapabilityFamily =
  (typeof HARNESS_ACCEPTANCE_CAPABILITY_FAMILIES)[number];

export type ModelToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ModelMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: ModelToolCall[];
};

export type ModelTurnInput = {
  messages: ModelMessage[];
  tools: ToolDefinition[];
  toolChoice?: "auto" | "required" | { name: string };
  thinking?: "adaptive" | "disabled" | "enabled";
  maxTokens?: number;
  timeoutMs?: number;
  totalAttemptBudgetMs?: number;
  abortSignal?: AbortSignal;
  onContentDelta?: (delta: string) => void | Promise<void>;
  onProviderAttemptStart?: (input: {
    attemptIndex: number;
  }) => Promise<{ attemptId: string }>;
  onProviderAttemptFinish?: (input: {
    attemptId: string;
    attemptIndex: number;
    status: "response" | "network_error" | "cancelled";
    httpStatus: number | null;
    errorCode: string | null;
    retryAfterSeconds?: number | null;
    durationMs: number;
  }) => Promise<void>;
};

export type ModelTurnOutput = {
  content: string;
  toolCalls: ModelToolCall[];
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    uncachedInputTokens?: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
    totalInputTokens?: number;
    cacheStatus?: "reported" | "unreported" | "unsupported";
    completionTokens?: number;
    reasoningTokens?: number;
  };
  observability?: ModelProviderObservability;
};

export type HarnessModelRole =
  | "actor"
  | "goal_interpreter"
  | "goal_judge"
  | "visual_planner"
  | "visual_critic";

export type ModelProviderObservability = {
  transport: "stream" | "json";
  httpStatus: number;
  requestBytes: number;
  messageBytes: number;
  toolSchemaBytes: number;
  decisionCapsuleBytes?: number;
  stableToolHash?: string;
  stableSystemHash?: string;
  stableMessagePrefixHash?: string;
  cacheBreakReason?: string;
  estimatedInputTokens: number;
  promptBytes?: number;
  imageCount?: number;
  imageBytes?: number;
  responseBytes: number;
  responseHeaderLatencyMs: number;
  firstChunkLatencyMs?: number;
  firstOutputLatencyMs?: number;
  lastChunkLatencyMs?: number;
  providerDurationMs: number;
  streamCompleted?: boolean;
  doneMarkerReceived?: boolean;
  partialContentChars?: number;
  partialToolCallCount?: number;
  retryCount?: number;
  contentChars: number;
  contentBytes: number;
  toolArgumentBytes: number;
  reasoningTokensAvailable: boolean;
};

export type HarnessTraceCorrelation = {
  runId: string;
  threadId: string;
  turn?: number;
  iteration: number;
  modelRole?: HarnessModelRole;
  modelCallId?: string;
  toolCallId?: string;
  pageVersionBefore?: string | null;
  pageVersionAfter?: string | null;
};

export type HarnessModelCallTrace = {
  contractVersion: typeof HARNESS_TRACE_CONTRACT_VERSION;
  spanId: string;
  parentSpanId: string;
  operation: "model.complete" | "model.visual_analysis";
  correlation: HarnessTraceCorrelation;
  provider: ModelRuntimeInfo;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: "ok" | "error";
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  anomalies: string[];
  privacy: {
    rawPromptStored: false;
    rawReasoningStored: false;
    toolArgumentsStored: "summary_only";
  };
};

export type HarnessToolCallTrace = {
  contractVersion: typeof HARNESS_TRACE_CONTRACT_VERSION;
  spanId: string;
  parentSpanId: string;
  operation: "tool.execute";
  correlation: HarnessTraceCorrelation;
  tool: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: "ok" | "error";
  occurrence: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  createdArtifactIds: string[];
  anomalies: string[];
};

export type HarnessLoopObservation = {
  contractVersion: typeof HARNESS_TRACE_CONTRACT_VERSION;
  spanId: string;
  parentSpanId: string;
  correlation: HarnessTraceCorrelation;
  observedAt: string;
  tool: string;
  outcome: "success" | "failure";
  evidence: Record<string, unknown>;
  availableNextActions: string[];
  budget: {
    maxTurns: number;
    completedTurn: number;
    maxPageVersions: number;
    pageVersionsUsed: number;
    exhausted: boolean;
  };
  progress: {
    pageVersionChanged: boolean;
    newArtifactCount: number;
    repeatedToolCall: boolean;
  };
};

export type AgentFinalDecision = {
  decision: "complete" | "ask_user" | "reject";
  taskType: "conversation" | "page_task";
  userMessage: string;
};

export type ToolExecutionResult = {
  ok: boolean;
  output: Record<string, unknown>;
};

export type RunEvent = {
  id: string;
  runId: string;
  threadId: string;
  seq: number;
  type: string;
  stage: RunStatus;
  label: string;
  publicDetails: Record<string, unknown> | null;
  createdAt: string;
};

export type Checkpoint = {
  id: string;
  runId: string;
  step: string;
  state: Record<string, unknown>;
  stateHash: string;
  createdAt: string;
};

export type Artifact = {
  id: string;
  threadId: string;
  runId: string;
  kind: string;
  path: string;
  sha256: string;
  bytes: number;
  contentType: string;
  createdAt: string;
};

export type PageVersion = {
  id: string;
  threadId: string;
  runId: string;
  parentVersionId: string | null;
  pageId: string;
  dataArtifactId: string;
  screenshotArtifactId: string | null;
  diffArtifactId: string | null;
  evaluationArtifactId: string | null;
  status: PageVersionStatus;
  createdAt: string;
};

export type ThreadDetail = Thread & {
  messages: Message[];
  runs: Run[];
  pageVersions: PageVersion[];
};

export type CreateThreadInput = { title?: string };
export type CreateTurnInput = { content: string; maxTurns?: number };
export type CreateTurnResult = {
  thread: Thread;
  message: Message;
  run: Run;
  event: RunEvent;
  checkpoint: Checkpoint;
};

export type ModelProviderName = "minimax" | "fixture";
export type ModelRuntimeInfo = {
  provider: ModelProviderName;
  profileId?: "primary" | "secondary" | "legacy" | "fixture";
  model: string;
  baseUrl: string;
  requestUrl?: string;
  configured: boolean;
  protocol?: "openai_chat_completions" | "anthropic_messages" | "fixture";
  serviceTier?: "standard" | "priority" | "fixture";
};
