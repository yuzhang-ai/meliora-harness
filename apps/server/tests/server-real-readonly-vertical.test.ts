import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { deepseekStreamTextSingleToolFixture } from "../../../fixtures/contracts/v1/deepseek-stream-text-single-tool.js";
import type { PublicRunEvent } from "../../../packages/agent-runtime/public-events.js";
import { createDeepSeekChatTransport } from "../../../packages/providers/index.js";
import { SqliteSessionStore } from "../../../packages/session-store/index.js";
import {
  TURN_COMMAND_REQUEST_SCHEMA_VERSION,
  type TurnCommandResponse,
} from "../api-contracts/turn-command.js";
import { createMelioraServer } from "../src/server.js";
import {
  createFrozenReadOnlyWorkspaceCatalog,
  createProviderBackedReadOnlyRunModel,
  createTurnCommandSubmitter,
} from "../src/turn-command-composition.js";

const fixedNow = "2026-09-12T04:00:00.000Z";
const workspaceId = "workspace-provider-vertical";
const privateMarker = "SERVER_VERTICAL_PRIVATE_MARKER";

type CapturedProviderRequest = Readonly<{
  authorization: string | undefined;
  body: Readonly<Record<string, unknown>>;
}>;

const readJson = async (request: IncomingMessage): Promise<Readonly<Record<string, unknown>>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  assert.equal(typeof parsed, "object");
  assert.notEqual(parsed, null);
  assert.equal(Array.isArray(parsed), false);
  return parsed as Readonly<Record<string, unknown>>;
};

const frame = (chunk: Readonly<Record<string, unknown>>): string =>
  `data: ${JSON.stringify(chunk)}\n\n`;

const startFakeProvider = async () => {
  const captured: CapturedProviderRequest[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      assert.equal(request.url, "/deepseek/chat/completions");
      captured.push({ authorization: request.headers.authorization, body: await readJson(request) });
      response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
      if (captured.length === 1) {
        for (const chunk of deepseekStreamTextSingleToolFixture.rawChunks) response.write(frame(chunk));
      } else {
        response.write(frame({
          id: "ds-response-vertical-002",
          object: "chat.completion.chunk",
          created: 1788998401,
          model: "deepseek-chat",
          choices: [{ index: 0, delta: { content: "服务端纵向 fixture 完成。" }, finish_reason: "stop" }],
        }));
      }
      response.end("data: [DONE]\n\n");
    })().catch((error: unknown) => {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : "fixture provider failed");
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    origin: `http://127.0.0.1:${port}`,
    captured,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
};

const startApp = async (
  store: SqliteSessionStore,
  submitTurnCommand?: ReturnType<typeof createTurnCommandSubmitter>,
) => {
  const server = createMelioraServer({
    store,
    submitTurnCommand,
    resolveSessionId: (runId) => store.readRunSessionId(runId),
    pollIntervalMs: 10,
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
};

const sseEvents = (body: string): PublicRunEvent[] =>
  body.split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)) as PublicRunEvent);

const postTurn = async (url: string, message: string): Promise<Response> =>
  fetch(`${url}/api/turns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
      workspaceId,
      idempotencyKey: "provider-vertical-key",
      message,
    }),
  });

test("Server composes POST, fake Provider SSE, L0 tool, durable SSE replay, and command replay", async () => {
  const parent = await mkdtemp(join(tmpdir(), "meliora-server-provider-"));
  const workspaceRoot = join(parent, "workspace");
  const databasePath = join(parent, "meliora.sqlite");
  const sourcePath = join(workspaceRoot, "packages", "agent-runtime", "run-state.ts");
  const provider = await startFakeProvider();
  await mkdir(join(workspaceRoot, "packages", "agent-runtime"), { recursive: true });
  await writeFile(sourcePath, `export const marker = "${privateMarker}";\n`, "utf8");

  let storeNonce = 0;
  const createStore = () => new SqliteSessionStore(databasePath, {
    clock: () => new Date(fixedNow),
    nonce: () => `vertical-nonce-${++storeNonce}`,
  });
  const catalog = createFrozenReadOnlyWorkspaceCatalog();
  const transport = createDeepSeekChatTransport({
    endpoint: `${provider.origin}/deepseek/chat/completions`,
    model: "deepseek-chat",
    apiKey: "local-vertical-fixture-token",
    trustedEndpointOrigins: [provider.origin],
  });
  const model = createProviderBackedReadOnlyRunModel({
    provider: "deepseek",
    transport,
    catalog,
    now: () => fixedNow,
  });

  let store = createStore();
  const submitTurnCommand = createTurnCommandSubmitter({
    store,
    workspaceRoots: new Map([[workspaceId, workspaceRoot]]),
    model,
    now: () => fixedNow,
  });
  let app = await startApp(store, submitTurnCommand);
  let created: TurnCommandResponse;
  try {
    const create = await postTurn(app.url, "读取入口文件并给出只读结论");
    assert.equal(create.status, 202);
    created = await create.json() as TurnCommandResponse;
    assert.equal(created.disposition, "created");

    const firstReplay = await fetch(`${app.url}/api/runs/${created.runId}/events`);
    assert.equal(firstReplay.status, 200);
    const firstBody = await firstReplay.text();
    assert.equal(firstBody.includes(privateMarker), false);
    assert.equal(firstBody.includes("local-vertical-fixture-token"), false);
    assert.ok(sseEvents(firstBody).some((event) => event.kind === "run_completed"));
  } finally {
    await app.close();
    store.close();
  }

  assert.equal(provider.captured.length, 2);
  assert.match(provider.captured[0]?.authorization ?? "", /^Bearer local-vertical-fixture-token$/u);
  const secondMessages = provider.captured[1]?.body.messages;
  assert.ok(Array.isArray(secondMessages));
  const assistant = secondMessages.find((message) =>
    typeof message === "object" && message !== null && (message as { role?: unknown }).role === "assistant",
  ) as { tool_calls?: readonly { id?: string; function?: { name?: string; arguments?: string } }[] } | undefined;
  const tool = secondMessages.find((message) =>
    typeof message === "object" && message !== null && (message as { role?: unknown }).role === "tool",
  ) as { tool_call_id?: string; content?: string } | undefined;
  const invocationId = assistant?.tool_calls?.[0]?.id;
  assert.match(invocationId ?? "", /^invocation-deepseek-[a-f0-9]{16}-0-0$/u);
  assert.equal(assistant?.tool_calls?.[0]?.function?.name, "read_file");
  assert.equal(tool?.tool_call_id, invocationId);
  assert.match(tool?.content ?? "", new RegExp(privateMarker, "u"));

  store = createStore();
  app = await startApp(store);
  try {
    const replay = await fetch(`${app.url}/api/runs/${created.runId}/events`);
    assert.equal(replay.status, 200);
    const replayBody = await replay.text();
    assert.ok(sseEvents(replayBody).some((event) => event.kind === "run_completed"));
  } finally {
    await app.close();
    store.close();
  }
  assert.equal(provider.captured.length, 2);

  store = createStore();
  const replaySubmitter = createTurnCommandSubmitter({
    store,
    workspaceRoots: new Map([[workspaceId, workspaceRoot]]),
    model,
    now: () => fixedNow,
  });
  app = await startApp(store, replaySubmitter);
  try {
    const replayResponse = await postTurn(app.url, "读取入口文件并给出只读结论");
    assert.equal(replayResponse.status, 200);
    const replayed = await replayResponse.json() as TurnCommandResponse;
    assert.equal(replayed.disposition, "replay");
    assert.equal(replayed.commandStatus, "terminal");
    assert.equal(replayed.terminalStatus, "completed");
    assert.equal(replayed.runId, created.runId);
  } finally {
    await app.close();
    store.close();
    await provider.close();
    await rm(parent, { recursive: true, force: true, maxRetries: 3 });
  }
  assert.equal(provider.captured.length, 2);
});
