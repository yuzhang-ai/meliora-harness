import type { JsonObject, JsonValue } from "../model-protocol/contracts";
import { assertPersistableJson } from "../session-store/sensitive-data";
import type { StoredEvent } from "../session-store/contracts";
import { PUBLIC_RUN_EVENT_SCHEMA_VERSION, type PublicRunEvent } from "./public-events";
import type { RunStatus } from "./run-state";

/** A private record is intentionally invisible; public malformed records are quarantined. */
export type DecodedPublicStoredEvent =
  | Readonly<{ kind: "public"; event: PublicRunEvent }>
  | Readonly<{ kind: "suppressed" }>
  | Readonly<{ kind: "invalid" }>;

const PUBLIC_KINDS = new Set<PublicRunEvent["kind"]>([
  "run_status_changed", "assistant_text_delta", "plan_updated", "tool_call_presented",
  "approval_requested", "tool_result_presented", "context_compacted", "verification_updated",
  "run_blocked", "run_completed", "run_failed", "run_cancelled",
]);

const RUN_STATUSES = new Set<RunStatus>([
  "created", "preparing", "model_streaming", "tool_assembling", "awaiting_approval",
  "executing_tools", "compacting", "verifying", "completed", "failed", "cancelled", "blocked",
]);

const hasExactKeys = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean => {
  const keys = Object.keys(value);
  return keys.length >= required.length
    && required.every((key) => Object.hasOwn(value, key))
    && keys.every((key) => required.includes(key) || optional.includes(key));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";
const isSafeSequence = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const isPublicArtifactRef = (value: unknown): boolean =>
  isRecord(value)
  && hasExactKeys(value, ["artifactId", "visibility"])
  && isString(value.artifactId)
  && value.visibility === "public";

const isPublicArtifactRefArray = (value: unknown): value is unknown[] =>
  Array.isArray(value) && value.every(isPublicArtifactRef);

const isPlanStep = (value: unknown): boolean =>
  isRecord(value)
  && hasExactKeys(value, ["id", "title", "status", "evidenceRefs"])
  && isString(value.id)
  && isString(value.title)
  && ["pending", "in_progress", "completed", "blocked", "skipped"].includes(value.status as string)
  && isPublicArtifactRefArray(value.evidenceRefs);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString);

const isPayloadForKind = (kind: PublicRunEvent["kind"], value: unknown): value is JsonObject => {
  if (!isRecord(value)) return false;
  switch (kind) {
    case "run_status_changed":
      return hasExactKeys(value, ["status"], ["reason"])
        && RUN_STATUSES.has(value.status as RunStatus)
        && (value.reason === undefined || isString(value.reason));
    case "assistant_text_delta":
      return hasExactKeys(value, ["delta"]) && isString(value.delta);
    case "plan_updated":
      return hasExactKeys(value, ["steps"]) && Array.isArray(value.steps) && value.steps.every(isPlanStep);
    case "tool_call_presented":
      return hasExactKeys(value, ["invocationId", "toolName", "risk", "summary"])
        && isString(value.invocationId) && isString(value.toolName)
        && ["L0", "L1", "L2", "L3"].includes(value.risk as string) && isString(value.summary);
    case "approval_requested":
      return hasExactKeys(value, ["approvalId", "invocationId", "argumentsHash", "summary"], ["expiresAt"])
        && isString(value.approvalId) && isString(value.invocationId) && isString(value.argumentsHash)
        && isString(value.summary) && (value.expiresAt === undefined || isString(value.expiresAt));
    case "tool_result_presented":
      return hasExactKeys(value, ["invocationId", "status", "summary", "artifactRefs"])
        && isString(value.invocationId) && ["succeeded", "failed", "cancelled"].includes(value.status as string)
        && isString(value.summary) && isPublicArtifactRefArray(value.artifactRefs);
    case "context_compacted":
      return hasExactKeys(value, ["checkpointId", "summary"])
        && isString(value.checkpointId) && isString(value.summary);
    case "verification_updated":
      return hasExactKeys(value, ["verificationId", "status", "evidenceRefs"])
        && isString(value.verificationId) && ["passed", "failed", "not_run"].includes(value.status as string)
        && isPublicArtifactRefArray(value.evidenceRefs);
    case "run_blocked":
      return hasExactKeys(value, ["code", "message", "userActions"])
        && isString(value.code) && isString(value.message) && isStringArray(value.userActions);
    case "run_completed":
      return hasExactKeys(value, ["outcomeId", "summary"])
        && isString(value.outcomeId) && isString(value.summary);
    case "run_failed":
      return hasExactKeys(value, ["code", "retryable", "message"])
        && isString(value.code) && typeof value.retryable === "boolean" && isString(value.message);
    case "run_cancelled":
      return hasExactKeys(value, ["reason"]) && isString(value.reason);
  }
};

const isStoredPublicEnvelope = (value: unknown): value is StoredEvent =>
  isRecord(value)
  && hasExactKeys(value, [
    "schemaVersion", "eventId", "runId", "attemptId", "sequence", "kind", "visibility", "payload", "createdAt",
  ], ["causationId", "correlationId"])
  && value.schemaVersion === "meliora.session-event.v1"
  && isString(value.eventId) && isString(value.runId) && isString(value.attemptId)
  && isSafeSequence(value.sequence) && isString(value.kind) && value.visibility === "public"
  && isString(value.createdAt)
  && (value.causationId === undefined || isString(value.causationId))
  && (value.correlationId === undefined || isString(value.correlationId));

/**
 * Decode the only persisted shape that may reach a browser.  It never repairs
 * malformed data or projects a partial payload: callers either emit the exact
 * public envelope, suppress a private record, or quarantine the record.
 */
export const decodePublicStoredEvent = (storedEvent: unknown, sessionId: unknown): DecodedPublicStoredEvent => {
  if (isRecord(storedEvent) && storedEvent.visibility === "private") return { kind: "suppressed" };
  if (!isStoredPublicEnvelope(storedEvent) || !isString(sessionId)) return { kind: "invalid" };
  if (!PUBLIC_KINDS.has(storedEvent.kind as PublicRunEvent["kind"])) return { kind: "invalid" };
  const kind = storedEvent.kind as PublicRunEvent["kind"];
  if (!isPayloadForKind(kind, storedEvent.payload)) return { kind: "invalid" };
  const event = {
    schemaVersion: PUBLIC_RUN_EVENT_SCHEMA_VERSION,
    eventId: storedEvent.eventId,
    sessionId,
    runId: storedEvent.runId,
    sequence: storedEvent.sequence,
    timestamp: storedEvent.createdAt,
    visibility: "public",
    kind,
    payload: storedEvent.payload as Extract<PublicRunEvent, { kind: typeof kind }>["payload"],
  } as PublicRunEvent;
  return validatePublicRunEvent(event) === null ? { kind: "invalid" } : { kind: "public", event };
};

/** Strict validator for values that are already in the browser event shape. */
export const validatePublicRunEvent = (value: unknown): PublicRunEvent | null => {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "eventId", "sessionId", "runId", "sequence", "timestamp", "visibility", "kind", "payload",
  ])) return null;
  if (value.schemaVersion !== PUBLIC_RUN_EVENT_SCHEMA_VERSION || !isString(value.eventId)
    || !isString(value.sessionId) || !isString(value.runId) || !isSafeSequence(value.sequence)
    || !isString(value.timestamp) || value.visibility !== "public" || !isString(value.kind)
    || !PUBLIC_KINDS.has(value.kind as PublicRunEvent["kind"])
    || !isPayloadForKind(value.kind as PublicRunEvent["kind"], value.payload)) return null;
  try {
    assertPersistableJson(value as unknown as JsonValue, "public_event");
  } catch {
    return null;
  }
  return value as PublicRunEvent;
};
