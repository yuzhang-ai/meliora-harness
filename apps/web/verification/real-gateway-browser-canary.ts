/** Manual, paid, one-shot WP-5 acceptance. Never run from CI. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";

import { createServer as createViteServer } from "vite";
import { createDeepSeekChatTransport } from "../../../packages/providers/index.js";
import { createFrozenReadOnlyWorkspaceCatalog, createProviderBackedReadOnlyRunModel } from "../../server/src/turn-command-composition.js";
import { createLocalMelioraServer } from "../../server/src/persistence.js";
import { resolveLocalProviderEndpoint } from "../../server/src/local-provider-config.js";
import { canaryGitEnvironment } from "./canary-git-env.js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright") as typeof import("playwright");
const Database = require("better-sqlite3") as typeof import("better-sqlite3");

async function run(): Promise<void> {
  const key = process.env.MELIORA_API_KEY;
  const baseUrl = process.env.MELIORA_GATEWAY_BASE_URL;
  const origin = process.env.MELIORA_TRUSTED_PROVIDER_ORIGIN;
  const parent = process.env.MELIORA_CANARY_DIR;
  if (!key || !baseUrl || !origin || !parent) throw new Error("Missing canary configuration.");
  const parsed = new URL(baseUrl);
  assert.equal(parsed.origin, "https://ai-openapi.beschannels.com");
  assert.equal(parsed.pathname, "/v1", "Gateway API base must include /v1, not just the website origin.");
  const endpointConfig = resolveLocalProviderEndpoint("deepseek", baseUrl, origin);
  assert.equal(process.env.MELIORA_MODEL, "deepseek-v4-flash");
  assert.equal(isAbsolute(parent), true, "Canary directory must be absolute.");
  const relativeParent = relative(resolve(import.meta.dirname, "..", "..", ".."), resolve(parent));
  const insideRepository = relativeParent === "" || (!isAbsolute(relativeParent)
    && relativeParent !== ".." && !relativeParent.startsWith(`..${sep}`));
  assert.equal(insideRepository, false, "Canary data must be outside the repository.");
  assert.deepEqual(await readdir(parent), [], "Canary directory must be fresh and empty.");
  const workspaceRoot = join(parent, "workspace");
  const databasePath = join(parent, "state.sqlite");
  await mkdir(workspaceRoot, { recursive: false });
  await promisify(execFile)("git", ["init", "--quiet", workspaceRoot], {
    env: canaryGitEnvironment(),
    windowsHide: true,
  });

  let providerCalls = 0;
  let safeProviderFailureCode: string | null = null;
  let upstreamHttpStatus: number | null = null;
  let upstreamContentType: "sse" | "json" | "other" | null = null;
  const transport = createDeepSeekChatTransport({
    endpoint: endpointConfig.endpoint,
    model: "deepseek-v4-flash", apiKey: key,
    trustedEndpointOrigins: endpointConfig.trustedEndpointOrigins, maxOutputTokens: 2048, timeoutMs: 40_000,
    fetchImplementation: async (input, init) => {
      const response = await fetch(input, init);
      upstreamHttpStatus = response.status;
      const contentType = response.headers.get("content-type") ?? "";
      upstreamContentType = contentType.includes("text/event-stream") ? "sse"
        : contentType.includes("application/json") ? "json" : "other";
      return response;
    },
  });
  const model = createProviderBackedReadOnlyRunModel({
    provider: "deepseek", catalog: createFrozenReadOnlyWorkspaceCatalog(), now: () => new Date().toISOString(),
    transport: { next: async (input) => {
      if (providerCalls >= 2) throw new Error("Canary Model Step budget exceeded.");
      providerCalls += 1;
      try {
        const events = await transport.next(input);
        const failed = events.find((event) => event.kind === "model_step_failed");
        if (failed?.kind === "model_step_failed") safeProviderFailureCode = /^[a-z_]{1,80}$/u.test(failed.code) ? failed.code : "unclassified";
        return events;
      } catch {
        safeProviderFailureCode = "transport_exception";
        throw new Error("Provider transport failed; raw details withheld.");
      }
    } },
  });
  const allowedHosts: string[] = [];
  const api = createLocalMelioraServer(databasePath, {
    allowedHosts,
    turnCommands: { workspaceRoots: new Map([["workspace-wp5-browser", workspaceRoot]]), model },
    pollIntervalMs: 20,
  });
  let vite: Awaited<ReturnType<typeof createViteServer>> | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    const requests: string[] = [];
    api.server.on("request", (request) => requests.push(`${request.method} ${request.url}`));
    await new Promise<void>((resolve) => api.server.listen(0, "127.0.0.1", resolve));
    const apiPort = (api.server.address() as AddressInfo).port;
    allowedHosts.push(`127.0.0.1:${apiPort}`);
    vite = await createViteServer({
      configFile: false, root: join(import.meta.dirname, ".."),
      server: { host: "127.0.0.1", port: 0, strictPort: false,
        proxy: { "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true } } },
    });
    await vite.listen();
    const webPort = (vite.httpServer!.address() as AddressInfo).port;
    browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "msedge", headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const failedResponses: number[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.name));
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push("console_error"); });
    page.on("requestfailed", () => failedRequests.push("request_failed"));
    page.on("response", (response) => { if (response.status() >= 400) failedResponses.push(response.status()); });
    await page.goto(`http://127.0.0.1:${webPort}`);
    await page.getByRole("button", { name: "界面预览 · 切换" }).click();
    await page.getByRole("textbox", { name: "工作区 ID" }).fill("workspace-wp5-browser");
    await page.getByRole("textbox", { name: "输入指令" }).fill("请只读检查这个空 Git 仓库的状态。优先调用 git_status；不要创建、修改或删除文件。最后简短说明检查结果。");
    await page.getByRole("button", { name: "发送" }).click();
    const terminal = page.locator('.event-flow [data-event="run_completed"], .event-flow [data-event="run_blocked"], .event-flow [data-event="run_failed"]');
    await terminal.waitFor({ timeout: 90_000 });
    const outcome = await terminal.first().getAttribute("data-event");
    assert.equal(requests.filter((item) => item === "POST /api/turns").length, 1);
    const liveEventKinds = await page.locator(".event-flow [data-event]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-event")));
    const browserContainsKey = async (): Promise<boolean> => {
      const visibleText = await page.locator("body").innerText();
      const storage = await page.evaluate(() => {
        const entries = (area: Storage): string[] => Array.from({ length: area.length }, (_, index) => {
          const name = area.key(index) ?? "";
          return `${name}\n${area.getItem(name) ?? ""}`;
        });
        return [...entries(localStorage), ...entries(sessionStorage)];
      });
      return visibleText.includes(key) || storage.some((entry) => entry.includes(key));
    };
    assert.equal(await browserContainsKey(), false, "Credential found in browser state before refresh.");
    const beforeReloadRequestCount = requests.length;
    await page.reload();
    await terminal.waitFor({ timeout: 20_000 });
    const restoredEventKinds = await page.locator(".event-flow [data-event]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-event")));
    assert.deepEqual(restoredEventKinds, liveEventKinds);
    assert.equal(requests.filter((item) => item === "POST /api/turns").length, 1);
    const reloadRequests = requests.slice(beforeReloadRequestCount);
    assert.ok(reloadRequests.some((item) => /^GET \/api\/runs\/[^/]+\/resume$/u.test(item)));
    assert.ok(reloadRequests.every((item) => item.startsWith("GET /api/")), "Refresh must only read from the API.");
    assert.equal(await browserContainsKey(), false, "Credential found in browser state after refresh.");
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(failedRequests, []);
    assert.deepEqual(failedResponses, []);
    const bytes = [Buffer.from(key, "utf8"), Buffer.from(key, "utf16le")];
    const dbFiles = (await readdir(parent)).filter((name) => /^state\.sqlite(?:-wal|-shm)?$/u.test(name));
    const leakedFiles: string[] = [];
    for (const name of dbFiles) {
      const content = await readFile(join(parent, name));
      if (bytes.some((secret) => content.includes(secret))) leakedFiles.push(name);
    }
    assert.deepEqual(leakedFiles, []);
    const db = new Database(databasePath, { readonly: true });
    const receiptRows = db.prepare("SELECT receipt_json,reservation_id,receipt_id,run_id,attempt_id FROM receipts").all() as {
      receipt_json: string; reservation_id: string; receipt_id: string; run_id: string; attempt_id: string;
    }[];
    const receiptSummaries = receiptRows.map((row) => {
      const receipt = JSON.parse(row.receipt_json) as { toolName?: string; status?: string };
      return { toolName: receipt.toolName, status: receipt.status };
    });
    const receiptCount = receiptSummaries.length;
    const invocationCount = (db.prepare("SELECT COUNT(*) AS count FROM invocations").get() as { count: number }).count;
    const terminalModelSteps = (db.prepare("SELECT COUNT(*) AS count FROM model_steps WHERE status='terminal'").get() as { count: number }).count;
    const storedPublicKinds = (db.prepare("SELECT kind FROM events WHERE visibility='public' ORDER BY sequence").all() as { kind: string }[]).map((row) => row.kind);
    const bindings = db.prepare("SELECT reservation_id,receipt_id,run_id,attempt_id,expected_sequence,first_sequence,last_sequence,events_json FROM receipt_public_event_bindings").all() as {
      reservation_id: string; receipt_id: string; run_id: string; attempt_id: string;
      expected_sequence: number; first_sequence: number; last_sequence: number; events_json: string;
    }[];
    const bindingsValid = bindings.length === receiptCount && new Set(bindings.map((binding) => binding.reservation_id)).size === receiptCount
      && bindings.every((binding) => {
        const receipt = receiptRows.find((row) => row.reservation_id === binding.reservation_id);
        if (!receipt || receipt.receipt_id !== binding.receipt_id || receipt.run_id !== binding.run_id || receipt.attempt_id !== binding.attempt_id
          || binding.first_sequence !== binding.expected_sequence + 1 || binding.last_sequence < binding.first_sequence) return false;
        const events = JSON.parse(binding.events_json) as { eventId: string; runId: string; attemptId: string; sequence: number; kind: string }[];
        const stored = db.prepare("SELECT event_id,sequence,kind FROM events WHERE run_id=? AND visibility='public' AND sequence BETWEEN ? AND ? ORDER BY sequence")
          .all(binding.run_id, binding.first_sequence, binding.last_sequence) as { event_id: string; sequence: number; kind: string }[];
        return events.length === binding.last_sequence - binding.first_sequence + 1 && events.length === stored.length
          && events.some((event) => event.kind === "tool_result_presented")
          && events.every((event, index) => event.runId === binding.run_id && event.attemptId === binding.attempt_id
            && event.sequence === binding.first_sequence + index && event.sequence === stored[index]?.sequence
            && event.eventId === stored[index]?.event_id && event.kind === stored[index]?.kind);
      });
    db.close();
    assert.deepEqual(restoredEventKinds, storedPublicKinds);
    const allowedTools = new Set(createFrozenReadOnlyWorkspaceCatalog().definitions.map((definition) => definition.name));
    const receiptsValid = receiptCount > 0 && receiptCount === invocationCount
      && receiptSummaries.some((receipt) => receipt.toolName === "git_status")
      && receiptSummaries.every((receipt) => receipt.status === "succeeded" && receipt.toolName && allowedTools.has(receipt.toolName));
    const { stdout: workspaceStatus } = await promisify(execFile)("git", ["-C", workspaceRoot, "status", "--porcelain"], {
      env: canaryGitEnvironment(),
      windowsHide: true,
    });
    process.stdout.write(JSON.stringify({ outcome, postCount: 1, providerCalls, safeProviderFailureCode, upstreamHttpStatus, upstreamContentType, receiptCount, receiptTools: receiptSummaries.map((receipt) => receipt.toolName), receiptBindingsValid: bindingsValid, terminalModelSteps, refreshGetOnly: true, publicEventsMatch: true, workspaceClean: workspaceStatus.trim() === "", pageErrors: 0, credentialBytesInDbFiles: false, dbFiles, canaryDir: parent }) + "\n");
    assert.equal(outcome, "run_completed", "Real browser run did not complete.");
    assert.equal(receiptsValid, true, "Expected valid read-only tool Receipts for all invocations.");
    assert.equal(bindingsValid, true, "Receipt/public event durable bindings are inconsistent.");
    assert.equal(terminalModelSteps, providerCalls);
    assert.equal(workspaceStatus.trim(), "", "Read-only canary workspace changed.");
  } finally {
    await browser?.close();
    await vite?.close();
    await new Promise<void>((resolve) => api.server.close(() => resolve()));
    api.store.close();
  }
}

run().catch((error: unknown) => {
  process.stderr.write(`WP-5 browser canary stopped: ${error instanceof Error ? error.name : "unknown"}. Inspect preserved canary database before any new request.\n`);
  process.exitCode = 1;
});
