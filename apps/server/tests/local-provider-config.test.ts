import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveLocalProviderEndpoint } from "../src/local-provider-config.js";

test("official endpoints stay the default", () => {
  assert.deepEqual(resolveLocalProviderEndpoint("deepseek"), {
    endpoint: "https://api.deepseek.com/chat/completions",
    trustedEndpointOrigins: [],
  });
  assert.deepEqual(resolveLocalProviderEndpoint("kimi"), {
    endpoint: "https://api.moonshot.cn/v1/chat/completions",
    trustedEndpointOrigins: [],
  });
});

test("operator-approved gateway base URL resolves to one exact trusted origin", () => {
  assert.deepEqual(resolveLocalProviderEndpoint("deepseek", "https://gateway.example/", "https://gateway.example"), {
    endpoint: "https://gateway.example/chat/completions",
    trustedEndpointOrigins: ["https://gateway.example"],
  });
  assert.deepEqual(resolveLocalProviderEndpoint("kimi", "https://gateway.example/v1", "https://gateway.example"), {
    endpoint: "https://gateway.example/v1/chat/completions",
    trustedEndpointOrigins: ["https://gateway.example"],
  });
});

test("gateway trust fails closed on partial, mismatched, or unsafe configuration", () => {
  for (const [base, trust] of [
    ["https://gateway.example", undefined],
    [undefined, "https://gateway.example"],
    ["http://gateway.example", "http://gateway.example"],
    ["https://gateway.example", "https://other.example"],
    ["https://user:pass@gateway.example", "https://gateway.example"],
    ["https://gateway.example/?token=x", "https://gateway.example"],
    ["https://gateway.example/v1/chat/completions", "https://gateway.example"],
    ["https://gateway.example/v1", "https://gateway.example/v1"],
    ["https://gateway.example/%2e%2e/private", "https://gateway.example"],
  ] as const) {
    assert.throws(() => resolveLocalProviderEndpoint("deepseek", base, trust));
  }
});
