import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { deepseekStreamTextSingleToolFixture } from "../../../fixtures/contracts/v1/deepseek-stream-text-single-tool";
import type { ReadOnlyRunModelPort } from "../../../packages/agent-runtime/read-only-run-loop";
import { createLocalMelioraServer } from "../../server/src/persistence";
import { LiveRunController, TURN_COMMAND_REQUEST_SCHEMA_VERSION, WebLiveAdapter } from "../src/live-adapter";

test("real SQLite/Server/Web adapter completes one turn and restores with GET only", async () => {
  const parent = await mkdtemp(join(tmpdir(), "meliora-web-live-server-"));
  const workspaceRoot = join(parent, "workspace");
  await mkdir(join(workspaceRoot, "packages", "agent-runtime"), { recursive: true });
  await writeFile(join(workspaceRoot, "packages", "agent-runtime", "run-state.ts"), "export const example = true;\n");
  await promisify(execFile)("git", ["init", "--quiet", workspaceRoot], {
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_"))),
    windowsHide: true,
  });
  let modelCalls = 0;
  const model: ReadOnlyRunModelPort = { next: async ({ modelStepId }) => {
    modelCalls += 1;
    if (modelCalls === 1) return deepseekStreamTextSingleToolFixture.expectedEvents.map((event) => ({ ...event, modelStepId }));
    const occurredAt = new Date().toISOString();
    return [
      { schemaVersion: "meliora.model-event.v1", modelStepId, streamIndex: 0, occurredAt, kind: "assistant_text_delta", delta: "只读检查已完成。" },
      { schemaVersion: "meliora.model-event.v1", modelStepId, streamIndex: 1, occurredAt, kind: "model_step_completed", finishReason: "stop" },
    ];
  } };
  const app = createLocalMelioraServer(join(parent, "state.sqlite"), {
    turnCommands: { workspaceRoots: new Map([["workspace-test", workspaceRoot]]), model },
    pollIntervalMs: 10,
  });
  try {
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${address.port}`;
    const request = {
      schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
      workspaceId: "workspace-test",
      idempotencyKey: "web-live-server-test",
      message: "只读检查工作区",
    } as const;
    const methods: string[] = [];
    const adapter = new WebLiveAdapter(origin, async (input, init) => {
      methods.push(init?.method ?? "GET");
      return fetch(input, init);
    });
    const started = await new LiveRunController(adapter).start(request);
    assert.equal(started.phase, "terminal");
    assert.ok(started.events.some((event) => event.kind === "run_completed"),
      `unexpected events: ${started.events.map((event) => event.kind).join(", ")}`);
    assert.equal(modelCalls, 2);
    assert.deepEqual(methods, ["POST", "GET"]);
    const runId = started.identity?.runId;
    assert.ok(runId);
    methods.length = 0;
    const restored = await new LiveRunController(adapter).restore(runId);
    assert.equal(restored.phase, "terminal");
    assert.deepEqual(restored.events, started.events);
    assert.deepEqual(methods, ["GET"]);
    assert.equal(modelCalls, 2);
  } finally {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    app.store.close();
    await rm(parent, { recursive: true, force: true });
  }
});
