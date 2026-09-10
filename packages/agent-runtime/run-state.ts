export const RUN_STATE_SCHEMA_VERSION = "meliora.run-state.v1" as const;

export type RunStatus =
  | "created"
  | "preparing"
  | "model_streaming"
  | "tool_assembling"
  | "awaiting_approval"
  | "executing_tools"
  | "compacting"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled"
  | "blocked";

export type RunAttemptSnapshot = Readonly<{
  schemaVersion: typeof RUN_STATE_SCHEMA_VERSION;
  sessionId: string;
  turnId: string;
  runId: string;
  attemptId: string;
  attemptNumber: number;
  status: RunStatus;
  lastEventSequence: number;
  catalogHash: string;
  intentRevision: number;
  contextCheckpointId?: string;
  activeModelStepId?: string;
  pendingInvocationIds: readonly string[];
  pendingApprovalIds: readonly string[];
  createdAt: string;
  updatedAt: string;
  terminalReason?: Readonly<{ code: string; message: string }>;
}>;

export type RunRecord = Readonly<{
  schemaVersion: "meliora.run.v1";
  sessionId: string;
  turnId: string;
  runId: string;
  activeAttemptId: string;
  latestAttemptNumber: number;
  createdAt: string;
  updatedAt: string;
}>;

export const RUN_TRANSITIONS: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  created: ["preparing", "cancelled", "failed"],
  preparing: ["model_streaming", "compacting", "cancelled", "failed", "blocked"],
  model_streaming: ["tool_assembling", "verifying", "compacting", "cancelled", "failed", "blocked"],
  tool_assembling: ["awaiting_approval", "executing_tools", "cancelled", "failed", "blocked"],
  awaiting_approval: ["executing_tools", "cancelled", "failed", "blocked"],
  executing_tools: ["model_streaming", "verifying", "cancelled", "failed", "blocked"],
  compacting: ["model_streaming", "cancelled", "failed", "blocked"],
  verifying: ["completed", "model_streaming", "cancelled", "failed", "blocked"],
  completed: [],
  failed: [],
  cancelled: [],
  blocked: [],
};

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return RUN_TRANSITIONS[from].includes(to);
}
