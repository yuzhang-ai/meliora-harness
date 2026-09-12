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

const toolContentFromBody = (body: Readonly<Record<string, unknown>>): string => {
  const messages = body.messages;
  if (!Array.isArray(messages)) return "";
  const toolMessage = messages.find((message) =>
    typeof message === "object" && message !== null && (message as { role?: unknown }).role === "tool",
  ) as { content?: unknown } | undefined;
  return typeof toolMessage?.content === "string" ? toolMessage.content : "";
};

type EchoScenario = Readonly<{
  name: string;
  assistantText(input: Readonly<{ toolContent: string; sourceContent: string }>): string;
}>;

const echoScenarios: readonly EchoScenario[] = [
  { name: "exact-tool-result", assistantText: ({ toolContent }) => toolContent },
  { name: "substring-marker", assistantText: ({ sourceContent }) => sourceContent.match(/SERVER_VERTICAL_PRIVATE_MARKER/u)?.[0] ?? sourceContent },
  {
    name: "newline-interpolated-token",
    assistantText: ({ sourceContent }) => {
      const marker = sourceContent.match(/SERVER_VERTICAL_PRIVATE_MARKER/u)?.[0] ?? sourceContent;
      return `${marker.slice(0, 10)}\n${marker.slice(10)}`;
    },
  },
  { name: "percent-encoded-tool-result", assistantText: ({ toolContent }) => encodeURIComponent(toolContent) },
];

const startFakeProvider = async (echoAssistantText: EchoScenario["assistantText"], sourceContent: string) => {
  const captured: CapturedProviderRequest[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      assert.equal(request.url, "/deepseek/chat/completions");
      const body = await readJson(request);
      captured.push({ authorization: request.headers.authorization, body });
      response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
      if (captured.length === 1) {
        for (const chunk of deepseekStreamTextSingleToolFixture.rawChunks) response.write(frame(chunk));
      } else {
        const echoedToolContent = toolContentFromBody(body);
        const assistantText = echoAssistantText({ toolContent: echoedToolContent, sourceContent });
        response.write(frame({
          id: "ds-response-vertical-002",
          object: "chat.completion.chunk",
          created: 1788998401,
          model: "deepseek-chat",
          choices: [{ index: 0, delta: { content: assistantText }, finish_reason: "stop" }],
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

type ProviderFailureScenario = Readonly<{
  name: string;
  timeoutMs?: number;
  respond(response: ServerResponse): void | Promise<void>;
}>;

const providerFailureScenarios: readonly ProviderFailureScenario[] = [
  {
    name: "timeout-after-request",
    timeoutMs: 10,
    respond: async (response) => {
      response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
      response.flushHeaders();
      await new Promise((resolve) => setTimeout(resolve, 100));
    },
  },
  {
    name: "connection-interruption",
    respond: (response) => {
      response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
      response.write('data: {"choices":[{"index":0,"delta":{"content":"partial"}}]}\n\n');
      response.destroy();
    },
  },
  {
    name: "malformed-json-stream",
    respond: (response) => {
      response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
      response.end("data: {not-json}\n\n");
    },
  },
];

const startFailingProvider = async (scenario: ProviderFailureScenario) => {
  const captured: CapturedProviderRequest[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      assert.equal(request.url, "/deepseek/chat/completions");
      captured.push({ authorization: request.headers.authorization, body: await readJson(request) });
      await scenario.respond(response);
    })().catch((error: unknown) => {
      if (!response.headersSent) response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
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

const postTurn = async (url: string, message: string, idempotencyKey = "provider-vertical-key"): Promise<Response> =>
  fetch(`${url}/api/turns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
      workspaceId,
      idempotencyKey,
      message,
    }),
  });

for (const echoScenario of echoScenarios) {
test(`Server redacts post-tool assistant text for ${echoScenario.name} private echo`, async () => {
  const parent = await mkdtemp(join(tmpdir(), "meliora-server-provider-"));
  const workspaceRoot = join(parent, "workspace");
  const databasePath = join(parent, "meliora.sqlite");
  const sourcePath = join(workspaceRoot, "packages", "agent-runtime", "run-state.ts");
  const sourceContent = [
    `export const marker = "${privateMarker}";`,
    `export const redactionProbe = "provider must not echo raw workspace text publicly";`,
  ].join("\n");
  const attemptedAssistantText = echoScenario.assistantText({ toolContent: sourceContent, sourceContent });
  const provider = await startFakeProvider(echoScenario.assistantText, sourceContent);
  await mkdir(join(workspaceRoot, "packages", "agent-runtime"), { recursive: true });
  await writeFile(sourcePath, `${sourceContent}\n`, "utf8");

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
    const events = sseEvents(firstBody);
    const visibleAssistantText = events
      .filter((event): event is Extract<PublicRunEvent, { kind: "assistant_text_delta" }> => event.kind === "assistant_text_delta")
      .map((event) => event.payload.delta)
      .join("");
    const publicStoredEvents = (await store.readEvents({ runId: created.runId, limit: 100 })).events
      .filter((event) => event.visibility === "public");
    const publicArtifactIds = new Set<string>();
    for (const event of events) {
      if (event.kind === "tool_result_presented") {
        event.payload.artifactRefs.forEach((ref) => publicArtifactIds.add(ref.artifactId));
      }
      if (event.kind === "verification_updated") {
        event.payload.evidenceRefs.forEach((ref) => publicArtifactIds.add(ref.artifactId));
      }
    }
    const publicArtifactContents: string[] = [];
    for (const artifactId of publicArtifactIds) {
      const artifact = await store.getArtifact(artifactId);
      if (artifact?.visibility === "public") publicArtifactContents.push(new TextDecoder().decode(artifact.content));
    }
    const publicSurface = JSON.stringify({
      sseBody: firstBody,
      events,
      publicStoredEvents,
      publicArtifactContents,
      snapshot: await store.readSnapshot(created.runId),
      visibleAssistantText,
    });
    for (const forbiddenValue of [
      privateMarker,
      sourceContent,
      ...sourceContent.split("\n"),
      attemptedAssistantText,
      encodeURIComponent(sourceContent),
      "local-vertical-fixture-token",
    ]) {
      assert.equal(publicSurface.includes(forbiddenValue), false, "public projection must not leak private Provider, workspace, or artifact data");
    }
    assert.match(visibleAssistantText, /我先读取入口文件。/u, "safe assistant text before any private tool observation should still stream publicly");
    assert.equal(visibleAssistantText.includes(attemptedAssistantText), false);
    assert.match(visibleAssistantText, /模型已基于私有工具结果生成回复，内容已隐藏/u);
    assert.ok(events.some((event) => event.kind === "run_completed"));
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
  assert.equal(tool?.content, sourceContent);

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
}

for (const providerScenario of providerFailureScenarios) {
test(`Server blocks ambiguous Provider ${providerScenario.name} without retry permission`, async () => {
  const parent = await mkdtemp(join(tmpdir(), "meliora-server-provider-failure-"));
  const workspaceRoot = join(parent, "workspace");
  const databasePath = join(parent, "meliora.sqlite");
  const provider = await startFailingProvider(providerScenario);
  await mkdir(workspaceRoot, { recursive: true });

  let storeNonce = 0;
  const store = new SqliteSessionStore(databasePath, {
    clock: () => new Date(fixedNow),
    nonce: () => `failure-nonce-${++storeNonce}`,
  });
  const catalog = createFrozenReadOnlyWorkspaceCatalog();
  const transport = createDeepSeekChatTransport({
    endpoint: `${provider.origin}/deepseek/chat/completions`,
    model: "deepseek-chat",
    apiKey: "local-provider-failure-token",
    trustedEndpointOrigins: [provider.origin],
    timeoutMs: providerScenario.timeoutMs ?? 1_000,
  });
  const model = createProviderBackedReadOnlyRunModel({
    provider: "deepseek",
    transport,
    catalog,
    now: () => fixedNow,
  });
  const idempotencyKey = `provider-failure-${providerScenario.name}`;
  const submitTurnCommand = createTurnCommandSubmitter({
    store,
    workspaceRoots: new Map([[workspaceId, workspaceRoot]]),
    model,
    now: () => fixedNow,
  });
  const app = await startApp(store, submitTurnCommand);
  try {
    const create = await postTurn(app.url, "触发 Provider 模糊失败", idempotencyKey);
    assert.equal(create.status, 202);
    const created = await create.json() as TurnCommandResponse;
    assert.equal(created.disposition, "created");

    const eventsResponse = await fetch(`${app.url}/api/runs/${created.runId}/events`);
    assert.equal(eventsResponse.status, 200);
    const eventBody = await eventsResponse.text();
    const events = sseEvents(eventBody);
    assert.ok(events.some((event) => event.kind === "run_blocked"));
    assert.equal(events.some((event) => event.kind === "run_failed"), false);
    assert.equal(eventBody.includes("\"retryable\":true"), false);
    assert.equal(eventBody.includes("provider_timeout"), false);
    assert.equal(eventBody.includes("provider_malformed_stream"), false);
    assert.equal(eventBody.includes("provider_unavailable"), false);
    assert.equal(eventBody.includes("local-provider-failure-token"), false);

    const checkpoint = await store.readLatestModelStep({ runId: created.runId });
    assert.equal(checkpoint?.status, "started");
    const command = await store.readRunCommand({
      localPrincipalId: "local-user",
      workspaceId,
      idempotencyKey,
    });
    assert.equal(command?.status, "terminal");
    assert.equal(command?.status === "terminal" ? command.terminalStatus : null, "blocked");
    assert.equal(command?.status === "terminal" ? command.terminalCode : null, "model_step_outcome_unknown");
    assert.equal(provider.captured.length, 1);

    const replayResponse = await postTurn(app.url, "触发 Provider 模糊失败", idempotencyKey);
    assert.equal(replayResponse.status, 200);
    const replayed = await replayResponse.json() as TurnCommandResponse;
    assert.equal(replayed.disposition, "replay");
    assert.equal(replayed.commandStatus, "terminal");
    assert.equal(replayed.terminalStatus, "blocked");
    assert.equal(replayed.terminalCode, "model_step_outcome_unknown");
    assert.equal(provider.captured.length, 1);
  } finally {
    await app.close();
    store.close();
    await provider.close();
    await rm(parent, { recursive: true, force: true, maxRetries: 3 });
  }
});
}

test("Server keeps definite Provider authentication rejection as a failed checkpoint", async () => {
  const parent = await mkdtemp(join(tmpdir(), "meliora-server-provider-auth-"));
  const workspaceRoot = join(parent, "workspace");
  const databasePath = join(parent, "meliora.sqlite");
  const captured: CapturedProviderRequest[] = [];
  const providerServer = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      assert.equal(request.url, "/deepseek/chat/completions");
      captured.push({ authorization: request.headers.authorization, body: await readJson(request) });
      response.writeHead(401, { "content-type": "application/json", "x-provider-private": "not-public" });
      response.end('{"error":"private auth failure"}');
    })().catch((error: unknown) => {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : "fixture provider failed");
    });
  });
  await new Promise<void>((resolve, reject) => {
    providerServer.once("error", reject);
    providerServer.listen(0, "127.0.0.1", resolve);
  });
  const providerOrigin = `http://127.0.0.1:${(providerServer.address() as AddressInfo).port}`;
  await mkdir(workspaceRoot, { recursive: true });

  let storeNonce = 0;
  const store = new SqliteSessionStore(databasePath, {
    clock: () => new Date(fixedNow),
    nonce: () => `auth-nonce-${++storeNonce}`,
  });
  const catalog = createFrozenReadOnlyWorkspaceCatalog();
  const transport = createDeepSeekChatTransport({
    endpoint: `${providerOrigin}/deepseek/chat/completions`,
    model: "deepseek-chat",
    apiKey: "local-provider-auth-token",
    trustedEndpointOrigins: [providerOrigin],
  });
  const model = createProviderBackedReadOnlyRunModel({
    provider: "deepseek",
    transport,
    catalog,
    now: () => fixedNow,
  });
  const idempotencyKey = "provider-auth-rejected";
  const submitTurnCommand = createTurnCommandSubmitter({
    store,
    workspaceRoots: new Map([[workspaceId, workspaceRoot]]),
    model,
    now: () => fixedNow,
  });
  const app = await startApp(store, submitTurnCommand);
  try {
    const create = await postTurn(app.url, "触发 Provider 认证拒绝", idempotencyKey);
    assert.equal(create.status, 202);
    const created = await create.json() as TurnCommandResponse;

    const eventsResponse = await fetch(`${app.url}/api/runs/${created.runId}/events`);
    assert.equal(eventsResponse.status, 200);
    const eventBody = await eventsResponse.text();
    const events = sseEvents(eventBody);
    const failed = events.find((event): event is Extract<PublicRunEvent, { kind: "run_failed" }> => event.kind === "run_failed");
    assert.ok(failed);
    assert.equal(failed.payload.code, "provider_authentication_failed");
    assert.equal(failed.payload.retryable, false);
    assert.equal(eventBody.includes("local-provider-auth-token"), false);
    assert.equal(eventBody.includes("private auth failure"), false);

    const checkpoint = await store.readLatestModelStep({ runId: created.runId });
    assert.equal(checkpoint?.status, "failed");
    assert.equal(checkpoint?.status === "failed" ? checkpoint.failureCode : null, "provider_authentication_failed");
    const command = await store.readRunCommand({
      localPrincipalId: "local-user",
      workspaceId,
      idempotencyKey,
    });
    assert.equal(command?.status, "terminal");
    assert.equal(command?.status === "terminal" ? command.terminalStatus : null, "failed");
    assert.equal(command?.status === "terminal" ? command.terminalCode : null, "provider_authentication_failed");
    assert.equal(captured.length, 1);

    const replayResponse = await postTurn(app.url, "触发 Provider 认证拒绝", idempotencyKey);
    assert.equal(replayResponse.status, 200);
    assert.equal(captured.length, 1);
  } finally {
    await app.close();
    store.close();
    providerServer.closeAllConnections();
    await new Promise<void>((resolve, reject) => providerServer.close((error) => error ? reject(error) : resolve()));
    await rm(parent, { recursive: true, force: true, maxRetries: 3 });
  }
});
