import assert from "node:assert/strict";
import test from "node:test";
import { computeViewportMetrics } from "../src/viewport";

test("uses layout height when VisualViewport is unavailable", () => {
  assert.deepEqual(computeViewportMetrics({ layoutHeight: 844 }), { appHeight: 844, keyboardInset: 0, keyboardOpen: false });
});

test("detects an overlay virtual keyboard at scale 1", () => {
  assert.deepEqual(computeViewportMetrics({ layoutHeight: 844, visualHeight: 512, offsetTop: 0, scale: 1 }), { appHeight: 512, keyboardInset: 332, keyboardOpen: true });
});

test("does not mistake page zoom for a virtual keyboard", () => {
  assert.deepEqual(computeViewportMetrics({ layoutHeight: 900, visualHeight: 450, offsetTop: 0, scale: 2 }), { appHeight: 450, keyboardInset: 0, keyboardOpen: false });
});

test("accounts for the visual viewport top offset", () => {
  assert.deepEqual(computeViewportMetrics({ layoutHeight: 844, visualHeight: 500, offsetTop: 24, scale: 1 }), { appHeight: 500, keyboardInset: 320, keyboardOpen: true });
});
