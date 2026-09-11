import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { deepseekStreamTextSingleToolFixture } from "../../fixtures/contracts/v1/deepseek-stream-text-single-tool";
import { kimiStreamTextSingleToolFixture } from "../../fixtures/contracts/v1/kimi-stream-text-single-tool";
import type { CanonicalInputMessage } from "../../packages/model-protocol/contracts";
import {
  createDeepSeekChatTransport,
  createKimiChatTransport,
  createOpenAiCompatibleChatTransport,
  OpenAiCompatibleTransportConfigurationError,
  type ProviderCodecContext,
} from "../../packages/providers";

type CapturedRequest = Readonly<{ path: string; authorization: string | undefined; body: unknown }>;

async function readJson(request: IncomingMessage): Promise<unknown> {
  const parts: Buffer[] = [];
  for await (const part of request) parts.push(Buffer.from(part));
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}

async function fragmentedWrite(response: ServerResponse, text: string): Promise<void> {
  for (let offset = 0; offset < text.length; offset += 7) {
    await new Promise<void>((resolve, reject) => {
      response.write(text.slice(offset, offset + 7), (error) => error == null ? resolve() : reject(error));
    });
  }
}

function frame(chunk: Readonly<Record<string, unknown>>, multiline = false): string {
  const json = JSON.stringify(chunk);
  if (!multiline) return `data: ${json}\r\n\r\n`;
  const split = json.indexOf(",");
  return `data: ${json.slice(0, split + 1)}\r\ndata: ${json.slice(split + 1)}\r\n\r\n`;
}

async function startFixtureServer(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
): Promise<Readonly<{ origin: string; close: () => Promise<void> }>> {
  const server = createServer((request, response) => { void handler(request, response); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fixture_server_address_unavailable");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => { server.close(); await once(server, "close"); },
  };
}

function trustFixtureOrigin(origin: string): Readonly<{ trustedEndpointOrigins: readonly string[] }> {
  return { trustedEndpointOrigins: [origin] };
}

function fixtureContext(provider: "deepseek" | "kimi", modelStepId: string, timestampPrefix: string): ProviderCodecContext {
  return {
    modelStepId,
    occurredAt: (index) => `${timestampPrefix}.${String(index * 10).padStart(3, "0")}Z`,
    createInvocationId: ({ choiceIndex, toolCallIndex }) => `invocation-${provider}-${choiceIndex}-${toolCallIndex}`,
  };
}

const historyWithToolResult: readonly CanonicalInputMessage[] = [
  { role: "user", content: "检查这个项目" },
  {
    role: "assistant",
    content: "",
    toolCalls: [{ invocationId: "invocation-history-0", providerToolCallId: "provider-history-0", toolName: "git_status", rawArguments: "{}" }],
  },
  { role: "tool", invocationId: "invocation-history-0", content: "{\"clean\":true}" },
];

const requestTools = [{
  name: "git_status",
  description: "Read the current Git status.",
  inputSchema: { type: "object", additionalProperties: false },
}] as const;

test("DeepSeek and Kimi use only the local fixture server and normalize the same OpenAI SSE shape", async () => {
  const captured: CapturedRequest[] = [];
  const app = await startFixtureServer(async (request, response) => {
    captured.push({ path: request.url ?? "", authorization: request.headers.authorization, body: await readJson(request) });
    const fixture = request.url?.startsWith("/deepseek/")
      ? deepseekStreamTextSingleToolFixture
      : kimiStreamTextSingleToolFixture;
    response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
    await fragmentedWrite(response, ": local fixture keepalive\r\n\r\n");
    for (let index = 0; index < fixture.rawChunks.length; index += 1) {
      await fragmentedWrite(response, frame(fixture.rawChunks[index]!, index === 0));
    }
    await fragmentedWrite(response, "data: [DONE]\r\n\r\n");
    response.end();
  });
  try {
    const deepseek = createDeepSeekChatTransport({
      endpoint: `${app.origin}/deepseek/chat/completions`, model: "fixture-model", apiKey: "local-deepseek-fixture-token", ...trustFixtureOrigin(app.origin),
    });
    const kimi = createKimiChatTransport({
      endpoint: `${app.origin}/kimi/chat/completions`, model: "fixture-model", apiKey: "local-kimi-fixture-token", ...trustFixtureOrigin(app.origin),
    });
    const [deepseekEvents, kimiEvents] = await Promise.all([
      deepseek.next({ messages: historyWithToolResult, tools: requestTools, context: fixtureContext("deepseek", "model-step-deepseek-001", "2026-09-10T00:00:00") }),
      kimi.next({ messages: historyWithToolResult, tools: requestTools, context: fixtureContext("kimi", "model-step-kimi-001", "2026-09-10T00:01:00") }),
    ]);
    assert.deepEqual(deepseekEvents, deepseekStreamTextSingleToolFixture.expectedEvents);
    assert.deepEqual(kimiEvents, kimiStreamTextSingleToolFixture.expectedEvents);
    assert.equal(captured.length, 2);
    for (const request of captured) {
      assert.match(request.path, /^\/(deepseek|kimi)\/chat\/completions$/u);
      assert.match(request.authorization ?? "", /^Bearer local-(deepseek|kimi)-fixture-token$/u);
      assert.deepEqual(request.body, {
        model: "fixture-model",
        stream: true,
        messages: [
          { role: "user", content: "检查这个项目" },
          { role: "assistant", content: "", tool_calls: [{ id: "invocation-history-0", type: "function", function: { name: "git_status", arguments: "{}" } }] },
          { role: "tool", tool_call_id: "invocation-history-0", content: "{\"clean\":true}" },
        ],
        tools: [{ type: "function", function: { name: "git_status", description: "Read the current Git status.", parameters: { type: "object", additionalProperties: false } } }],
      });
    }
  } finally {
    await app.close();
  }
});

test("transport failure events never contain the local endpoint, authorization, or response body", async () => {
  const app = await startFixtureServer(async (_request, response) => {
    response.writeHead(401, { "content-type": "application/json", "x-provider-private": "not-public" });
    response.end('{"error":"private response body"}');
  });
  try {
    const events = await createDeepSeekChatTransport({
      endpoint: `${app.origin}/status/chat/completions`, model: "fixture-model", apiKey: "local-test-token", ...trustFixtureOrigin(app.origin),
    }).next({ messages: [{ role: "user", content: "x" }], context: fixtureContext("deepseek", "status-401", "2026-09-11T00:00:00") });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.kind, "model_step_failed");
    assert.equal(events[0]?.kind === "model_step_failed" && events[0].code, "provider_authentication_failed");
    const publicShape = JSON.stringify(events);
    assert.doesNotMatch(publicShape, /127\.0\.0\.1|local-test-token|private response|x-provider-private/iu);
  } finally {
    await app.close();
  }
});

test("an explicit finish_reason is accepted as a terminal stream when a provider omits [DONE]", async () => {
  const app = await startFixtureServer(async (_request, response) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    for (const chunk of deepseekStreamTextSingleToolFixture.rawChunks) response.write(frame(chunk));
    response.end();
  });
  try {
    const events = await createDeepSeekChatTransport({
      endpoint: `${app.origin}/terminal/chat/completions`, model: "fixture-model", apiKey: "local-test-token", ...trustFixtureOrigin(app.origin),
    }).next({ messages: [{ role: "user", content: "x" }], context: fixtureContext("deepseek", "model-step-deepseek-001", "2026-09-10T00:00:00") });
    assert.deepEqual(events, deepseekStreamTextSingleToolFixture.expectedEvents);
  } finally { await app.close(); }
});

test("[DONE] immediately releases a provider connection that remains open", async () => {
  const app = await startFixtureServer(async (_request, response) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write('data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n');
    response.write("data: [DONE]\n\n");
    // Deliberately do not end: the client must treat [DONE] as terminal.
  });
  try {
    const startedAt = Date.now();
    const events = await createDeepSeekChatTransport({
      endpoint: `${app.origin}/done-without-eof/chat/completions`, model: "fixture-model", apiKey: "local-test-token", timeoutMs: 1_000, ...trustFixtureOrigin(app.origin),
    }).next({ messages: [{ role: "user", content: "x" }], context: fixtureContext("deepseek", "done", "2026-09-11T00:00:30") });
    assert.equal(events[0]?.kind === "model_step_completed" && events[0].finishReason, "stop");
    assert.ok(Date.now() - startedAt < 500, "[DONE] should not wait for EOF or timeout");
  } finally { await app.close(); }
});

test("malformed content, missing terminal marker, event limits, and stream limits stop as malformed_stream", async (t) => {
  const cases = [
    { path: "/content-type/chat/completions", headers: { "content-type": "application/json" }, body: "{}", options: {} },
    { path: "/response-limit/chat/completions", headers: { "content-type": "text/event-stream", "content-length": "33" }, body: "x".repeat(33), options: { maxResponseBytes: 32 } },
    { path: "/bare-done/chat/completions", headers: { "content-type": "text/event-stream" }, body: "data: [DONE]\n\n", options: {} },
    { path: "/delta-done/chat/completions", headers: { "content-type": "text/event-stream" }, body: 'data: {"choices":[{"index":0,"delta":{"content":"x"}}]}\n\ndata: [DONE]\n\n', options: {} },
    { path: "/no-terminal/chat/completions", headers: { "content-type": "text/event-stream" }, body: 'data: {"choices":[{"index":0,"delta":{"content":"x"}}]}\n\n', options: {} },
    { path: "/event-limit/chat/completions", headers: { "content-type": "text/event-stream" }, body: `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "0123456789" } }] })}\n\n`, options: { maxEventBytes: 8 } },
    { path: "/stream-limit/chat/completions", headers: { "content-type": "text/event-stream" }, body: "data: {\"choices\":[]}\n\ndata: [DONE]\n\n", options: { maxStreamBytes: 8 } },
  ] as const;
  for (const scenario of cases) await t.test(scenario.path, async () => {
    const app = await startFixtureServer(async (request, response) => {
      if (request.url !== scenario.path) throw new Error("unexpected_fixture_path");
      await readJson(request);
      response.writeHead(200, scenario.headers);
      response.end(scenario.body);
    });
    try {
      const events = await createKimiChatTransport({
        endpoint: `${app.origin}${scenario.path}`, model: "fixture-model", apiKey: "local-test-token", ...trustFixtureOrigin(app.origin), ...scenario.options,
      }).next({ messages: [{ role: "user", content: "x" }], context: fixtureContext("kimi", "malformed", "2026-09-11T00:01:00") });
      assert.equal(events[0]?.kind === "model_step_failed" && events[0].code, "provider_malformed_stream");
    } finally { await app.close(); }
  });
});

test("status mapping, timeout, and caller abort remain distinguishable", async (t) => {
  await t.test("429 and 500 retain their stable existing classifications", async () => {
    for (const [status, expected] of [[429, "provider_rate_limited"], [500, "provider_unavailable"]] as const) {
      const app = await startFixtureServer(async (_request, response) => { response.writeHead(status); response.end("private"); });
      try {
        const events = await createDeepSeekChatTransport({ endpoint: `${app.origin}/status/chat/completions`, model: "fixture-model", apiKey: "local-test-token", ...trustFixtureOrigin(app.origin) })
          .next({ messages: [{ role: "user", content: "x" }], context: fixtureContext("deepseek", `status-${status}`, "2026-09-11T00:02:00") });
        assert.equal(events[0]?.kind === "model_step_failed" && events[0].code, expected);
      } finally { await app.close(); }
    }
  });
  await t.test("timeout produces a canonical timeout event", async () => {
    const app = await startFixtureServer(async (_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.flushHeaders();
      await new Promise((resolve) => setTimeout(resolve, 100));
      response.end();
    });
    try {
      const events = await createKimiChatTransport({ endpoint: `${app.origin}/slow/chat/completions`, model: "fixture-model", apiKey: "local-test-token", timeoutMs: 10, ...trustFixtureOrigin(app.origin) })
        .next({ messages: [{ role: "user", content: "x" }], context: fixtureContext("kimi", "timeout", "2026-09-11T00:03:00") });
      assert.equal(events[0]?.kind === "model_step_failed" && events[0].code, "provider_timeout");
    } finally { await app.close(); }
  });
  await t.test("a caller abort returns a canonical cancelled terminal event", async () => {
    const app = await startFixtureServer(async (_request, response) => { await new Promise((resolve) => setTimeout(resolve, 100)); response.end(); });
    try {
      const controller = new AbortController();
      const promise = createDeepSeekChatTransport({ endpoint: `${app.origin}/abort/chat/completions`, model: "fixture-model", apiKey: "local-test-token", timeoutMs: 1_000, ...trustFixtureOrigin(app.origin) })
        .next({ messages: [{ role: "user", content: "x" }], context: fixtureContext("deepseek", "aborted", "2026-09-11T00:04:00"), signal: controller.signal });
      controller.abort();
      const events = await promise;
      assert.deepEqual(events.map((event) => event.kind === "model_step_completed" ? event.finishReason : event.kind), ["cancelled"]);
    } finally { await app.close(); }
  });
});

test("configuration rejects non-loopback HTTP and endpoint secrets without echoing them", () => {
  const secretEndpoint = "http://example.test/chat/completions?private=token#fragment";
  assert.throws(() => createOpenAiCompatibleChatTransport({
    provider: "deepseek", endpoint: secretEndpoint, model: "fixture-model", apiKey: "local-test-token",
  }), (error: unknown) => {
    assert.ok(error instanceof OpenAiCompatibleTransportConfigurationError);
    assert.doesNotMatch(error.message, /example|private|token/iu);
    return true;
  });
  assert.throws(() => createOpenAiCompatibleChatTransport({
    provider: "kimi", endpoint: "https://name:pass@example.test/chat/completions", model: "fixture-model", apiKey: "local-test-token",
  }), OpenAiCompatibleTransportConfigurationError);
});

test("untrusted HTTPS origins never receive a request, while a custom gateway needs an explicit exact-origin opt-in", async () => {
  let fetchCalls = 0;
  const fakeFetch: typeof fetch = async () => {
    fetchCalls += 1;
    return new Response('data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
  };
  assert.throws(() => createOpenAiCompatibleChatTransport({
    provider: "deepseek", endpoint: "https://attacker.invalid/chat/completions", model: "fixture-model", apiKey: "local-test-token", fetchImplementation: fakeFetch,
  }), OpenAiCompatibleTransportConfigurationError);
  assert.equal(fetchCalls, 0);
  assert.throws(() => createOpenAiCompatibleChatTransport({
    provider: "deepseek", endpoint: "http://127.0.0.1:9999/chat/completions", model: "fixture-model", apiKey: "local-test-token", fetchImplementation: fakeFetch,
  }), OpenAiCompatibleTransportConfigurationError);
  assert.equal(fetchCalls, 0);

  const events = await createOpenAiCompatibleChatTransport({
    provider: "deepseek", endpoint: "https://gateway.example.test/chat/completions", model: "fixture-model", apiKey: "local-test-token",
    trustedEndpointOrigins: ["https://gateway.example.test"], fetchImplementation: fakeFetch,
  }).next({ messages: [{ role: "user", content: "x" }], context: fixtureContext("deepseek", "gateway", "2026-09-11T00:04:30") });
  assert.equal(events[0]?.kind === "model_step_completed" && events[0].finishReason, "stop");
  assert.equal(fetchCalls, 1);
});

test("transport disables redirects before credentials reach fetch and does not expose redirect targets", async () => {
  let redirectPolicy: RequestRedirect | undefined;
  const events = await createOpenAiCompatibleChatTransport({
    provider: "deepseek", endpoint: "https://api.deepseek.com/chat/completions", model: "fixture-model", apiKey: "local-test-token",
    fetchImplementation: async (_input, init) => {
      redirectPolicy = init?.redirect;
      return Response.redirect("https://attacker.invalid/credential-sink", 302);
    },
  }).next({ messages: [{ role: "user", content: "x" }], context: fixtureContext("deepseek", "redirect", "2026-09-11T00:04:45") });
  assert.equal(redirectPolicy, "error");
  assert.equal(events[0]?.kind === "model_step_failed" && events[0].code, "provider_request_failed");
  assert.doesNotMatch(JSON.stringify(events), /attacker\.invalid|credential-sink/iu);
});

test("outbound tool associations always use unique Runtime invocation IDs", async () => {
  let requestBody: unknown;
  const fakeFetch: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response('data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
  };
  const transport = createOpenAiCompatibleChatTransport({
    provider: "kimi", endpoint: "https://api.moonshot.cn/chat/completions", model: "fixture-model", apiKey: "local-test-token", fetchImplementation: fakeFetch,
  });
  await transport.next({
    messages: [
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { invocationId: "runtime-1", providerToolCallId: "duplicate-provider-id", toolName: "read_file", rawArguments: "{}" },
          { invocationId: "runtime-2", providerToolCallId: "duplicate-provider-id", toolName: "git_status", rawArguments: "{}" },
          { invocationId: "runtime-3", toolName: "list_files", rawArguments: "{}" },
        ],
      },
      { role: "tool", invocationId: "runtime-1", content: "one" },
      { role: "tool", invocationId: "runtime-2", content: "two" },
      { role: "tool", invocationId: "runtime-3", content: "three" },
    ],
    context: fixtureContext("kimi", "runtime-ids", "2026-09-11T00:04:50"),
  });
  assert.deepEqual(requestBody, {
    model: "fixture-model",
    stream: true,
    messages: [
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "runtime-1", type: "function", function: { name: "read_file", arguments: "{}" } },
          { id: "runtime-2", type: "function", function: { name: "git_status", arguments: "{}" } },
          { id: "runtime-3", type: "function", function: { name: "list_files", arguments: "{}" } },
        ],
      },
      { role: "tool", tool_call_id: "runtime-1", content: "one" },
      { role: "tool", tool_call_id: "runtime-2", content: "two" },
      { role: "tool", tool_call_id: "runtime-3", content: "three" },
    ],
  });
});

test("duplicate, malformed, and orphan Runtime invocation IDs fail before fetch", async () => {
  let fetchCalls = 0;
  const transport = createOpenAiCompatibleChatTransport({
    provider: "deepseek", endpoint: "https://api.deepseek.com/chat/completions", model: "fixture-model", apiKey: "local-test-token",
    fetchImplementation: async () => { fetchCalls += 1; return new Response(); },
  });
  const context = fixtureContext("deepseek", "bad-runtime-id", "2026-09-11T00:04:55");
  for (const messages of [
    [
      { role: "assistant" as const, content: "", toolCalls: [
        { invocationId: "duplicate", toolName: "one", rawArguments: "{}" },
        { invocationId: "duplicate", toolName: "two", rawArguments: "{}" },
      ] },
    ],
    [{ role: "assistant" as const, content: "", toolCalls: [{ invocationId: "bad\nid", toolName: "one", rawArguments: "{}" }] }],
    [{ role: "tool" as const, invocationId: "orphan", content: "x" }],
  ] satisfies readonly CanonicalInputMessage[][]) {
    await assert.rejects(transport.next({ messages, context }), OpenAiCompatibleTransportConfigurationError);
  }
  assert.equal(fetchCalls, 0);
});

test("direct fetch rejection, invalid JSON, and UTF-8 byte fragmentation keep the stable boundary", async (t) => {
  await t.test("a direct fetch rejection becomes provider_unavailable without its private reason", async () => {
    const events = await createOpenAiCompatibleChatTransport({
      provider: "kimi", endpoint: "https://api.moonshot.cn/chat/completions", model: "fixture-model", apiKey: "local-test-token",
      fetchImplementation: async () => { throw new Error("private network failure"); },
    }).next({ messages: [{ role: "user", content: "x" }], context: fixtureContext("kimi", "fetch-rejection", "2026-09-11T00:05:00") });
    assert.equal(events[0]?.kind === "model_step_failed" && events[0].code, "provider_unavailable");
    assert.doesNotMatch(JSON.stringify(events), /private network failure/iu);
  });

  await t.test("invalid SSE JSON becomes provider_malformed_stream", async () => {
    const events = await createOpenAiCompatibleChatTransport({
      provider: "deepseek", endpoint: "https://api.deepseek.com/chat/completions", model: "fixture-model", apiKey: "local-test-token",
      fetchImplementation: async () => new Response("data: {not-json}\n\n", { headers: { "content-type": "text/event-stream" } }),
    }).next({ messages: [{ role: "user", content: "x" }], context: fixtureContext("deepseek", "invalid-json", "2026-09-11T00:05:30") });
    assert.equal(events[0]?.kind === "model_step_failed" && events[0].code, "provider_malformed_stream");
  });

  await t.test("a Chinese UTF-8 scalar split across bytes decodes without replacement or corruption", async () => {
    const payload = new TextEncoder().encode(
      'data: {"id":"utf8-response","choices":[{"index":0,"delta":{"content":"中文分片"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    );
    const firstChineseByte = payload.findIndex((byte) => byte === 0xe4);
    assert.ok(firstChineseByte > 0);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(payload.slice(0, firstChineseByte + 1));
        controller.enqueue(payload.slice(firstChineseByte + 1));
        controller.close();
      },
    });
    const events = await createOpenAiCompatibleChatTransport({
      provider: "deepseek", endpoint: "https://api.deepseek.com/chat/completions", model: "fixture-model", apiKey: "local-test-token",
      fetchImplementation: async () => new Response(body, { headers: { "content-type": "text/event-stream" } }),
    }).next({ messages: [{ role: "user", content: "x" }], context: fixtureContext("deepseek", "utf8", "2026-09-11T00:06:00") });
    assert.equal(events[0]?.kind === "assistant_text_delta" && events[0].delta, "中文分片");
    assert.equal(events[1]?.kind === "model_step_completed" && events[1].finishReason, "stop");
  });
});
