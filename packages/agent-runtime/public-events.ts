import type { JsonObject } from "../model-protocol/contracts";
import type { RunStatus } from "./run-state";

export const PUBLIC_RUN_EVENT_SCHEMA_VERSION = "meliora.public-run-event.v1" as const;

export type PublicArtifactRef = Readonly<{
  artifactId: string;
  visibility: "public";
}>;

export type PlanStep = Readonly<{
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "blocked" | "skipped";
  evidenceRefs: readonly PublicArtifactRef[];
}>;

type PublicEventEnvelope<K extends string, P extends JsonObject> = Readonly<{
  schemaVersion: typeof PUBLIC_RUN_EVENT_SCHEMA_VERSION;
  eventId: string;
  sessionId: string;
  runId: string;
  sequence: number;
  timestamp: string;
  visibility: "public";
  kind: K;
  payload: P;
}>;

export type PublicRunEvent =
  | PublicEventEnvelope<"run_status_changed", { status: RunStatus; reason?: string }>
  | PublicEventEnvelope<"assistant_text_delta", { delta: string }>
  | PublicEventEnvelope<"plan_updated", { steps: PlanStep[] }>
  | PublicEventEnvelope<"tool_call_presented", {
      invocationId: string;
      toolName: string;
      risk: "L0" | "L1" | "L2" | "L3";
      summary: string;
    }>
  | PublicEventEnvelope<"approval_requested", {
      approvalId: string;
      invocationId: string;
      argumentsHash: string;
      summary: string;
      expiresAt?: string;
    }>
  | PublicEventEnvelope<"tool_result_presented", {
      invocationId: string;
      status: "succeeded" | "failed" | "cancelled";
      summary: string;
      artifactRefs: PublicArtifactRef[];
    }>
  | PublicEventEnvelope<"context_compacted", { checkpointId: string; summary: string }>
  | PublicEventEnvelope<"verification_updated", {
      verificationId: string;
      status: "passed" | "failed" | "not_run";
      evidenceRefs: PublicArtifactRef[];
    }>
  | PublicEventEnvelope<"run_blocked", { code: string; message: string; userActions: string[] }>
  | PublicEventEnvelope<"run_completed", { outcomeId: string; summary: string }>
  | PublicEventEnvelope<"run_failed", { code: string; retryable: boolean; message: string }>
  | PublicEventEnvelope<"run_cancelled", { reason: string }>;
