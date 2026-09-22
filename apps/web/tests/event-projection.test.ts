import assert from "node:assert/strict";
import test from "node:test";
import type { PublicRunEvent } from "../../../packages/agent-runtime/public-events";
import { projectEvidence, projectTimeline } from "../src/event-projection";
import { streamFor } from "../src/replay";

test("assistant stream deltas are grouped without changing event order", () => {
  const assistant: Extract<PublicRunEvent, { kind: "assistant_text_delta" }> = {
    schemaVersion: "meliora.public-run-event.v1",
    eventId: "assistant:1",
    sessionId: "session-product-shell",
    runId: "run-product-shell",
    sequence: 1,
    timestamp: "2026-09-22T00:00:00.000Z",
    visibility: "public",
    kind: "assistant_text_delta",
    payload: { delta: "只读检查" },
  };
  const items = projectTimeline([assistant, { ...assistant, eventId: "assistant:2", sequence: 2 }]);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.kind, "assistant");
  if (items[0]?.kind === "assistant") assert.equal(items[0].text, assistant.payload.delta.repeat(2));
});

test("evidence projection uses only public tool and verification summaries", () => {
  const evidence = projectEvidence(streamFor("read-only-success"));
  assert.ok(evidence.tools.length > 0);
  assert.ok(evidence.tools.some((tool) => tool.status === "succeeded"));
  assert.ok(evidence.verifications.some((verification) => verification.status === "passed"));
});
