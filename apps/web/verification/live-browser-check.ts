import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";

import { createServer as createViteServer } from "vite";
import { deepseekStreamTextSingleToolFixture } from "../../../fixtures/contracts/v1/deepseek-stream-text-single-tool";
import type { ReadOnlyRunModelPort } from "../../../packages/agent-runtime/read-only-run-loop";
import { createLocalMelioraServer } from "../../server/src/persistence";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright") as typeof import("playwright");

async function findLoopbackPort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function run(): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), "meliora-live-browser-"));
  const workspaceRoot = join(parent, "workspace");
  await mkdir(join(workspaceRoot, "packages", "agent-runtime"), { recursive: true });
  const privateMarker = "PRIVATE_WORKSPACE_BROWSER_MARKER";
  await writeFile(join(workspaceRoot, "packages", "agent-runtime", "run-state.ts"), `export const value = "${privateMarker}";\n`);
  await promisify(execFile)("git", ["init", "--quiet", workspaceRoot], {
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_"))),
    windowsHide: true,
  });
  let calls = 0;
  const longFinalAnswer = `只读检查完成。${"A".repeat(400)}`;
  const model: ReadOnlyRunModelPort = { next: async ({ modelStepId }) => {
    calls += 1;
    if (calls % 2 === 1) return deepseekStreamTextSingleToolFixture.expectedEvents.map((event) => ({ ...event, modelStepId }));
    const occurredAt = new Date().toISOString();
    return [
      { schemaVersion: "meliora.model-event.v1", modelStepId, streamIndex: 0, occurredAt, kind: "assistant_text_delta", delta: longFinalAnswer },
      { schemaVersion: "meliora.model-event.v1", modelStepId, streamIndex: 1, occurredAt, kind: "model_step_completed", finishReason: "stop" },
    ];
  } };
  const allowedHosts: string[] = [];
  const api = createLocalMelioraServer(join(parent, "state.sqlite"), {
    allowedHosts,
    turnCommands: { workspaceRoots: new Map([["workspace-browser", workspaceRoot]]), model },
    pollIntervalMs: 10,
  });
  let vite: Awaited<ReturnType<typeof createViteServer>> | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    const requests: string[] = [];
    api.server.on("request", (request) => requests.push(`${request.method} ${request.url}`));
    await new Promise<void>((resolve) => api.server.listen(0, "127.0.0.1", resolve));
    const apiPort = (api.server.address() as AddressInfo).port;
    allowedHosts.push(`127.0.0.1:${apiPort}`);
    const webPortNumber = await findLoopbackPort();
    vite = await createViteServer({
      configFile: false,
      root: join(import.meta.dirname, ".."),
      server: { host: "127.0.0.1", port: webPortNumber, strictPort: true, proxy: { "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true } } },
    });
    await vite.listen();
    const webPort = vite.httpServer!.address() as AddressInfo;
    browser = await chromium.launch(process.env.BROWSER_CHANNEL
      ? { channel: process.env.BROWSER_CHANNEL, headless: true }
      : { headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`));
    await page.goto(`http://127.0.0.1:${webPort.port}`);
    await page.getByRole("button", { name: "界面预览 · 切换" }).click();
    await page.getByRole("textbox", { name: "工作区 ID" }).fill("workspace-browser");
    await page.getByRole("textbox", { name: "输入指令" }).fill("只读检查工作区");
    await page.getByRole("button", { name: "发送" }).evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    try { await page.getByRole("heading", { name: "任务已完成" }).waitFor({ timeout: 20_000 }); }
    catch (error) {
      process.stderr.write(`Live UI state: ${await page.locator(".run-bar").innerText()} | alert=${await page.locator('[role="alert"]').allInnerTexts()} | events=${(await page.locator(".event-flow [data-event]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-event")))).join(",")} | requests=${requests.join(",")} | failedRequests=${failedRequests.join(",")} | modelCalls=${calls} | pageErrors=${pageErrors.join(",")}\n`);
      throw error;
    }
    assert.equal(requests.filter((item) => item === "POST /api/turns").length, 1);
    assert.equal(calls, 2);
    await page.getByText(longFinalAnswer, { exact: true }).waitFor();
    assert.equal((await page.locator("body").innerText()).includes(privateMarker), false);
    await page.reload();
    await page.getByRole("heading", { name: "任务已完成" }).waitFor({ timeout: 20_000 });
    assert.equal(requests.filter((item) => item === "POST /api/turns").length, 1);
    assert.ok(requests.some((item) => item.includes("/resume")));
    assert.equal(calls, 2);
    for (const width of [1440, 1100, 768, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px overflow`);
      assert.equal(await page.getByRole("heading", { name: "任务已完成" }).isVisible(), true);
    }
    await page.evaluate(() => localStorage.setItem("meliora-live-run-v1", JSON.stringify({
      kind: "pending", workspaceId: "workspace-browser", idempotencyKey: "web:unresolved",
    })));
    await page.reload();
    await page.getByRole("alert").getByText("turn_submission_outcome_unknown", { exact: false }).waitFor();
    await page.getByRole("textbox", { name: "输入指令" }).fill("不要重复提交");
    assert.equal(await page.getByRole("button", { name: "发送" }).isDisabled(), true);
    assert.equal(requests.filter((item) => item === "POST /api/turns").length, 1);
    await page.evaluate(() => localStorage.setItem("meliora-live-run-v1", JSON.stringify({
      kind: "run", workspaceId: "workspace-browser", runId: "run:stale",
    })));
    await page.reload();
    await page.getByRole("button", { name: "忘记此 Run，开始新任务" }).waitFor();
    assert.equal(requests.filter((item) => item === "POST /api/turns").length, 1);
    await page.getByRole("button", { name: "忘记此 Run，开始新任务" }).click();
    await page.getByRole("textbox", { name: "输入指令" }).fill("再次只读检查工作区");
    await page.getByRole("button", { name: "发送" }).click();
    await page.getByRole("heading", { name: "任务已完成" }).waitFor({ timeout: 20_000 });
    assert.equal(requests.filter((item) => item === "POST /api/turns").length, 2);
    assert.equal(calls, 4);
    assert.deepEqual(pageErrors, []);
    process.stdout.write("Live browser check passed: POST once per user turn, verified final answer visible, SSE terminal, refresh GET-only, pending lock, stale-run recovery, private marker absent, four widths no overflow.\n");
  } finally {
    await browser?.close();
    await vite?.close();
    await new Promise<void>((resolve) => api.server.close(() => resolve()));
    api.store.close();
    await rm(parent, { recursive: true, force: true });
  }
}

run().catch((error: unknown) => { process.stderr.write(`${String(error)}\n`); process.exitCode = 1; });
