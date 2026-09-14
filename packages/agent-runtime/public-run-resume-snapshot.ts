import { validatePublicRunEvent } from "./public-event-decoder";
import type { PublicRunEvent } from "./public-events";
import type { JsonValue } from "../model-protocol/contracts";
import { assertPersistableJson } from "../session-store/sensitive-data";

/**
 * A deliberately separate public read model.  It is never a RunSnapshot and
 * contains no private state, model history, artifacts, or recovery bindings.
 */
export const PUBLIC_RUN_RESUME_SNAPSHOT_SCHEMA_VERSION = "meliora.public-run-resume-snapshot.v1" as const;

export type PublicRunResumePoint =
  | Readonly<{ kind: "origin" }>
  | Readonly<{ kind: "public_event"; event: PublicRunEvent }>;

export type PublicRunResumeSnapshot = Readonly<{
  schemaVersion: typeof PUBLIC_RUN_RESUME_SNAPSHOT_SCHEMA_VERSION;
  sessionId: string;
  runId: string;
  /** Fixed source-log watermark, never an SSE Last-Event-ID anchor. */
  throughSequence: number;
  /** Origin, or the exact last authorized public event in `events`. */
  resumePoint: PublicRunResumePoint;
  events: readonly PublicRunEvent[];
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

const sameJsonValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length && left.every((value, index) => sameJsonValue(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameJsonValue(left[key], right[key]));
};

/** Object key insertion order is not a public-contract distinction. */
const sameEvent = (left: PublicRunEvent, right: PublicRunEvent): boolean => sameJsonValue(left, right);

/**
 * Validate a complete externally consumable snapshot; this is intentionally
 * separate from private recovery decoding and rejects repairable-looking data.
 */
export const decodePublicRunResumeSnapshot = (value: unknown): PublicRunResumeSnapshot | null => {
  const throughSequence = isRecord(value) ? value.throughSequence : undefined;
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "sessionId", "runId", "throughSequence", "resumePoint", "events",
  ]) || value.schemaVersion !== PUBLIC_RUN_RESUME_SNAPSHOT_SCHEMA_VERSION
    || typeof value.sessionId !== "string" || typeof value.runId !== "string"
    || typeof throughSequence !== "number" || !Number.isSafeInteger(throughSequence) || throughSequence < 0 || !Array.isArray(value.events)
    || !isRecord(value.resumePoint)) return null;
  try {
    // Scan the entire public envelope, including origin snapshots with no
    // events, so resolver identifiers cannot become a leak bypass.
    assertPersistableJson(value as JsonValue, "public_resume_snapshot");
  } catch { return null; }

  const events: PublicRunEvent[] = [];
  let priorSequence = 0;
  for (const candidate of value.events) {
    const event = validatePublicRunEvent(candidate);
    if (event === null || event.sessionId !== value.sessionId || event.runId !== value.runId
      || event.sequence <= priorSequence || event.sequence > throughSequence) return null;
    priorSequence = event.sequence;
    events.push(event);
  }
  if (events.length === 0) {
    if (!hasExactKeys(value.resumePoint, ["kind"]) || value.resumePoint.kind !== "origin") return null;
  } else {
    if (!hasExactKeys(value.resumePoint, ["kind", "event"]) || value.resumePoint.kind !== "public_event") return null;
    const resumeEvent = validatePublicRunEvent(value.resumePoint.event);
    if (resumeEvent === null || !sameEvent(resumeEvent, events.at(-1)!)) return null;
  }
  return {
    schemaVersion: PUBLIC_RUN_RESUME_SNAPSHOT_SCHEMA_VERSION,
    sessionId: value.sessionId,
    runId: value.runId,
    throughSequence,
    resumePoint: events.length === 0 ? { kind: "origin" } : { kind: "public_event", event: events.at(-1)! },
    events,
  };
};
