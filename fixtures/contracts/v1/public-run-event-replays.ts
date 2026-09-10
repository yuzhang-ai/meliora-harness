import {
  PUBLIC_RUN_EVENT_SCHEMA_VERSION,
  type PublicRunEvent,
} from "../../../packages/agent-runtime/public-events";

export type PublicRunEventReplay = Readonly<{
  id: string;
  scenario: string;
  /** The persisted SSE event after which this replay starts, if it is a resume. */
  resumeAfterSequence?: number;
  /** A reconnect is read-only: it must never create a provider request or Run. */
  createsRun: boolean;
  events: readonly PublicRunEvent[];
}>;

const schemaVersion = PUBLIC_RUN_EVENT_SCHEMA_VERSION;

/**
 * Keyless, public-only streams for the Web Shell. Payloads deliberately include
 * summaries and references only; no raw tool output, reasoning, or credential is
 * represented here.
 */
export const publicRunEventReplays = {
  "read-only-success": {
    id: "public.read-only-success.v1",
    scenario: "an L0 list_files call is verified and the run completes",
    createsRun: true,
    events: [
      {
        schemaVersion,
        eventId: "event-read-only-001",
        sessionId: "session-public-read-only",
        runId: "run-public-read-only",
        sequence: 1,
        timestamp: "2026-09-10T00:10:00.000Z",
        visibility: "public",
        kind: "run_status_changed",
        payload: { status: "preparing" },
      },
      {
        schemaVersion,
        eventId: "event-read-only-002",
        sessionId: "session-public-read-only",
        runId: "run-public-read-only",
        sequence: 2,
        timestamp: "2026-09-10T00:10:00.020Z",
        visibility: "public",
        kind: "plan_updated",
        payload: {
          steps: [
            {
              id: "step-inspect-tree",
              title: "检查工作区结构",
              status: "in_progress",
              evidenceRefs: [],
            },
          ],
        },
      },
      {
        schemaVersion,
        eventId: "event-read-only-003",
        sessionId: "session-public-read-only",
        runId: "run-public-read-only",
        sequence: 3,
        timestamp: "2026-09-10T00:10:00.040Z",
        visibility: "public",
        kind: "tool_call_presented",
        payload: {
          invocationId: "invocation-public-list-files",
          toolName: "list_files",
          risk: "L0",
          summary: "正在列出工作区根目录文件。",
        },
      },
      {
        schemaVersion,
        eventId: "event-read-only-004",
        sessionId: "session-public-read-only",
        runId: "run-public-read-only",
        sequence: 4,
        timestamp: "2026-09-10T00:10:00.060Z",
        visibility: "public",
        kind: "tool_result_presented",
        payload: {
          invocationId: "invocation-public-list-files",
          status: "succeeded",
          summary: "已读取工作区目录摘要。",
          artifactRefs: [{ artifactId: "artifact-public-tree-summary", visibility: "public" }],
        },
      },
      {
        schemaVersion,
        eventId: "event-read-only-005",
        sessionId: "session-public-read-only",
        runId: "run-public-read-only",
        sequence: 5,
        timestamp: "2026-09-10T00:10:00.080Z",
        visibility: "public",
        kind: "verification_updated",
        payload: {
          verificationId: "verification-public-tree",
          status: "passed",
          evidenceRefs: [{ artifactId: "artifact-public-tree-summary", visibility: "public" }],
        },
      },
      {
        schemaVersion,
        eventId: "event-read-only-006",
        sessionId: "session-public-read-only",
        runId: "run-public-read-only",
        sequence: 6,
        timestamp: "2026-09-10T00:10:00.100Z",
        visibility: "public",
        kind: "run_completed",
        payload: {
          outcomeId: "outcome-public-read-only",
          summary: "工作区检查已完成并已验证。",
        },
      },
    ],
  },
  "approval-required": {
    id: "public.approval-required.v1",
    scenario: "an L2 patch is presented and waits for an argument-bound approval",
    createsRun: true,
    events: [
      {
        schemaVersion,
        eventId: "event-approval-001",
        sessionId: "session-public-approval",
        runId: "run-public-approval",
        sequence: 1,
        timestamp: "2026-09-10T00:11:00.000Z",
        visibility: "public",
        kind: "tool_call_presented",
        payload: {
          invocationId: "invocation-public-apply-patch",
          toolName: "apply_patch",
          risk: "L2",
          summary: "准备修改一个受控文件，并已生成 diff 预览。",
        },
      },
      {
        schemaVersion,
        eventId: "event-approval-002",
        sessionId: "session-public-approval",
        runId: "run-public-approval",
        sequence: 2,
        timestamp: "2026-09-10T00:11:00.020Z",
        visibility: "public",
        kind: "approval_requested",
        payload: {
          approvalId: "approval-public-apply-patch",
          invocationId: "invocation-public-apply-patch",
          argumentsHash: "sha256:public-apply-patch-arguments",
          summary: "请确认将这个已预览的 patch 应用于工作区。",
          expiresAt: "2026-09-10T00:21:00.000Z",
        },
      },
      {
        schemaVersion,
        eventId: "event-approval-003",
        sessionId: "session-public-approval",
        runId: "run-public-approval",
        sequence: 3,
        timestamp: "2026-09-10T00:11:00.030Z",
        visibility: "public",
        kind: "run_status_changed",
        payload: { status: "awaiting_approval", reason: "approval_required" },
      },
    ],
  },
  "tool-failure": {
    id: "public.tool-failure.v1",
    scenario: "a read-only command fails and the run gives a safe, retryable failure",
    createsRun: true,
    events: [
      {
        schemaVersion,
        eventId: "event-failure-001",
        sessionId: "session-public-failure",
        runId: "run-public-failure",
        sequence: 1,
        timestamp: "2026-09-10T00:12:00.000Z",
        visibility: "public",
        kind: "tool_call_presented",
        payload: {
          invocationId: "invocation-public-git-status",
          toolName: "git_status",
          risk: "L0",
          summary: "正在读取 Git 状态。",
        },
      },
      {
        schemaVersion,
        eventId: "event-failure-002",
        sessionId: "session-public-failure",
        runId: "run-public-failure",
        sequence: 2,
        timestamp: "2026-09-10T00:12:00.020Z",
        visibility: "public",
        kind: "tool_result_presented",
        payload: {
          invocationId: "invocation-public-git-status",
          status: "failed",
          summary: "无法读取 Git 状态；工作区可能不是仓库。",
          artifactRefs: [],
        },
      },
      {
        schemaVersion,
        eventId: "event-failure-003",
        sessionId: "session-public-failure",
        runId: "run-public-failure",
        sequence: 3,
        timestamp: "2026-09-10T00:12:00.040Z",
        visibility: "public",
        kind: "run_failed",
        payload: {
          code: "workspace_not_git_repository",
          retryable: true,
          message: "当前工作区无法执行 Git 检查。",
        },
      },
    ],
  },
  cancelled: {
    id: "public.cancelled.v1",
    scenario: "a user cancellation stops the active run and leaves a terminal public event",
    createsRun: true,
    events: [
      {
        schemaVersion,
        eventId: "event-cancelled-001",
        sessionId: "session-public-cancelled",
        runId: "run-public-cancelled",
        sequence: 1,
        timestamp: "2026-09-10T00:13:00.000Z",
        visibility: "public",
        kind: "assistant_text_delta",
        payload: { delta: "正在检查依赖关系。" },
      },
      {
        schemaVersion,
        eventId: "event-cancelled-002",
        sessionId: "session-public-cancelled",
        runId: "run-public-cancelled",
        sequence: 2,
        timestamp: "2026-09-10T00:13:00.030Z",
        visibility: "public",
        kind: "run_status_changed",
        payload: { status: "cancelled", reason: "user_requested" },
      },
      {
        schemaVersion,
        eventId: "event-cancelled-003",
        sessionId: "session-public-cancelled",
        runId: "run-public-cancelled",
        sequence: 3,
        timestamp: "2026-09-10T00:13:00.040Z",
        visibility: "public",
        kind: "run_cancelled",
        payload: { reason: "用户取消了当前任务。" },
      },
    ],
  },
  reconnecting: {
    id: "public.reconnecting.v1",
    scenario: "an SSE client resumes from a durable event without starting a new provider request",
    resumeAfterSequence: 4,
    createsRun: false,
    events: [
      {
        schemaVersion,
        eventId: "event-reconnect-005",
        sessionId: "session-public-reconnect",
        runId: "run-public-reconnect",
        sequence: 5,
        timestamp: "2026-09-10T00:14:00.000Z",
        visibility: "public",
        kind: "tool_result_presented",
        payload: {
          invocationId: "invocation-public-reconnect-list-files",
          status: "succeeded",
          summary: "已恢复并展示先前完成的目录读取结果。",
          artifactRefs: [{ artifactId: "artifact-public-reconnect-tree", visibility: "public" }],
        },
      },
      {
        schemaVersion,
        eventId: "event-reconnect-006",
        sessionId: "session-public-reconnect",
        runId: "run-public-reconnect",
        sequence: 6,
        timestamp: "2026-09-10T00:14:00.020Z",
        visibility: "public",
        kind: "verification_updated",
        payload: {
          verificationId: "verification-public-reconnect",
          status: "passed",
          evidenceRefs: [{ artifactId: "artifact-public-reconnect-tree", visibility: "public" }],
        },
      },
      {
        schemaVersion,
        eventId: "event-reconnect-007",
        sessionId: "session-public-reconnect",
        runId: "run-public-reconnect",
        sequence: 7,
        timestamp: "2026-09-10T00:14:00.040Z",
        visibility: "public",
        kind: "run_completed",
        payload: {
          outcomeId: "outcome-public-reconnect",
          summary: "已在重连后从持久化事件恢复完成状态。",
        },
      },
    ],
  },
} satisfies Record<string, PublicRunEventReplay>;
