import assert from "node:assert/strict";

import { publicRunEventReplays } from "../../fixtures/contracts/v1/public-run-event-replays";
import { decodePublicStoredEvent, type PublicRunEvent } from "../../packages/agent-runtime/index";
import type { StoredEvent } from "../../packages/session-store/contracts";

const toStored = (event: PublicRunEvent): StoredEvent => ({
  schemaVersion: "meliora.session-event.v1",
  eventId: event.eventId,
  runId: event.runId,
  attemptId: "attempt-public-decoder",
  sequence: event.sequence,
  kind: event.kind,
  visibility: event.visibility,
  payload: event.payload,
  createdAt: event.timestamp,
});

const replayStreams = Object.values(publicRunEventReplays) as unknown as readonly Readonly<{ events: readonly PublicRunEvent[] }>[];
const allEvents = replayStreams.flatMap((replay) => replay.events);
const byKind = new Map<PublicRunEvent["kind"], PublicRunEvent>(allEvents.map((event) => [event.kind, event]));
assert.equal(byKind.size, 12, "fixtures must exercise every frozen public event kind");

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const expectInvalid = (name: string, storedEvent: unknown, sessionId: unknown): void =>
  assert.equal(decodePublicStoredEvent(storedEvent, sessionId).kind, "invalid", name);
const expectPublic = (name: string, storedEvent: unknown, sessionId: unknown): void =>
  assert.equal(decodePublicStoredEvent(storedEvent, sessionId).kind, "public", name);
const eventFor = (kind: PublicRunEvent["kind"]): PublicRunEvent => byKind.get(kind)!;
const wrongPrimitive = (value: unknown): unknown => Array.isArray(value)
  ? "not-an-array"
  : typeof value === "boolean"
    ? "not-a-boolean"
    : typeof value === "string"
      ? 17
      : "not-an-object";
const optionalFields: Partial<Record<PublicRunEvent["kind"], readonly string[]>> = {
  run_status_changed: ["reason"],
  approval_requested: ["expiresAt"],
};

for (const event of allEvents) {
  const decoded = decodePublicStoredEvent(toStored(event), event.sessionId);
  assert.equal(decoded.kind, "public", `${event.kind} must decode`);
  if (decoded.kind === "public") assert.deepEqual(decoded.event, event, `${event.kind} must round-trip exactly`);
}

/** Every frozen kind rejects every required payload field when absent or wrong-typed. */
for (const [kind, event] of byKind) {
  const payload = event.payload as Record<string, unknown>;
  for (const field of Object.keys(payload).filter((key) => !optionalFields[kind]?.includes(key))) {
    const missing = clone(payload);
    delete missing[field];
    expectInvalid(`${kind}.${field} missing`, { ...toStored(event), payload: missing }, event.sessionId);

    const wrongTyped = clone(payload);
    wrongTyped[field] = wrongPrimitive(payload[field]);
    expectInvalid(`${kind}.${field} wrong primitive`, { ...toStored(event), payload: wrongTyped }, event.sessionId);
  }
  expectInvalid(`${kind} unknown payload key`, { ...toStored(event), payload: { ...payload, injected: true } }, event.sessionId);
}

const statusWithReason = allEvents.find((event) => event.kind === "run_status_changed" && "reason" in event.payload)!;
const statusWithoutReason = clone(statusWithReason.payload) as Record<string, unknown>;
delete statusWithoutReason.reason;
expectPublic("run_status_changed optional reason may be absent", { ...toStored(statusWithReason), payload: statusWithoutReason }, statusWithReason.sessionId);
expectInvalid(
  "run_status_changed optional reason must be string",
  { ...toStored(statusWithReason), payload: { ...statusWithReason.payload, reason: 17 } },
  statusWithReason.sessionId,
);

const approval = eventFor("approval_requested");
const approvalWithoutExpiry = clone(approval.payload) as Record<string, unknown>;
delete approvalWithoutExpiry.expiresAt;
expectPublic("approval_requested optional expiresAt may be absent", { ...toStored(approval), payload: approvalWithoutExpiry }, approval.sessionId);
expectInvalid(
  "approval_requested optional expiresAt must be string",
  { ...toStored(approval), payload: { ...approval.payload, expiresAt: 17 } },
  approval.sessionId,
);

for (const [name, event, path] of [
  ["run status", eventFor("run_status_changed"), ["status"]],
  ["plan step status", eventFor("plan_updated"), ["steps", 0, "status"]],
  ["tool risk", eventFor("tool_call_presented"), ["risk"]],
  ["tool result status", eventFor("tool_result_presented"), ["status"]],
  ["verification status", eventFor("verification_updated"), ["status"]],
] as const) {
  const payload = clone(event.payload) as Record<string, unknown>;
  let target: unknown = payload;
  for (const segment of path.slice(0, -1)) target = (target as Record<string | number, unknown>)[segment];
  (target as Record<string | number, unknown>)[path.at(-1)!] = "not-a-frozen-enum";
  expectInvalid(`${name} rejects illegal enum`, { ...toStored(event), payload }, event.sessionId);
}

const plan = eventFor("plan_updated");
const planPayload = plan.payload as { steps: readonly Record<string, unknown>[] };
for (const field of ["id", "title", "status", "evidenceRefs"] as const) {
  const missing = clone(planPayload) as { steps: Record<string, unknown>[] };
  delete missing.steps[0]![field];
  expectInvalid(`plan step ${field} missing`, { ...toStored(plan), payload: missing }, plan.sessionId);

  const wrongTyped = clone(planPayload) as { steps: Record<string, unknown>[] };
  wrongTyped.steps[0]![field] = wrongPrimitive(planPayload.steps[0]![field]);
  expectInvalid(`plan step ${field} wrong primitive`, { ...toStored(plan), payload: wrongTyped }, plan.sessionId);
}
const planExtra = clone(planPayload) as { steps: Record<string, unknown>[] };
planExtra.steps[0]!.injected = true;
expectInvalid("plan step rejects extra key", { ...toStored(plan), payload: planExtra }, plan.sessionId);

const toolResult = eventFor("tool_result_presented");
const artifactPayload = toolResult.payload as { artifactRefs: readonly Record<string, unknown>[] };
for (const field of ["artifactId", "visibility"] as const) {
  const missing = clone(artifactPayload) as { artifactRefs: Record<string, unknown>[] };
  delete missing.artifactRefs[0]![field];
  expectInvalid(`public artifact ref ${field} missing`, { ...toStored(toolResult), payload: { ...toolResult.payload, ...missing } }, toolResult.sessionId);

  const wrongTyped = clone(artifactPayload) as { artifactRefs: Record<string, unknown>[] };
  wrongTyped.artifactRefs[0]![field] = wrongPrimitive(artifactPayload.artifactRefs[0]![field]);
  expectInvalid(`public artifact ref ${field} wrong primitive`, { ...toStored(toolResult), payload: { ...toolResult.payload, ...wrongTyped } }, toolResult.sessionId);
}
const artifactExtra = clone(artifactPayload) as { artifactRefs: Record<string, unknown>[] };
artifactExtra.artifactRefs[0]!.injected = true;
expectInvalid("public artifact ref rejects extra key", { ...toStored(toolResult), payload: { ...toolResult.payload, ...artifactExtra } }, toolResult.sessionId);
const artifactPrivate = clone(artifactPayload) as { artifactRefs: Record<string, unknown>[] };
artifactPrivate.artifactRefs[0]!.visibility = "private";
expectInvalid("public artifact ref rejects private visibility", { ...toStored(toolResult), payload: { ...toolResult.payload, ...artifactPrivate } }, toolResult.sessionId);

for (const [name, event, replace] of [
  ["tool result artifactRefs", toolResult, (payload: Record<string, unknown>) => { payload.artifactRefs = "not-an-array"; }],
  ["verification evidenceRefs", eventFor("verification_updated"), (payload: Record<string, unknown>) => { payload.evidenceRefs = "not-an-array"; }],
  ["plan evidenceRefs", plan, (payload: Record<string, unknown>) => {
    ((payload.steps as Record<string, unknown>[])[0]!).evidenceRefs = "not-an-array";
  }],
] as const) {
  const payload = clone(event.payload) as Record<string, unknown>;
  replace(payload);
  expectInvalid(`${name} must be an array`, { ...toStored(event), payload }, event.sessionId);
}

const sensitive = "Bearer abcdefghijklmnopqrstuvwxyz";
const textPaths = (value: unknown, path: readonly (string | number)[] = []): readonly (readonly (string | number)[])[] => {
  if (typeof value === "string") return [path];
  if (Array.isArray(value)) return value.flatMap((entry, index) => textPaths(entry, [...path, index]));
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => textPaths(entry, [...path, key]));
  }
  return [];
};
const replaceAt = (value: Record<string, unknown>, path: readonly (string | number)[], replacement: string): void => {
  let target: unknown = value;
  for (const segment of path.slice(0, -1)) target = (target as Record<string | number, unknown>)[segment];
  (target as Record<string | number, unknown>)[path.at(-1)!] = replacement;
};
for (const [kind, event] of byKind) {
  for (const path of textPaths(event.payload)) {
    const payload = clone(event.payload) as Record<string, unknown>;
    replaceAt(payload, path, sensitive);
    expectInvalid(`${kind}.${path.join(".")} rejects sensitive public text`, { ...toStored(event), payload }, event.sessionId);
  }
}

const first = allEvents[0]!;
assert.equal(decodePublicStoredEvent({ ...toStored(first), visibility: "private" }, first.sessionId).kind, "suppressed");
expectInvalid("fractional sequence", { ...toStored(first), sequence: 1.5 }, first.sessionId);
expectInvalid("unknown stored envelope key", { ...toStored(first), unknownOuterField: true }, first.sessionId);
for (const field of ["eventId", "runId"] as const) {
  expectInvalid(`credential-shaped public ${field}`, { ...toStored(first), [field]: sensitive }, first.sessionId);
}
expectInvalid("credential-shaped resolver sessionId", toStored(first), sensitive);

console.log(JSON.stringify({ gate: "public-stored-event-decoder-contract", status: "PASS", kinds: byKind.size }));
