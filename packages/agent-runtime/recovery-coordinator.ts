import type {
  InvocationReconciliationRecord,
  RecoveryCommandCursor,
  RecoveryBundle,
  SessionStorePort,
  StoredRunCommand,
} from "../session-store/contracts";

/**
 * WP-3C.1 is deliberately a bounded safety sweep, not a worker restart.
 * It may turn a durably-proven ambiguous dispatched command into one atomic
 * `run_blocked` fact.  It never calls a model, a Workspace Host, or a normal
 * command worker; safe dispatch/resume is a later slice.
 */
const MODEL_STEP_OUTCOME_UNKNOWN = {
  code: "model_step_outcome_unknown",
  message: "模型步骤结果未知，已停止自动重发 Provider 请求。",
  userActions: ["从持久化事件、Provider 幂等查询或后续恢复快照确认结果后再继续。"],
} as const;

const TOOL_INVOCATION_OUTCOME_UNKNOWN = {
  code: "tool_invocation_outcome_unknown",
  message: "工具执行结果未知，已停止自动重放。",
  userActions: ["先通过 Host readback 或恢复协调器确认工具结果。"],
} as const;

const TOOL_RECEIPT_RECOVERY_REQUIRED = {
  code: "tool_receipt_recovery_required",
  message: "工具回执已持久化，但执行器在后续收口前中断，已停止自动续跑。",
  userActions: ["请通过恢复协调器核验 Receipt 绑定事件与后续模型步骤后再继续。"],
} as const;

const RECEIPT_PUBLIC_EVENT_BINDING_INVALID = {
  code: "receipt_public_event_binding_invalid",
  message: "发现既有工具回执缺少或损坏公开事件绑定，已停止自动续跑。",
  userActions: ["请通过恢复协调器核验或迁移该 Receipt 的公开投影。"],
} as const;

export type RecoveryCoordinatorIds = Readonly<{
  nextAttemptId(): string;
  nextEventId(): string;
}>;

export type RecoveryCoordinatorOptions = Readonly<{
  store: SessionStorePort;
  ids: RecoveryCoordinatorIds;
  now: () => string;
  ownerId: string;
  leaseTtlMs: number;
  /** 1..64, matching the Store scan contract. Defaults to 16. */
  scanLimit?: number;
  /** 1..500, matching the Store recovery-bundle contract. Defaults to 500. */
  eventLimit?: number;
  /** Bounded pages per invocation. Defaults to one page. */
  maxPages?: number;
}>;

/** Aggregate-only output: it intentionally contains no command scope or IDs. */
export type RecoverOnceResult = Readonly<{
  scanned: number;
  sweepComplete: boolean;
  /** Pass this opaque cursor to the next bounded sweep; null starts at origin. */
  nextCursor: RecoveryCommandCursor | null;
  blocked: number;
  retained: number;
  leaseHeld: number;
  conflicts: number;
  indeterminate: number;
}>;

type BlockReason = typeof MODEL_STEP_OUTCOME_UNKNOWN
  | typeof TOOL_INVOCATION_OUTCOME_UNKNOWN
  | typeof TOOL_RECEIPT_RECOVERY_REQUIRED
  | typeof RECEIPT_PUBLIC_EVENT_BINDING_INVALID;

type RecoveryClassification =
  | Readonly<{ kind: "block"; reason: BlockReason }>
  | Readonly<{ kind: "retain" }>
  | Readonly<{ kind: "indeterminate" }>;

// A recovered Command still marked dispatched cannot safely override a
// terminal fact already present in the durable log.  In particular, SSE
// terminates at the first public terminal event, so appending another one
// would create an event that no client can reach.
const TERMINAL_RUN_EVENT_KINDS = new Set([
  "run_blocked",
  "run_completed",
  "run_failed",
  "run_cancelled",
]);

const isValidExecutionStartedAt = (value: string | undefined): boolean =>
  value !== undefined && value.length > 0 && Number.isFinite(Date.parse(value));

const receiptMatchesTerminalInvocation = (record: InvocationReconciliationRecord): boolean => {
  const { invocation, receipt } = record;
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

/**
 * Every ambiguous or malformed record fails closed.  A proof that a Host was
 * not called is not permission to start the old worker in C.1; it is retained
 * for C.2's separately-reviewed resume/dispatch path.
 */
const classifyBundle = async (
  store: SessionStorePort,
  bundle: RecoveryBundle,
): Promise<RecoveryClassification> => {
  if (bundle.command.status === "reserved" || bundle.command.status === "accepted") return { kind: "retain" };
  if (bundle.command.status !== "dispatched"
    || bundle.command.runId !== bundle.run.runId
    || bundle.command.sessionId !== bundle.run.sessionId
    || bundle.command.turnId !== bundle.run.turnId
    || bundle.activeAttempt.runId !== bundle.run.runId
    || bundle.activeAttempt.attemptId !== bundle.readActiveAttemptId
    || bundle.activeAttempt.attemptNumber !== bundle.latestAttemptNumber
    || bundle.eventHeadSequence !== bundle.activeAttempt.lastEventSequence
    || !bundle.tailComplete) return { kind: "indeterminate" };

  if (bundle.tailEvents.length !== bundle.eventHeadSequence - bundle.effectiveAfterSequence
    || bundle.tailEvents.some((event, index) => event.runId !== bundle.run.runId
      || event.sequence !== bundle.effectiveAfterSequence + index + 1)) return { kind: "indeterminate" };

  if (bundle.tailEvents.some((event) => TERMINAL_RUN_EVENT_KINDS.has(event.kind))) {
    return { kind: "indeterminate" };
  }

  let hasUnknownInvocation = false;
  let hasSettledInvocation = false;
  let hasSettledUnboundInvocation = false;
  let hasAwaitingApproval = false;
  for (const record of bundle.invocations) {
    const { reservation, invocation, receipt } = record;
    if (reservation.runId !== invocation.runId
      || reservation.attemptId !== invocation.attemptId
      || reservation.invocationId !== invocation.invocationId
      || reservation.idempotencyKey !== invocation.idempotencyKey
      || reservation.status !== invocation.status) return { kind: "indeterminate" };
    if (invocation.status === "reserved") {
      if (receipt !== null || reservation.executionStartedAt !== undefined) return { kind: "indeterminate" };
      continue;
    }
    if (invocation.status === "awaiting_approval") {
      if (receipt !== null || reservation.executionStartedAt !== undefined) return { kind: "indeterminate" };
      hasAwaitingApproval = true;
      continue;
    }
    if (invocation.status === "executing") {
      if (receipt !== null || !isValidExecutionStartedAt(reservation.executionStartedAt)) return { kind: "indeterminate" };
      hasUnknownInvocation = true;
      continue;
    }
    if (invocation.status === "outcome_unknown") {
      if (receipt !== null || reservation.executionStartedAt !== undefined) return { kind: "indeterminate" };
      hasUnknownInvocation = true;
      continue;
    }
    if (invocation.status !== "succeeded" && invocation.status !== "failed" && invocation.status !== "cancelled") {
      return { kind: "indeterminate" };
    }
    if (!receiptMatchesTerminalInvocation(record)) return { kind: "indeterminate" };
    const durableReceipt = await store.readReceipt({
      runId: receipt!.runId, attemptId: receipt!.attemptId, receiptId: receipt!.receiptId,
    });
    if (durableReceipt === null || JSON.stringify(durableReceipt) !== JSON.stringify(receipt)) {
      return { kind: "indeterminate" };
    }
    const binding = await store.readReceiptPublicEventBinding({
      runId: receipt!.runId, attemptId: receipt!.attemptId, receiptId: receipt!.receiptId,
    });
    if (binding.kind === "found") hasSettledInvocation = true;
    else hasSettledUnboundInvocation = true;
  }
  if (hasUnknownInvocation) return { kind: "block", reason: TOOL_INVOCATION_OUTCOME_UNKNOWN };
  if (hasSettledUnboundInvocation) return { kind: "block", reason: RECEIPT_PUBLIC_EVENT_BINDING_INVALID };
  if (hasSettledInvocation) return { kind: "block", reason: TOOL_RECEIPT_RECOVERY_REQUIRED };
  if (hasAwaitingApproval) return { kind: "retain" };
  if (bundle.latestModelStep?.status === "started") return { kind: "block", reason: MODEL_STEP_OUTCOME_UNKNOWN };
  return { kind: "retain" };
};

const assertOptions = (input: RecoveryCoordinatorOptions): Required<RecoveryCoordinatorOptions> => {
  const scanLimit = input.scanLimit ?? 16;
  const eventLimit = input.eventLimit ?? 500;
  const maxPages = input.maxPages ?? 1;
  if (!Number.isInteger(scanLimit) || scanLimit < 1 || scanLimit > 64) throw new TypeError("invalid_recovery_scan_limit");
  if (!Number.isInteger(eventLimit) || eventLimit < 1 || eventLimit > 500) throw new TypeError("invalid_recovery_event_limit");
  if (!Number.isInteger(input.leaseTtlMs) || input.leaseTtlMs < 1) throw new TypeError("invalid_recovery_lease_ttl");
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 64) throw new TypeError("invalid_recovery_max_pages");
  if (input.ownerId.length === 0) throw new TypeError("invalid_recovery_owner");
  return { ...input, scanLimit, eventLimit, maxPages };
};

const scopeFor = (command: StoredRunCommand) => ({
  localPrincipalId: command.localPrincipalId,
  workspaceId: command.workspaceId,
  idempotencyKey: command.idempotencyKey,
});

export const createRecoveryCoordinator = (input: RecoveryCoordinatorOptions): Readonly<{
  recoverOnce(input?: Readonly<{ afterCursor?: RecoveryCommandCursor | null }>): Promise<RecoverOnceResult>;
}> => {
  const options = assertOptions(input);
  return {
    recoverOnce: async (input = {}): Promise<RecoverOnceResult> => {
      let cursor = input.afterCursor ?? undefined;
      const counts = { scanned: 0, sweepComplete: false, nextCursor: null as RecoveryCommandCursor | null, blocked: 0, retained: 0, leaseHeld: 0, conflicts: 0, indeterminate: 0 };
      for (let pageNumber = 0; pageNumber < options.maxPages; pageNumber += 1) {
        let page;
        try {
          page = await options.store.listRecoverableCommands({ limit: options.scanLimit, ...(cursor === undefined ? {} : { afterCursor: cursor }) });
        } catch {
          counts.indeterminate += 1;
          return counts;
        }
        counts.scanned += page.commands.length;
        for (const ref of page.commands) {
        let recovery;
        try {
          recovery = await options.store.readRecoveryBundle({
            runId: ref.runId,
            eventLimit: options.eventLimit,
          });
        } catch {
          counts.indeterminate += 1;
          continue;
        }
        if (recovery.kind !== "found") {
          counts.indeterminate += 1;
          continue;
        }
        if (recovery.bundle.command.runId !== ref.runId
          || recovery.bundle.command.initialAttemptId !== ref.initialAttemptId
          || recovery.bundle.command.status !== ref.status) {
          counts.indeterminate += 1;
          continue;
        }
        let classification: RecoveryClassification;
        try {
          classification = await classifyBundle(options.store, recovery.bundle);
        } catch {
          counts.indeterminate += 1;
          continue;
        }
        if (classification.kind === "indeterminate") {
          counts.indeterminate += 1;
          continue;
        }
        if (classification.kind === "retain") {
          counts.retained += 1;
          continue;
        }
        const recoveryAt = options.now();
        try {
          const settled = await options.store.recoverAndSettleRunCommandWithTerminalEvent({
            ...scopeFor(recovery.bundle.command),
            runId: recovery.bundle.command.runId,
            expectedActiveAttemptId: recovery.bundle.readActiveAttemptId,
            expectedLatestAttemptNumber: recovery.bundle.latestAttemptNumber,
            expectedCommandStatus: "dispatched",
            expectedSequence: recovery.bundle.eventHeadSequence,
            recoveryAttempt: {
            sessionId: recovery.bundle.run.sessionId,
            turnId: recovery.bundle.run.turnId,
            runId: recovery.bundle.run.runId,
            attemptId: options.ids.nextAttemptId(),
            expectedLatestAttemptNumber: recovery.bundle.latestAttemptNumber,
            catalogHash: recovery.bundle.activeAttempt.catalogHash,
            intentRevision: recovery.bundle.activeAttempt.intentRevision,
            createdAt: recoveryAt,
            ownerId: options.ownerId,
            ttlMs: options.leaseTtlMs,
            requestedAt: recoveryAt,
            },
            terminalCode: classification.reason.code,
            updatedAt: recoveryAt,
            terminalEvent: {
              schemaVersion: "meliora.session-event.v1",
              eventId: options.ids.nextEventId(),
              kind: "run_blocked",
              visibility: "public",
              payload: {
                code: classification.reason.code,
                message: classification.reason.message,
                userActions: [...classification.reason.userActions],
              },
              createdAt: recoveryAt,
            },
          });
          if (settled.kind === "settled") counts.blocked += 1;
          else if (settled.code === "lease_held") counts.leaseHeld += 1;
          else counts.conflicts += 1;
        } catch {
          // Store atomicity leaves the old Attempt, command and event intact.
          counts.conflicts += 1;
        }
      }
        if (page.sweepComplete) {
          counts.sweepComplete = true;
          counts.nextCursor = null;
          return counts;
        }
        cursor = page.nextCursor ?? undefined;
        counts.nextCursor = page.nextCursor;
        if (cursor === undefined) {
          counts.indeterminate += 1;
          return counts;
        }
      }
      return counts;
    },
  };
};
