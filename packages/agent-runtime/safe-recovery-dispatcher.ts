import type {
  ClaimInitialPreDispatchRunCommandForRecoveryResult,
  InitialPreDispatchContinuation,
  ReclaimInitialPreDispatchExecutionAuthorityResult,
  SessionStorePort,
  StoredRunCommand,
} from "../session-store/contracts.js";

/**
 * C.2b's deliberately narrow dispatcher.  It is not a scheduler and is
 * never wired to GET/SSE/resume: an application lifecycle explicitly calls
 * dispatchOne() for one known command.  Store proves the no-outbound prefix;
 * this layer only gives the winning Attempt to a worker callback.
 */
export type SafeRecoveryDispatchInput = Readonly<{
  localPrincipalId: string;
  workspaceId: string;
  idempotencyKey: string;
  runId: string;
}>;

export type { InitialPreDispatchContinuation } from "../session-store/contracts.js";

export type SafeRecoveryExecutionAuthority = Readonly<{
  attemptId: string;
  leaseToken: string;
  expiresAt: string;
}>;

export type SafeRecoveryDispatchDependencies = Readonly<{
  store: SessionStorePort;
  ownerId: string;
  leaseTtlMs: number;
  now: () => string;
  nextAttemptId: () => string;
  /** Called only by an explicit dispatchOne winner; reads do not reach here. */
  execute: (input: Readonly<{
    command: StoredRunCommand;
    userMessage: string;
    authority: SafeRecoveryExecutionAuthority;
    continuation: InitialPreDispatchContinuation;
  }>) => Promise<void>;
}>;

export type SafeRecoveryDispatchResult =
  | Readonly<{ kind: "dispatched"; attemptId: string }>
  | Readonly<{ kind: "retained"; code: string }>;

export const createSafeRecoveryDispatcher = (dependencies: SafeRecoveryDispatchDependencies) => ({
  async dispatchOne(input: SafeRecoveryDispatchInput): Promise<SafeRecoveryDispatchResult> {
    // The complete bounded read is an additional caller-side proof. Store
    // repeats the same proof inside its atomic claim/reclaim boundary.
    const read = await dependencies.store.readRecoveryBundle({ runId: input.runId, afterSequence: 0, eventLimit: 8 });
    if (read.kind !== "found" || !read.bundle.tailComplete) return { kind: "retained", code: "initial_recovery_not_safe" };
    const bundle = read.bundle;
    const command = bundle.command;
    if (command.status !== "reserved" && command.status !== "accepted") return { kind: "retained", code: "command_status_conflict" };
    if (bundle.eventHeadSequence > 2) return { kind: "retained", code: "initial_recovery_not_safe" };

    let authorityResult: ClaimInitialPreDispatchRunCommandForRecoveryResult | ReclaimInitialPreDispatchExecutionAuthorityResult;
    if (bundle.latestAttemptNumber === 1 && bundle.activeAttempt.attemptId === command.initialAttemptId) {
      const claimedAt = dependencies.now();
      authorityResult = await dependencies.store.claimInitialPreDispatchRunCommandForRecovery({
        localPrincipalId: input.localPrincipalId, workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey,
        runId: input.runId, expectedInitialAttemptId: command.initialAttemptId, expectedLatestAttemptNumber: 1,
        expectedCommandStatus: command.status, expectedSequence: bundle.eventHeadSequence,
        recoveryAttempt: {
          sessionId: command.sessionId, turnId: command.turnId, runId: command.runId,
          attemptId: dependencies.nextAttemptId(), expectedLatestAttemptNumber: 1,
          ownerId: dependencies.ownerId, ttlMs: dependencies.leaseTtlMs,
          createdAt: claimedAt, requestedAt: claimedAt,
          catalogHash: bundle.activeAttempt.catalogHash, intentRevision: bundle.activeAttempt.intentRevision,
        },
      });
    } else if (bundle.latestAttemptNumber === 2) {
      authorityResult = await dependencies.store.reclaimInitialPreDispatchExecutionAuthority({
        localPrincipalId: input.localPrincipalId, workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey,
        runId: input.runId, expectedInitialAttemptId: command.initialAttemptId,
        expectedActiveAttemptId: bundle.activeAttempt.attemptId, expectedLatestAttemptNumber: 2,
        expectedCommandStatus: command.status, expectedSequence: bundle.eventHeadSequence,
        ownerId: dependencies.ownerId, ttlMs: dependencies.leaseTtlMs, requestedAt: dependencies.now(),
      });
    } else {
      return { kind: "retained", code: "initial_recovery_not_safe" };
    }
    if (authorityResult.kind !== "claimed" && authorityResult.kind !== "reclaimed") {
      return { kind: "retained", code: authorityResult.code };
    }
    const authority: SafeRecoveryExecutionAuthority = {
      attemptId: authorityResult.attempt.attemptId,
      leaseToken: authorityResult.lease.leaseToken,
      expiresAt: authorityResult.lease.expiresAt,
    };
    let current = authorityResult.command;
    if (current.status === "reserved") {
      const accepted = await dependencies.store.transitionRunCommand({
        localPrincipalId: current.localPrincipalId, workspaceId: current.workspaceId, idempotencyKey: current.idempotencyKey,
        runId: current.runId, attemptId: authority.attemptId, leaseToken: authority.leaseToken,
        expectedStatus: "reserved", nextStatus: "accepted", updatedAt: dependencies.now(),
      });
      if (accepted.kind !== "updated" && accepted.kind !== "replay") return { kind: "retained", code: accepted.code };
      current = accepted.command;
    }
    const user = await dependencies.store.readPrivateUserInput({ sessionId: current.sessionId, turnId: current.turnId });
    if (!user) return { kind: "retained", code: "recovery_bundle_incomplete" };
    await dependencies.execute({ command: current, userMessage: user.content, authority, continuation: authorityResult.continuation });
    return { kind: "dispatched", attemptId: authority.attemptId };
  },
});
