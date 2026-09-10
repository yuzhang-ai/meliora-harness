import assert from "node:assert/strict";

import type { NormalizedToolInvocation } from "../../packages/tool-runtime/contracts";
import {
  READ_ONLY_WORKSPACE_TOOL_DEFINITIONS,
  createReadOnlyWorkspaceTools,
  normalizeReadOnlyWorkspaceToolArguments,
  type PrivateToolArtifactWriter,
} from "../../packages/tool-runtime/read-only-workspace-tools";
import type { WorkspaceHostPort } from "../../packages/workspace-host/contracts";

const definition = (name: string) => {
  const found = READ_ONLY_WORKSPACE_TOOL_DEFINITIONS.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`missing_definition_${name}`);
  return found;
};

const invocation = (toolName: string, argumentsValue: Record<string, unknown>): NormalizedToolInvocation => ({
  schemaVersion: "meliora.tool-invocation.v1",
  invocationId: `invocation-${toolName}`,
  runId: "run-test",
  attemptId: "attempt-test",
  toolName,
  toolVersion: definition(toolName).version,
  arguments: argumentsValue as NormalizedToolInvocation["arguments"],
  argumentsHash: "arguments-hash",
  catalogHash: "catalog-hash",
  idempotencyKey: `idempotency-${toolName}`,
  status: "reserved",
});

const calls: Array<{ method: string; input: unknown }> = [];
const host: WorkspaceHostPort = {
  files: {
    list: async (input) => {
      calls.push({ method: "list", input });
      return { ok: true, value: [{ path: "src", kind: "directory" }, { path: "src/main.ts", kind: "file", size: 12 }] };
    },
    read: async (input) => {
      calls.push({ method: "read", input });
      return { ok: true, value: { content: "const token = 'API_KEY=private';\n".repeat(8_000), encoding: "utf-8", bytesRead: 240_000, truncated: false } };
    },
    search: async (input) => {
      calls.push({ method: "search", input });
      return { ok: true, value: [{ path: "src/main.ts", line: 3, preview: "const result = target;" }] };
    },
  },
  git: {
    status: async (input) => {
      calls.push({ method: "status", input });
      return { ok: true, value: { content: " M src/main.ts\n", encoding: "utf-8", bytesRead: 16, truncated: false } };
    },
    diff: async (input) => {
      calls.push({ method: "diff", input });
      return { ok: true, value: { content: "diff --git a/src/main.ts b/src/main.ts\n", encoding: "utf-8", bytesRead: 38, truncated: false } };
    },
  },
  shell: { run: async () => ({ ok: false, code: "unsupported", message: "not used", retryable: false }) },
  patch: {
    preview: async () => ({ ok: false, code: "unsupported", message: "not used", retryable: false }),
    apply: async () => ({ ok: false, code: "unsupported", message: "not used", retryable: false }),
    readback: async () => ({ ok: false, code: "unsupported", message: "not used", retryable: false }),
  },
};

const artifacts: Array<{ content: Uint8Array; visibility: "private" }> = [];
const artifactWriter: PrivateToolArtifactWriter = {
  writePrivate: async (input) => {
    artifacts.push({ content: input.content, visibility: "private" });
    return { artifactId: `private-artifact-${artifacts.length}`, visibility: "private" };
  },
};

const tools = createReadOnlyWorkspaceTools({ host, workspaceId: "workspace-server-owned", artifacts: artifactWriter });
assert.equal(tools.definitions.length, 5);
assert.deepEqual(tools.definitions.map((item) => item.name), ["list_files", "read_file", "search_text", "git_status", "git_diff"]);
assert.ok(tools.definitions.every((item) => item.risk === "L0" && item.cancellation === "none" && item.projector === "server_owned_read_only_artifact"));

for (const [toolName, argumentsValue] of [
  ["list_files", {}],
  ["read_file", { path: " ./src\\main.ts ", byteLimit: 512 }],
  ["search_text", { query: "target", paths: ["src", "src"], resultLimit: 3 }],
  ["git_status", {}],
  ["git_diff", { paths: ["src/main.ts"], staged: true }],
] as const) {
  const result = await tools.execute(invocation(toolName, argumentsValue), new AbortController().signal);
  assert.equal(result.status, "succeeded", toolName);
  assert.match(result.outputArtifactId ?? "", /^private-artifact-/u);
  assert.equal(result.verification?.status, "passed");
  assert.equal(JSON.stringify(result).includes("API_KEY=private"), false, "raw host output must not cross executor boundary");
}
assert.equal(calls.length, 5);
assert.deepEqual(calls[0], { method: "list", input: { workspaceId: "workspace-server-owned", path: ".", depth: 2, limit: 200 } });
assert.deepEqual(calls[1], { method: "read", input: { workspaceId: "workspace-server-owned", path: "src/main.ts", byteLimit: 512 } });
assert.deepEqual(calls[2], { method: "search", input: { workspaceId: "workspace-server-owned", query: "target", paths: ["src"], resultLimit: 3, byteLimit: 64 * 1024 } });
assert.deepEqual(calls[3], { method: "status", input: { workspaceId: "workspace-server-owned" } });
assert.deepEqual(calls[4], { method: "diff", input: { workspaceId: "workspace-server-owned", paths: ["src/main.ts"], staged: true, byteLimit: 64 * 1024 } });
assert.ok(artifacts.every((artifact) => artifact.visibility === "private"));
assert.ok(artifacts[1]!.content.byteLength <= definition("read_file").outputLimit, "private artifact must respect definition output cap");

const utf8Host: WorkspaceHostPort = {
  ...host,
  files: {
    ...host.files,
    read: async () => ({
      ok: true,
      value: { content: `${"a".repeat(65_535)}你`, encoding: "utf-8", bytesRead: 65_538, truncated: false },
    }),
  },
};
const utf8Artifacts: Uint8Array[] = [];
const utf8Result = await createReadOnlyWorkspaceTools({
  host: utf8Host,
  workspaceId: "workspace-server-owned",
  artifacts: {
    writePrivate: async (input) => {
      utf8Artifacts.push(input.content);
      return { artifactId: "private-artifact-utf8", visibility: "private" };
    },
  },
}).execute(invocation("read_file", { path: "utf8.txt" }), new AbortController().signal);
assert.equal(utf8Result.status, "succeeded");
assert.equal(utf8Artifacts[0]!.byteLength, 65_535, "UTF-8 truncation must stay within the byte cap");
assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(utf8Artifacts[0]!).endsWith("�"), false, "UTF-8 truncation must end at a scalar boundary");

const invalidBefore = calls.length;
for (const [toolName, argumentsValue] of [
  ["read_file", { path: "../secrets.txt" }],
  ["list_files", { path: ".", extra: true }],
  ["search_text", { query: "x", resultLimit: 1.5 }],
  ["git_status", { unexpected: "x" }],
  ["git_diff", { paths: ["C:/outside.txt"] }],
] as const) {
  const result = await tools.execute(invocation(toolName, argumentsValue), new AbortController().signal);
  assert.deepEqual(result, { status: "failed", effectSummary: "只读工具参数无效。" });
}
assert.equal(calls.length, invalidBefore, "invalid arguments must not reach Host Ports");
assert.equal(normalizeReadOnlyWorkspaceToolArguments("read_file", { path: "./a\\b.txt" }).ok, true);

const failingHost: WorkspaceHostPort = {
  ...host,
  files: {
    ...host.files,
    read: async () => ({ ok: false, code: "permission_denied", message: "Authorization: API_KEY=private", retryable: false }),
  },
};
const failed = await createReadOnlyWorkspaceTools({ host: failingHost, workspaceId: "workspace-server-owned", artifacts: artifactWriter })
  .execute(invocation("read_file", { path: "secret.txt" }), new AbortController().signal);
assert.equal(failed.status, "failed");
assert.equal(JSON.stringify(failed).includes("API_KEY=private"), false, "Host errors must use a safe mapped summary");

const aborted = new AbortController();
aborted.abort();
const callsBeforeCancel = calls.length;
const cancelled = await tools.execute(invocation("git_status", {}), aborted.signal);
assert.deepEqual(cancelled, { status: "cancelled", effectSummary: "只读工具执行已取消。" });
assert.equal(calls.length, callsBeforeCancel, "pre-cancelled invocation must not reach Host Ports");

console.log(JSON.stringify({
  gate: "meliora-m0-read-only-workspace-tools",
  status: "PASS",
  scenarios: ["five-l0-tools", "normalization", "host-failure-redaction", "pre-post-cancellation", "utf8-safe-output-cap", "private-artifacts"],
}));
