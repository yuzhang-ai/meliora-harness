import type { PublicRunEvent } from "../../../packages/agent-runtime/public-events";

export type TimelineProjection =
  | Readonly<{ kind: "assistant"; id: string; text: string }>
  | Readonly<{ kind: "event"; event: PublicRunEvent }>;

export type RunEvidence = Readonly<{
  tools: readonly Readonly<{ invocationId: string; toolName: string; status: "presented" | "succeeded" | "failed" | "cancelled"; summary: string }>[];
  verifications: readonly Readonly<{ verificationId: string; status: "passed" | "failed" | "not_run" }>[];
  publicArtifactCount: number;
}>;

export function projectTimeline(events: readonly PublicRunEvent[]): readonly TimelineProjection[] {
  const items: TimelineProjection[] = [];
  for (const event of events) {
    if (event.kind !== "assistant_text_delta") {
      items.push({ kind: "event", event });
      continue;
    }
    const previous = items.at(-1);
    if (previous?.kind === "assistant") {
      items[items.length - 1] = { ...previous, text: previous.text + event.payload.delta };
    } else {
      items.push({ kind: "assistant", id: event.eventId, text: event.payload.delta });
    }
  }
  return items;
}

export function projectEvidence(events: readonly PublicRunEvent[]): RunEvidence {
  const tools = new Map<string, { invocationId: string; toolName: string; status: "presented" | "succeeded" | "failed" | "cancelled"; summary: string }>();
  const verifications: { verificationId: string; status: "passed" | "failed" | "not_run" }[] = [];
  const publicArtifacts = new Set<string>();
  for (const event of events) {
    if (event.kind === "tool_call_presented") {
      tools.set(event.payload.invocationId, {
        invocationId: event.payload.invocationId,
        toolName: event.payload.toolName,
        status: "presented",
        summary: event.payload.summary,
      });
    }
    if (event.kind === "tool_result_presented") {
      const prior = tools.get(event.payload.invocationId);
      tools.set(event.payload.invocationId, {
        invocationId: event.payload.invocationId,
        toolName: prior?.toolName ?? "只读工具",
        status: event.payload.status,
        summary: event.payload.summary,
      });
      event.payload.artifactRefs.forEach((reference) => publicArtifacts.add(reference.artifactId));
    }
    if (event.kind === "verification_updated") {
      verifications.push({ verificationId: event.payload.verificationId, status: event.payload.status });
      event.payload.evidenceRefs.forEach((reference) => publicArtifacts.add(reference.artifactId));
    }
    if (event.kind === "plan_updated") {
      event.payload.steps.forEach((step) => step.evidenceRefs.forEach((reference) => publicArtifacts.add(reference.artifactId)));
    }
  }
  return { tools: [...tools.values()], verifications, publicArtifactCount: publicArtifacts.size };
}
