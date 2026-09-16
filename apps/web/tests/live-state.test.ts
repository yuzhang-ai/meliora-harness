import test from "node:test";
import assert from "node:assert/strict";

import { publicRunEventReplays } from "../../../fixtures/contracts/v1/public-run-event-replays";
import { PUBLIC_RUN_RESUME_SNAPSHOT_SCHEMA_VERSION, type PublicRunResumeSnapshot } from "../../../packages/agent-runtime/public-run-resume-snapshot";
import { initialLiveRunState, reduceLiveRun } from "../src/live-state";

const events = publicRunEventReplays["read-only-success"].events;
const identity = { sessionId: events[0]!.sessionId, runId: events[0]!.runId };

const snapshot = (selected = events.slice(0, 2), throughSequence = selected.at(-1)?.sequence ?? 0): PublicRunResumeSnapshot => ({
  schemaVersion: PUBLIC_RUN_RESUME_SNAPSHOT_SCHEMA_VERSION,
  sessionId: identity.sessionId,
  runId: identity.runId,
  throughSequence,
  resumePoint: selected.length === 0 ? { kind: "origin" } : { kind: "public_event", event: selected.at(-1)! },
  events: selected,
});

test("new submission reaches terminal only from a terminal public event", () => {
  let state = reduceLiveRun(initialLiveRunState(), { type: "submit_requested" });
  state = reduceLiveRun(state, { type: "command_accepted", identity });
  state = reduceLiveRun(state, { type: "stream_opened" });
  for (const event of events) state = reduceLiveRun(state, { type: "event_received", event });
  assert.equal(state.phase, "terminal");
  assert.equal(state.cursor, events.at(-1)!.sequence);
  assert.equal(state.events.length, events.length);
});

test("resume uses the last public event as cursor, never throughSequence", () => {
  let state = reduceLiveRun(initialLiveRunState(), { type: "resume_requested", runId: identity.runId });
  state = reduceLiveRun(state, { type: "resume_loaded", snapshot: snapshot(events.slice(0, 2), 999) });
  assert.equal(state.phase, "connecting");
  assert.equal(state.cursor, events[1]!.sequence);
  assert.notEqual(state.cursor, 999);
});

test("reconnect preserves the run identity and counts reconnect attempts", () => {
  let state = reduceLiveRun(initialLiveRunState(), { type: "resume_requested", runId: identity.runId });
  state = reduceLiveRun(state, { type: "resume_loaded", snapshot: snapshot(events.slice(0, 1)) });
  state = reduceLiveRun(state, { type: "stream_opened" });
  state = reduceLiveRun(state, { type: "stream_closed" });
  state = reduceLiveRun(state, { type: "reconnect_requested" });
  assert.equal(state.phase, "connecting");
  assert.equal(state.reconnectCount, 1);
  assert.throws(() => reduceLiveRun(state, { type: "resume_requested", runId: "another-run" }), /runId changed/u);
});

test("event scope drift and sequence content drift fail closed while exact replay is idempotent", () => {
  let state = reduceLiveRun(initialLiveRunState(), { type: "resume_requested", runId: identity.runId });
  state = reduceLiveRun(state, { type: "resume_loaded", snapshot: snapshot(events.slice(0, 1)) });
  state = reduceLiveRun(state, { type: "stream_opened" });
  assert.equal(reduceLiveRun(state, { type: "event_received", event: events[0]! }), state);
  assert.throws(() => reduceLiveRun(state, { type: "event_received", event: { ...events[0]!, timestamp: "2099-01-01T00:00:00.000Z" } }), /content changed/u);
  assert.throws(() => reduceLiveRun(state, { type: "event_received", event: { ...events[1]!, runId: "wrong-run" } }), /scope changed/u);
});

test("resume rejects a changed sessionId for an existing run identity", () => {
  let state = reduceLiveRun(initialLiveRunState(), { type: "resume_requested", runId: identity.runId });
  state = reduceLiveRun(state, { type: "resume_loaded", snapshot: snapshot(events.slice(0, 1)) });
  state = reduceLiveRun(state, { type: "stream_opened" });
  state = reduceLiveRun(state, { type: "stream_closed" });
  state = reduceLiveRun(state, { type: "reconnect_requested" });
  state = reduceLiveRun(state, { type: "resume_requested", runId: identity.runId });
  assert.throws(() => reduceLiveRun(state, { type: "resume_loaded", snapshot: { ...snapshot(), sessionId: "other-session" } }), /identity changed/u);
});
