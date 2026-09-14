import { randomUUID } from "node:crypto";

import {
  ReadOnlyRunLoop,
  type ReadOnlyModelStepCheckpointGate,
  type ReadOnlyRunIds,
  type ReadOnlyRunModelPort,
} from "../../../packages/agent-runtime/index.js";
import type { JsonValue } from "../../../packages/model-protocol/contracts.js";
import type { ProviderId, InvocationIdInput } from "../../../packages/providers/contracts.js";
import type {
  OpenAiCompatibleRequestTool,
  OpenAiCompatibleTransport,
} from "../../../packages/providers/openai-compatible-transport.js";
import type { InvocationReconciliationRecord, SessionStorePort, StoredRunCommand } from "../../../packages/session-store/contracts.js";
import {
  assertPersistableText,
  canonicalRunCommandRequestHash,
  hashBytes,
  hashJson,
} from "../../../packages/session-store/index.js";
import {
  createReadOnlyWorkspaceTools,
  normalizeReadOnlyWorkspaceToolArguments,
  READ_ONLY_WORKSPACE_TOOL_DEFINITIONS,
  type PrivateToolArtifactWriter,
  type ReadOnlyWorkspaceToolExecution,
} from "../../../packages/tool-runtime/index.js";
import type { ToolCatalogSnapshot, ToolDefinition } from "../../../packages/tool-runtime/contracts.js";
import { createWorkspaceHost, type WorkspaceRoots } from "../../../packages/workspace-host/index.js";
import {
  turnCommandHttpStatus,
  TURN_COMMAND_ERROR_SCHEMA_VERSION,
  TURN_COMMAND_RESPONSE_SCHEMA_VERSION,
  type TurnCommandErrorCode,
  type TurnCommandRequest,
  type TurnCommandResponse,
} from "../api-contracts/turn-command.js";
import type { TurnCommandSubmission } from "./server.js";

const LOCAL_PRINCIPAL_ID = "local-user";
const WORKER_OWNER_ID = "server-worker";
const POLICY_VERSION = "m0-read-only-policy-v1";
const INTENT_REVISION = 1;
const LEASE_TTL_MS = 60_000;
const MAX_MODEL_STEPS = 4;
const CATALOG_VERSION = "m0-read-only-workspace-tools-v1";
const MODEL_STEP_OUTCOME_UNKNOWN_CODE = "model_step_outcome_unknown";
const MODEL_STEP_OUTCOME_UNKNOWN_MESSAGE = "模型步骤结果未知，已停止自动重发 Provider 请求。";
const MODEL_STEP_OUTCOME_UNKNOWN_ACTIONS = ["从持久化事件、Provider 幂等查询或后续恢复快照确认结果后再继续。"] as const;
const TOOL_INVOCATION_OUTCOME_UNKNOWN_CODE = "tool_invocation_outcome_unknown";
const TOOL_INVOCATION_OUTCOME_UNKNOWN_MESSAGE = "工具执行结果未知，已停止自动重放。";
const TOOL_INVOCATION_OUTCOME_UNKNOWN_ACTIONS = ["先通过 Host readback 或恢复协调器确认工具结果。"] as const;
const TOOL_RECEIPT_RECOVERY_REQUIRED_CODE = "tool_receipt_recovery_required";
const TOOL_RECEIPT_RECOVERY_REQUIRED_MESSAGE = "工具回执已持久化，但执行器在后续收口前中断，已停止自动续跑。";
const TOOL_RECEIPT_RECOVERY_REQUIRED_ACTIONS = ["请通过恢复协调器核验 Receipt 绑定事件与后续模型步骤后再继续。"] as const;
const RECEIPT_PUBLIC_EVENT_BINDING_INVALID_CODE = "receipt_public_event_binding_invalid";
const RECEIPT_PUBLIC_EVENT_BINDING_INVALID_MESSAGE = "发现既有工具回执缺少或损坏公开事件绑定，已停止自动续跑。";
const RECEIPT_PUBLIC_EVENT_BINDING_INVALID_ACTIONS = ["请通过恢复协调器核验或迁移该 Receipt 的公开投影。"] as const;

export type TurnCommandIds = ReadOnlyRunIds & Readonly<{
  nextSessionId(): string;
  nextTurnId(): string;
  nextRunId(): string;
  nextAttemptId(): string;
  nextArtifactId(): string;
  nextVerificationId(): string;
}>;

export type TurnCommandSubmitterOptions = Readonly<{
  store: SessionStorePort;
  workspaceRoots: WorkspaceRoots;
  model: ReadOnlyRunModelPort;
  ids?: TurnCommandIds;
  now?: () => string;
  localPrincipalId?: string;
  ownerId?: string;
  policyVersion?: string;
  leaseTtlMs?: number;
  intentRevision?: number;
  maxModelSteps?: number;
  defer?: (run: () => Promise<void>) => void;
}>;

export type ProviderBackedModelOptions = Readonly<{
  provider: ProviderId;
  transport: OpenAiCompatibleTransport;
  catalog: ToolCatalogSnapshot;
  now: () => string;
}>;

const prefixedUuid = (prefix: string): string => `${prefix}:${randomUUID()}`;

export const createDefaultTurnCommandIds = (): TurnCommandIds => ({
  nextSessionId: () => prefixedUuid("session"),
  nextTurnId: () => prefixedUuid("turn"),
  nextRunId: () => prefixedUuid("run"),
  nextAttemptId: () => prefixedUuid("attempt"),
  nextArtifactId: () => prefixedUuid("artifact"),
  nextVerificationId: () => prefixedUuid("verification"),
  nextModelStepId: () => prefixedUuid("model-step"),
  nextEventId: () => prefixedUuid("event"),
  nextReceiptId: () => prefixedUuid("receipt"),
  nextOutcomeId: () => prefixedUuid("outcome"),
});

export const createFrozenReadOnlyWorkspaceCatalog = (): ToolCatalogSnapshot => {
  const definitions = READ_ONLY_WORKSPACE_TOOL_DEFINITIONS;
  return {
    schemaVersion: "meliora.tool-catalog.v1",
    catalogVersion: CATALOG_VERSION,
    catalogHash: hashJson({
      schemaVersion: "meliora.tool-catalog.v1",
      catalogVersion: CATALOG_VERSION,
      definitions: definitions as unknown as JsonValue,
    }),
    definitions,
  };
};

const workspaceMap = (roots: WorkspaceRoots): ReadonlyMap<string, string> =>
  roots instanceof Map ? new Map(roots) : new Map(Object.entries(roots));

const submissionError = (
  status: 400 | 404 | 409 | 503 | 500,
  code: TurnCommandErrorCode,
  retryable: boolean,
): TurnCommandSubmission => ({
  status,
  body: {
    schemaVersion: TURN_COMMAND_ERROR_SCHEMA_VERSION,
    error: { code, retryable },
  },
});

const toResponse = (
  disposition: "created" | "replay",
  command: StoredRunCommand,
): TurnCommandResponse => {
  const base = {
    schemaVersion: TURN_COMMAND_RESPONSE_SCHEMA_VERSION,
    disposition,
    sessionId: command.sessionId,
    turnId: command.turnId,
    runId: command.runId,
    attemptId: command.attemptId,
  } as const;
  return command.status === "terminal"
    ? {
        ...base,
        commandStatus: "terminal",
        terminalStatus: command.terminalStatus,
        ...(command.terminalCode === undefined ? {} : { terminalCode: command.terminalCode }),
      }
    : { ...base, commandStatus: command.status };
};

const commandScope = (command: StoredRunCommand) => ({
  localPrincipalId: command.localPrincipalId,
  workspaceId: command.workspaceId,
  idempotencyKey: command.idempotencyKey,
});

const latestSequence = async (store: SessionStorePort, runId: string): Promise<number> => {
  let cursor = 0;
  while (true) {
    const page = await store.readEvents({ runId, afterSequence: cursor, limit: 500 });
    if (page.events.length === 0) return cursor;
    cursor = page.events.at(-1)!.sequence;
    if (page.nextSequence === null) return cursor;
  }
};

const createPrivateArtifactWriter = (
  store: SessionStorePort,
  ids: TurnCommandIds,
  now: () => string,
): PrivateToolArtifactWriter => ({
  writePrivate: async (input) => {
    const reference = await store.putArtifact({
      artifactId: ids.nextArtifactId(),
      contentHash: input.contentHash,
      mediaType: input.mediaType,
      content: input.content,
      visibility: "private",
      metadata: input.metadata,
      createdAt: now(),
    });
    return { artifactId: reference.artifactId, visibility: "private" };
  },
});

const safeToolSummary = (
  definition: ToolDefinition,
  execution: ReadOnlyWorkspaceToolExecution,
): string => {
  if (execution.status === "succeeded") {
    return `只读工具 ${definition.name} 已成功执行，原始输出仅保留为私有证据。`;
  }
  if (execution.status === "cancelled") return `只读工具 ${definition.name} 已取消。`;
  return `只读工具 ${definition.name} 执行失败，未公开原始输出。`;
};

const safeModelToolContent = (
  artifact: Awaited<ReturnType<SessionStorePort["getArtifact"]>>,
  fallback: string,
): string => {
  if (!artifact || artifact.visibility !== "private" || artifact.mediaType !== "text/plain") return fallback;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(artifact.content);
  } catch {
    return fallback;
  }
  const projected = text.split(/\r?\n/u).map((line) => {
    try {
      assertPersistableText(line, "model-tool-result");
      return line;
    } catch {
      return "[redacted sensitive line]";
    }
  }).join("\n").trim();
  return projected.length === 0 ? fallback : projected;
};

const UNSAFE_ASSISTANT_TEXT_REDACTION = "模型输出包含无法安全公开的内容，已隐藏。";

export const projectServerOwnedAssistantText = (input: Readonly<{ content: string }>): string => {
  try {
    assertPersistableText(input.content, "assistant-public-text");
    return input.content;
  } catch {
    return UNSAFE_ASSISTANT_TEXT_REDACTION;
  }
};

const createServerOwnedToolProjector = (
  store: SessionStorePort,
) => async (input: Readonly<{
  definition: ToolDefinition;
  execution: ReadOnlyWorkspaceToolExecution;
}>) => {
  const summary = safeToolSummary(input.definition, input.execution);
  if (input.execution.status !== "succeeded") {
    return {
      modelContent: summary,
      publicSummary: summary,
      publicArtifactIds: [],
      publicVerificationArtifactIds: [],
    };
  }
  const privateArtifact = input.execution.outputArtifactId
    ? await store.getArtifact(input.execution.outputArtifactId)
    : null;
  return {
    modelContent: safeModelToolContent(privateArtifact, summary),
    publicSummary: summary,
    // Runtime stages the safe summary under the executing reservation, then
    // commits its alias atomically with the Receipt and public events.
    publicArtifactIds: [],
    publicVerificationArtifactIds: [],
  };
};

const createCheckpointGate = (
  store: SessionStorePort,
): ReadOnlyModelStepCheckpointGate => ({
  start: async (input) => {
    const requestFingerprint = hashJson({
      schemaVersion: "meliora.model-step-request.v1",
      messages: input.messages as unknown as JsonValue,
      catalogHash: input.catalog.catalogHash,
      catalogVersion: input.catalog.catalogVersion,
    });
    const result = await store.startModelStep({
      runId: input.runId,
      attemptId: input.attemptId,
      leaseToken: input.leaseToken,
      modelStepId: input.modelStepId,
      requestFingerprint,
      startedAt: input.startedAt,
    });
    if (result.kind === "started") return { kind: "started", requestFingerprint };
    if (result.kind === "replay") {
      return {
        kind: "replay",
        requestFingerprint: result.checkpoint.requestFingerprint,
        status: result.checkpoint.status === "terminal" ? "terminal" : "failed",
      };
    }
    return { kind: "conflict", code: result.code };
  },
  finish: async (input) => {
    const result = await store.finishModelStep({
      runId: input.runId,
      attemptId: input.attemptId,
      leaseToken: input.leaseToken,
      modelStepId: input.modelStepId,
      requestFingerprint: input.requestFingerprint,
      outcome: input.outcome,
    });
    return result.kind === "conflict"
      ? { kind: "conflict", code: result.code }
      : { kind: result.kind };
  },
});

export const createProviderBackedReadOnlyRunModel = (
  options: ProviderBackedModelOptions,
): ReadOnlyRunModelPort => {
  const requestTools: readonly OpenAiCompatibleRequestTool[] = options.catalog.definitions.map((definition) => ({
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
  }));
  return {
    next: ({ modelStepId, messages, signal }) => options.transport.next({
      messages,
      tools: requestTools,
      context: {
        modelStepId,
        occurredAt: () => options.now(),
        createInvocationId: (input: InvocationIdInput) => {
          const seed = hashBytes(`${modelStepId}:${input.choiceIndex}:${input.toolCallIndex}:${input.toolName}`).slice(0, 16);
          return `invocation-${options.provider}-${seed}-${input.choiceIndex}-${input.toolCallIndex}`;
        },
      },
      signal,
    }),
  };
};

const settleCommand = async (
  store: SessionStorePort,
  command: StoredRunCommand,
  leaseToken: string,
  terminalStatus: "completed" | "blocked" | "failed" | "cancelled",
  code: string | undefined,
  now: () => string,
): Promise<void> => {
  const latest = await store.readRunCommand(commandScope(command));
  if (!latest || latest.status === "terminal") return;
  await store.transitionRunCommand({
    ...commandScope(command),
    runId: latest.runId,
    attemptId: latest.attemptId,
    leaseToken,
    expectedStatus: latest.status,
    nextStatus: "terminal",
    terminalStatus,
    ...(code === undefined ? {} : { terminalCode: code }),
    updatedAt: now(),
  });
};

const appendWorkerFailureEvent = async (
  store: SessionStorePort,
  command: StoredRunCommand,
  leaseToken: string,
  code: string,
  message: string,
  ids: TurnCommandIds,
  now: () => string,
): Promise<void> => {
  const sequence = await latestSequence(store, command.runId);
  await store.appendEvents({
    runId: command.runId,
    attemptId: command.attemptId,
    leaseToken,
    expectedSequence: sequence,
    events: [{
      schemaVersion: "meliora.session-event.v1",
      eventId: ids.nextEventId(),
      kind: "run_failed",
      visibility: "public",
      payload: { code, retryable: true, message },
      createdAt: now(),
    }],
  });
};

const settleOutcomeUnknown = async (
  store: SessionStorePort,
  command: StoredRunCommand,
  leaseToken: string,
  ids: TurnCommandIds,
  now: () => string,
  input: Readonly<{
    code: string;
    message: string;
    userActions: readonly string[];
    requireStartedModelStep: boolean;
  }>,
): Promise<boolean> => {
  const latestCommand = await store.readRunCommand(commandScope(command));
  if (!latestCommand || latestCommand.status === "terminal") return false;
  if (input.requireStartedModelStep) {
    const latestStep = await store.readLatestModelStep({ runId: latestCommand.runId });
    if (latestStep?.status !== "started") return false;
  }
  try {
    const sequence = await latestSequence(store, latestCommand.runId);
    await store.settleRunCommandWithTerminalEvent({
      ...commandScope(latestCommand),
      runId: latestCommand.runId,
      attemptId: latestCommand.attemptId,
      leaseToken,
      expectedCommandStatus: latestCommand.status,
      expectedSequence: sequence,
      terminalStatus: "blocked",
      terminalCode: input.code,
      updatedAt: now(),
      terminalEvent: {
        schemaVersion: "meliora.session-event.v1",
        eventId: ids.nextEventId(),
        kind: "run_blocked",
        visibility: "public",
        payload: {
          code: input.code,
          message: input.message,
          userActions: [...input.userActions],
        },
        createdAt: now(),
      },
    });
  } catch {
    // A failed or conflicting atomic settle leaves both facts untouched.  The
    // command remains dispatched and the started checkpoint still forbids a
    // second Provider request until a later recovery worker can settle it.
    return true;
  }
  return true;
};

type InvocationRecoveryState = "present" | "absent" | "settled" | "settled_unbound" | "indeterminate";

const receiptMatchesTerminalInvocation = (
  record: InvocationReconciliationRecord,
): boolean => {
  const receipt = record.receipt;
  const invocation = record.invocation;
  return receipt !== null
    && receipt.runId === invocation.runId
    && receipt.attemptId === invocation.attemptId
    && receipt.invocationId === invocation.invocationId
    && receipt.toolName === invocation.toolName
    && receipt.toolVersion === invocation.toolVersion
    && receipt.argumentsHash === invocation.argumentsHash
    && receipt.catalogHash === invocation.catalogHash
    && receipt.status === invocation.status;
};

const hasValidExecutionStartedAt = (value: string | undefined): boolean =>
  value !== undefined && value.length > 0 && Number.isFinite(Date.parse(value));

const classifyInvocationRecoveryState = async (
  store: SessionStorePort,
  runId: string,
): Promise<InvocationRecoveryState> => {
  try {
    const recovery = await store.readRecoveryBundle({ runId, eventLimit: 128 });
    if (recovery.kind !== "found") return "indeterminate";
  let hasUnsafeUnreceiptedInvocation = false;
  let hasSettledInvocation = false;
  let hasSettledUnboundInvocation = false;
    for (const record of recovery.bundle.invocations) {
      const { reservation, invocation, receipt } = record;
      if (reservation.runId !== invocation.runId
        || reservation.attemptId !== invocation.attemptId
        || reservation.invocationId !== invocation.invocationId
        || reservation.idempotencyKey !== invocation.idempotencyKey
        || reservation.status !== invocation.status) return "indeterminate";
      if (invocation.status === "reserved") {
        if (receipt !== null || reservation.executionStartedAt !== undefined) return "indeterminate";
        continue;
      }
      if (invocation.status === "awaiting_approval") {
        if (receipt !== null || reservation.executionStartedAt !== undefined) return "indeterminate";
        // L0 does not implement approval recovery. It is neither a Receipt
        // nor authority to produce a Receipt-recovery terminal.
        return "indeterminate";
      }
      if (invocation.status === "executing") {
        if (receipt !== null || !hasValidExecutionStartedAt(reservation.executionStartedAt)) return "indeterminate";
        hasUnsafeUnreceiptedInvocation = true;
        continue;
      }
      if (invocation.status === "outcome_unknown") {
        // v2 migration deliberately clears this field: a legacy database
        // cannot prove an execution boundary.
        if (receipt !== null || reservation.executionStartedAt !== undefined) return "indeterminate";
        hasUnsafeUnreceiptedInvocation = true;
        continue;
      }
      if (invocation.status === "succeeded" || invocation.status === "failed" || invocation.status === "cancelled") {
        if (receipt === null || !receiptMatchesTerminalInvocation(record)) return "indeterminate";
        const durableReceipt = await store.readReceipt({
          runId: receipt.runId, attemptId: receipt.attemptId, receiptId: receipt.receiptId,
        });
        if (durableReceipt === null || JSON.stringify(durableReceipt) !== JSON.stringify(receipt)) return "indeterminate";
        const binding = await store.readReceiptPublicEventBinding({
          runId: receipt.runId, attemptId: receipt.attemptId, receiptId: receipt.receiptId,
        });
        if (binding.kind !== "found") hasSettledUnboundInvocation = true;
        else hasSettledInvocation = true;
        continue;
      }
      return "indeterminate";
    }
    if (hasUnsafeUnreceiptedInvocation) return "present";
    if (hasSettledUnboundInvocation) return "settled_unbound";
    return hasSettledInvocation ? "settled" : "absent";
  } catch {
    return "indeterminate";
  }
};

const runWorker = async (
  options: Required<Omit<TurnCommandSubmitterOptions, "defer" | "ids">> & Readonly<{
    ids: TurnCommandIds;
    catalog: ToolCatalogSnapshot;
    workspaceRoots: ReadonlyMap<string, string>;
  }>,
  command: StoredRunCommand,
): Promise<void> => {
  let leaseToken = "";
  try {
    const lease = await options.store.acquireLease({
      runId: command.runId,
      attemptId: command.attemptId,
      ownerId: options.ownerId,
      ttlMs: options.leaseTtlMs,
      requestedAt: options.now(),
    });
    if (lease.kind !== "acquired") return;
    leaseToken = lease.leaseToken;

    const current = await options.store.readRunCommand(commandScope(command));
    if (!current || current.status === "terminal") return;
    if (current.status === "dispatched") {
      const invocationState = await classifyInvocationRecoveryState(options.store, current.runId);
      if (invocationState === "present") {
        await settleOutcomeUnknown(options.store, command, leaseToken, options.ids, options.now, {
          code: TOOL_INVOCATION_OUTCOME_UNKNOWN_CODE,
          message: TOOL_INVOCATION_OUTCOME_UNKNOWN_MESSAGE,
          userActions: TOOL_INVOCATION_OUTCOME_UNKNOWN_ACTIONS,
          requireStartedModelStep: false,
        });
        return;
      }
      // `failure`, `conflict`, `not_found`, or a read exception cannot prove
      // the invocation is absent. Preserve dispatched state for a later
      // recovery worker rather than applying the Model Step fallback.
      if (invocationState === "settled") {
        // A durable Receipt proves the Host result, but not whether a later
        // model step/Command terminal write completed. Do not silently leave
        // this Command dispatched and do not replay Host/Provider: atomically
        // make the recovery boundary visible instead.
        await settleOutcomeUnknown(options.store, command, leaseToken, options.ids, options.now, {
          code: TOOL_RECEIPT_RECOVERY_REQUIRED_CODE,
          message: TOOL_RECEIPT_RECOVERY_REQUIRED_MESSAGE,
          userActions: TOOL_RECEIPT_RECOVERY_REQUIRED_ACTIONS,
          requireStartedModelStep: false,
        });
        return;
      }
      if (invocationState === "settled_unbound") {
        await settleOutcomeUnknown(options.store, command, leaseToken, options.ids, options.now, {
          code: RECEIPT_PUBLIC_EVENT_BINDING_INVALID_CODE,
          message: RECEIPT_PUBLIC_EVENT_BINDING_INVALID_MESSAGE,
          userActions: RECEIPT_PUBLIC_EVENT_BINDING_INVALID_ACTIONS,
          requireStartedModelStep: false,
        });
        return;
      }
      if (invocationState === "indeterminate") return;
      await settleOutcomeUnknown(options.store, command, leaseToken, options.ids, options.now, {
        code: MODEL_STEP_OUTCOME_UNKNOWN_CODE,
        message: MODEL_STEP_OUTCOME_UNKNOWN_MESSAGE,
        userActions: MODEL_STEP_OUTCOME_UNKNOWN_ACTIONS,
        requireStartedModelStep: true,
      });
      return;
    }
    if (current.status === "reserved") {
      const accepted = await options.store.transitionRunCommand({
        ...commandScope(command),
        runId: command.runId,
        attemptId: command.attemptId,
        leaseToken,
        expectedStatus: "reserved",
        nextStatus: "accepted",
        updatedAt: options.now(),
      });
      if (accepted.kind !== "updated" && accepted.kind !== "replay") return;
    }

    const input = await options.store.readPrivateUserInput({
      sessionId: command.sessionId,
      turnId: command.turnId,
    });
    if (!input) {
      await appendWorkerFailureEvent(options.store, command, leaseToken, "private_input_missing", "无法读取私有用户输入。", options.ids, options.now);
      await settleCommand(options.store, command, leaseToken, "failed", "private_input_missing", options.now);
      return;
    }

    const host = createWorkspaceHost(options.workspaceRoots);
    const tools = createReadOnlyWorkspaceTools({
      host,
      workspaceId: command.workspaceId,
      artifacts: createPrivateArtifactWriter(options.store, options.ids, options.now),
      nextVerificationId: options.ids.nextVerificationId,
    });
      const projectToolResult = createServerOwnedToolProjector(options.store);
    const loop = new ReadOnlyRunLoop({
      store: options.store,
      model: options.model,
      tools,
      ids: options.ids,
      modelStepCheckpoint: createCheckpointGate(options.store),
      now: options.now,
      hashArguments: (value) => hashJson(value as JsonValue),
      validateArguments: (definition, value) =>
        normalizeReadOnlyWorkspaceToolArguments(definition.name, value).ok ? null : "只读工具参数无效。",
      describeTool: (definition) => `准备执行只读工具 ${definition.name}。`,
      projectToolResult,
      projectAssistantText: projectServerOwnedAssistantText,
      isPublicArtifact: async (artifactId) => (await options.store.getArtifact(artifactId))?.visibility === "public",
      deferModelStepOutcomeUnknownTerminalEvent: true,
      ownerId: options.ownerId,
      leaseTtlMs: options.leaseTtlMs,
      policyVersion: options.policyVersion,
      principalId: options.localPrincipalId,
    });
    const result = await loop.run({
      sessionId: command.sessionId,
      workspaceId: command.workspaceId,
      turnId: command.turnId,
      runId: command.runId,
      attemptId: command.attemptId,
      intentRevision: options.intentRevision,
      catalog: options.catalog,
      userMessage: input.content,
      precreated: { leaseToken },
      maxModelSteps: options.maxModelSteps,
    });
    const code = result.outcome.status === "completed"
      ? undefined
      : result.outcome.unresolved[0]?.code ?? result.outcome.status;
    if (result.outcome.status === "blocked" && (code === MODEL_STEP_OUTCOME_UNKNOWN_CODE || code === TOOL_INVOCATION_OUTCOME_UNKNOWN_CODE)) {
      // The Run Loop deliberately deferred these ambiguous-outcome terminal
      // events. Store writes the public terminal event and Command terminal
      // state together; failed settlement leaves both facts absent.
      await settleOutcomeUnknown(options.store, command, leaseToken, options.ids, options.now, {
        code,
        message: result.outcome.summary,
        userActions: result.outcome.userActions,
        requireStartedModelStep: code === MODEL_STEP_OUTCOME_UNKNOWN_CODE,
      });
      return;
    }
    await settleCommand(options.store, command, leaseToken, result.outcome.status, code, options.now);
  } catch {
    if (leaseToken.length > 0) {
      if (await classifyInvocationRecoveryState(options.store, command.runId) !== "absent") {
        // Host may already have caused an effect but its Receipt was not
        // durable, or recovery cannot prove otherwise. Leave dispatched and
        // executing untouched until a later worker can read a complete bundle.
        return;
      }
      if (await settleOutcomeUnknown(options.store, command, leaseToken, options.ids, options.now, {
        code: MODEL_STEP_OUTCOME_UNKNOWN_CODE,
        message: MODEL_STEP_OUTCOME_UNKNOWN_MESSAGE,
        userActions: MODEL_STEP_OUTCOME_UNKNOWN_ACTIONS,
        requireStartedModelStep: true,
      })
        .catch(() => false)) {
        return;
      }
      await appendWorkerFailureEvent(options.store, command, leaseToken, "worker_failed", "后台执行失败。", options.ids, options.now)
        .catch(() => undefined);
      await settleCommand(options.store, command, leaseToken, "failed", "worker_failed", options.now)
        .catch(() => undefined);
    }
  }
};

export const createTurnCommandSubmitter = (
  inputOptions: TurnCommandSubmitterOptions,
): ((request: TurnCommandRequest) => Promise<TurnCommandSubmission>) => {
  const ids = inputOptions.ids ?? createDefaultTurnCommandIds();
  const now = inputOptions.now ?? (() => new Date().toISOString());
  const workspaceRoots = workspaceMap(inputOptions.workspaceRoots);
  const catalog = createFrozenReadOnlyWorkspaceCatalog();
  const options = {
    store: inputOptions.store,
    workspaceRoots,
    model: inputOptions.model,
    ids,
    now,
    localPrincipalId: inputOptions.localPrincipalId ?? LOCAL_PRINCIPAL_ID,
    ownerId: inputOptions.ownerId ?? WORKER_OWNER_ID,
    policyVersion: inputOptions.policyVersion ?? POLICY_VERSION,
    leaseTtlMs: inputOptions.leaseTtlMs ?? LEASE_TTL_MS,
    intentRevision: inputOptions.intentRevision ?? INTENT_REVISION,
    maxModelSteps: inputOptions.maxModelSteps ?? MAX_MODEL_STEPS,
    catalog,
  } as const;
  const defer = inputOptions.defer ?? ((run: () => Promise<void>) => {
    setImmediate(() => { void run(); });
  });

  return async (request) => {
    if (!workspaceRoots.has(request.workspaceId)) {
      return submissionError(404, "invalid_workspace", false);
    }
    const reservedAt = now();
    const reserve = await options.store.reserveRunCommand({
      localPrincipalId: options.localPrincipalId,
      workspaceId: request.workspaceId,
      idempotencyKey: request.idempotencyKey,
      canonicalRequestHash: canonicalRunCommandRequestHash({
        workspaceId: request.workspaceId,
        message: request.message,
      }),
      sessionId: ids.nextSessionId(),
      turnId: ids.nextTurnId(),
      runId: ids.nextRunId(),
      attemptId: ids.nextAttemptId(),
      catalogHash: catalog.catalogHash,
      intentRevision: options.intentRevision,
      userMessage: request.message,
      reservedAt,
    });
    if (reserve.kind === "conflict") {
      return submissionError(409, reserve.code, false);
    }
    if (reserve.kind === "owner" || reserve.command.status !== "terminal") {
      defer(() => runWorker(options, reserve.command));
    }
    const body = toResponse(reserve.kind === "owner" ? "created" : "replay", reserve.command);
    return { status: turnCommandHttpStatus(body), body };
  };
};
