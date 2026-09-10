import { createHash } from "node:crypto";

import type { JsonObject, JsonValue } from "../model-protocol/contracts";
import type { HostResult, TruncatedText, WorkspaceHostPort } from "../workspace-host/contracts";
import type { NormalizedToolInvocation, ToolDefinition } from "./contracts";

const TOOL_VERSION = "1.0.0";
const DEFAULT_LIST_DEPTH = 2;
const DEFAULT_LIST_LIMIT = 200;
const DEFAULT_READ_BYTES = 64 * 1024;
const DEFAULT_SEARCH_RESULTS = 50;
const DEFAULT_SEARCH_BYTES = 64 * 1024;
const DEFAULT_GIT_BYTES = 64 * 1024;
const MAX_PATH_LENGTH = 4_096;
const MAX_QUERY_LENGTH = 16 * 1024;

type ReadOnlyToolName = "list_files" | "read_file" | "search_text" | "git_status" | "git_diff";

export type ReadOnlyWorkspaceToolArtifact = Readonly<{
  artifactId: string;
  visibility: "private";
}>;

/**
 * Tool Runtime writes raw Host observations only through this server-owned
 * boundary. The resulting artifact is private; callers must not turn its ID
 * into a public reference without a separate visibility check and projector.
 */
export type PrivateToolArtifactWriter = Readonly<{
  writePrivate(input: Readonly<{
    mediaType: "text/plain";
    content: Uint8Array;
    contentHash: string;
    metadata: JsonObject;
  }>): Promise<ReadOnlyWorkspaceToolArtifact>;
}>;

/**
 * This is deliberately structurally compatible with agent-runtime's execution
 * input, but is owned by tool-runtime to preserve the one-way dependency graph.
 */
export type ReadOnlyWorkspaceToolExecution = Readonly<{
  status: "succeeded" | "failed" | "cancelled";
  /** Safe status text only: never raw file, Git, or Host error content. */
  effectSummary: string;
  /** Always private when present. A server-owned projector may read it later. */
  outputArtifactId?: string;
  verification?: Readonly<{
    verificationId: string;
    status: "passed" | "failed" | "not_run";
    evidenceArtifactIds: readonly string[];
  }>;
}>;

export type ReadOnlyWorkspaceToolPort = Readonly<{
  execute(invocation: NormalizedToolInvocation, signal: AbortSignal): Promise<ReadOnlyWorkspaceToolExecution>;
}>;

/**
 * The server composition owns this projector. It must read private artifacts,
 * apply its redaction/classification policy, and create separate public
 * artifacts before returning any model or UI-facing content. Tool Runtime never
 * treats a private artifact ID as public evidence.
 */
export type ServerOwnedReadOnlyToolProjector = Readonly<{
  project(input: Readonly<{
    definition: ToolDefinition;
    invocation: NormalizedToolInvocation;
    execution: ReadOnlyWorkspaceToolExecution;
  }>): Promise<Readonly<{
    modelContent: string;
    publicSummary: string;
    publicArtifactIds: readonly string[];
    publicVerificationArtifactIds: readonly string[];
  }>>;
}>;

type NormalizedArguments =
  | Readonly<{ toolName: "list_files"; value: Readonly<{ path: string; depth: number; limit: number }> }>
  | Readonly<{ toolName: "read_file"; value: Readonly<{ path: string; byteLimit: number }> }>
  | Readonly<{ toolName: "search_text"; value: Readonly<{ query: string; paths: readonly string[]; resultLimit: number; byteLimit: number }> }>
  | Readonly<{ toolName: "git_status"; value: Record<never, never> }>
  | Readonly<{ toolName: "git_diff"; value: Readonly<{ paths: readonly string[]; staged: boolean; byteLimit: number }> }>;

type NormalizationResult = Readonly<{ ok: true; normalized: NormalizedArguments }> | Readonly<{ ok: false }>;

type ToolOutput = Readonly<{
  text: string;
  summary: string;
  truncated: boolean;
  metadata: JsonObject;
}>;

const schema = (properties: JsonObject, required: readonly string[] = []): JsonObject => ({
  type: "object",
  additionalProperties: false,
  properties,
  ...(required.length === 0 ? {} : { required: [...required] }),
});

const integerSchema = (minimum: number, maximum: number): JsonObject => ({ type: "integer", minimum, maximum });
const pathSchema: JsonObject = { type: "string", minLength: 1, maxLength: MAX_PATH_LENGTH };

export const READ_ONLY_WORKSPACE_TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    schemaVersion: "meliora.tool.v1", name: "list_files", version: TOOL_VERSION,
    description: "List files under a workspace-relative directory.",
    inputSchema: schema({ path: pathSchema, depth: integerSchema(0, 32), limit: integerSchema(0, 10_000) }),
    schemaDialect: "https://json-schema.org/draft/2020-12/schema", risk: "L0", timeoutMs: 10_000, outputLimit: 64 * 1024,
    capabilities: ["workspace.files.list"], cancellation: "none", projector: "server_owned_read_only_artifact",
  },
  {
    schemaVersion: "meliora.tool.v1", name: "read_file", version: TOOL_VERSION,
    description: "Read a bounded workspace-relative text file.",
    inputSchema: schema({ path: pathSchema, byteLimit: integerSchema(0, DEFAULT_READ_BYTES) }, ["path"]),
    schemaDialect: "https://json-schema.org/draft/2020-12/schema", risk: "L0", timeoutMs: 10_000, outputLimit: DEFAULT_READ_BYTES,
    capabilities: ["workspace.files.read"], cancellation: "none", projector: "server_owned_read_only_artifact",
  },
  {
    schemaVersion: "meliora.tool.v1", name: "search_text", version: TOOL_VERSION,
    description: "Search workspace text files within bounded paths and output.",
    inputSchema: schema({
      query: { type: "string", minLength: 1, maxLength: MAX_QUERY_LENGTH },
      paths: { type: "array", maxItems: 128, items: pathSchema },
      resultLimit: integerSchema(0, 1_000), byteLimit: integerSchema(0, DEFAULT_SEARCH_BYTES),
    }, ["query"]),
    schemaDialect: "https://json-schema.org/draft/2020-12/schema", risk: "L0", timeoutMs: 15_000, outputLimit: DEFAULT_SEARCH_BYTES,
    capabilities: ["workspace.files.search"], cancellation: "none", projector: "server_owned_read_only_artifact",
  },
  {
    schemaVersion: "meliora.tool.v1", name: "git_status", version: TOOL_VERSION,
    description: "Read the selected workspace Git porcelain status.",
    inputSchema: schema({}), schemaDialect: "https://json-schema.org/draft/2020-12/schema", risk: "L0", timeoutMs: 10_000, outputLimit: DEFAULT_GIT_BYTES,
    capabilities: ["workspace.git.status"], cancellation: "none", projector: "server_owned_read_only_artifact",
  },
  {
    schemaVersion: "meliora.tool.v1", name: "git_diff", version: TOOL_VERSION,
    description: "Read a bounded Git diff for workspace-relative paths.",
    inputSchema: schema({ paths: { type: "array", maxItems: 128, items: pathSchema }, staged: { type: "boolean" }, byteLimit: integerSchema(0, DEFAULT_GIT_BYTES) }),
    schemaDialect: "https://json-schema.org/draft/2020-12/schema", risk: "L0", timeoutMs: 10_000, outputLimit: DEFAULT_GIT_BYTES,
    capabilities: ["workspace.git.diff"], cancellation: "none", projector: "server_owned_read_only_artifact",
  },
] as const;

const definitionsByName = new Map<ReadOnlyToolName, ToolDefinition>(
  READ_ONLY_WORKSPACE_TOOL_DEFINITIONS.map((definition) => [definition.name as ReadOnlyToolName, definition]),
);

const isPlainObject = (value: JsonValue | undefined): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasOnlyKeys = (value: JsonObject, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key));

const boundedInteger = (value: JsonValue | undefined, fallback: number, maximum: number): number | null => {
  if (value === undefined) return fallback;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : null;
};

const normalizePath = (value: JsonValue | undefined, required: boolean): string | null => {
  if (value === undefined) return required ? null : ".";
  if (typeof value !== "string") return null;
  const normalized = value.trim().replaceAll("\\", "/");
  if (normalized.length === 0 || normalized.length > MAX_PATH_LENGTH || normalized.includes("\0")) return null;
  if (normalized.startsWith("/") || /^[A-Za-z]:/u.test(normalized) || normalized.split("/").some((part) => part === "..")) return null;
  return normalized === "." ? "." : normalized.replace(/^(?:\.\/)+/u, "") || ".";
};

const normalizePaths = (value: JsonValue | undefined): readonly string[] | null => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 128) return null;
  const paths: string[] = [];
  for (const item of value) {
    const path = normalizePath(item, true);
    if (path === null) return null;
    if (!paths.includes(path)) paths.push(path);
  }
  return paths;
};

/** Strict allow-list validator and normalizer used before every Host Port call. */
export const normalizeReadOnlyWorkspaceToolArguments = (
  toolName: string,
  argumentsValue: JsonObject,
): NormalizationResult => {
  if (!isPlainObject(argumentsValue)) return { ok: false };
  switch (toolName) {
    case "list_files": {
      if (!hasOnlyKeys(argumentsValue, ["path", "depth", "limit"])) return { ok: false };
      const path = normalizePath(argumentsValue.path, false);
      const depth = boundedInteger(argumentsValue.depth, DEFAULT_LIST_DEPTH, 32);
      const limit = boundedInteger(argumentsValue.limit, DEFAULT_LIST_LIMIT, 10_000);
      return path === null || depth === null || limit === null ? { ok: false } : { ok: true, normalized: { toolName, value: { path, depth, limit } } };
    }
    case "read_file": {
      if (!hasOnlyKeys(argumentsValue, ["path", "byteLimit"])) return { ok: false };
      const path = normalizePath(argumentsValue.path, true);
      const byteLimit = boundedInteger(argumentsValue.byteLimit, DEFAULT_READ_BYTES, DEFAULT_READ_BYTES);
      return path === null || byteLimit === null ? { ok: false } : { ok: true, normalized: { toolName, value: { path, byteLimit } } };
    }
    case "search_text": {
      if (!hasOnlyKeys(argumentsValue, ["query", "paths", "resultLimit", "byteLimit"])) return { ok: false };
      const query = argumentsValue.query;
      const paths = normalizePaths(argumentsValue.paths);
      const resultLimit = boundedInteger(argumentsValue.resultLimit, DEFAULT_SEARCH_RESULTS, 1_000);
      const byteLimit = boundedInteger(argumentsValue.byteLimit, DEFAULT_SEARCH_BYTES, DEFAULT_SEARCH_BYTES);
      return typeof query !== "string" || query.length === 0 || query.length > MAX_QUERY_LENGTH || query.includes("\0") || paths === null || resultLimit === null || byteLimit === null
        ? { ok: false }
        : { ok: true, normalized: { toolName, value: { query, paths, resultLimit, byteLimit } } };
    }
    case "git_status":
      return hasOnlyKeys(argumentsValue, []) ? { ok: true, normalized: { toolName, value: {} } } : { ok: false };
    case "git_diff": {
      if (!hasOnlyKeys(argumentsValue, ["paths", "staged", "byteLimit"])) return { ok: false };
      const paths = normalizePaths(argumentsValue.paths);
      const staged = argumentsValue.staged === undefined ? false : argumentsValue.staged;
      const byteLimit = boundedInteger(argumentsValue.byteLimit, DEFAULT_GIT_BYTES, DEFAULT_GIT_BYTES);
      return paths === null || typeof staged !== "boolean" || byteLimit === null
        ? { ok: false }
        : { ok: true, normalized: { toolName, value: { paths, staged, byteLimit } } };
    }
    default:
      return { ok: false };
  }
};

const capText = (text: string, byteLimit: number): Readonly<{ text: string; truncated: boolean }> => {
  const source = Buffer.from(text, "utf8");
  if (source.byteLength <= byteLimit) return { text, truncated: false };
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let end = byteLimit; end >= Math.max(0, byteLimit - 3); end -= 1) {
    try {
      return { text: decoder.decode(source.subarray(0, end)), truncated: true };
    } catch {
      // A UTF-8 scalar is at most four bytes; try the preceding boundary.
    }
  }
  return { text: "", truncated: true };
};

const textOutput = (value: TruncatedText, summary: string, byteLimit: number, metadata: JsonObject): ToolOutput => {
  const capped = capText(value.content, byteLimit);
  return { text: capped.text, summary, truncated: value.truncated || capped.truncated, metadata: { ...metadata, encoding: value.encoding, bytesRead: value.bytesRead, truncated: value.truncated || capped.truncated } };
};

const serializeList = (entries: readonly Readonly<{ path: string; kind: string; size?: number }>[], byteLimit: number): ToolOutput => {
  const rendered = entries.map((entry) => `${entry.kind}\t${entry.path}${entry.size === undefined ? "" : `\t${entry.size}`}`).join("\n");
  const capped = capText(rendered, byteLimit);
  return { text: capped.text, summary: `已列出 ${entries.length} 个工作区条目。`, truncated: capped.truncated, metadata: { entryCount: entries.length, truncated: capped.truncated } };
};

const serializeSearch = (matches: readonly Readonly<{ path: string; line: number; preview: string }>[], byteLimit: number): ToolOutput => {
  const rendered = matches.map((match) => `${match.path}:${match.line}: ${match.preview}`).join("\n");
  const capped = capText(rendered, byteLimit);
  return { text: capped.text, summary: `已找到 ${matches.length} 条文本匹配。`, truncated: capped.truncated, metadata: { matchCount: matches.length, truncated: capped.truncated } };
};

const failureSummary = (code: string): string => {
  switch (code) {
    case "cancelled": return "只读工具执行已取消。";
    case "invalid_path":
    case "outside_workspace": return "只读工具路径不在允许的工作区范围内。";
    case "not_found": return "请求的工作区资源不存在。";
    case "permission_denied": return "工作区资源不可读取。";
    case "timeout": return "只读工具执行超时。";
    case "output_limit_exceeded": return "只读工具请求超过安全输出上限。";
    default: return "只读工具未能完成。";
  }
};

const hostOutput = <T>(result: HostResult<T>): Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; execution: ReadOnlyWorkspaceToolExecution }> =>
  result.ok ? result : {
    ok: false,
    execution: { status: result.code === "cancelled" ? "cancelled" : "failed", effectSummary: failureSummary(result.code) },
  };

export type ReadOnlyWorkspaceToolsDependencies = Readonly<{
  host: WorkspaceHostPort;
  /** Selected by server-side Run composition; never accepted from model arguments. */
  workspaceId: string;
  artifacts: PrivateToolArtifactWriter;
  nextVerificationId?(): string;
}>;

/** Registry and executor adapter for the five M0 L0 Workspace Host tools. */
export class ReadOnlyWorkspaceTools implements ReadOnlyWorkspaceToolPort {
  readonly definitions = READ_ONLY_WORKSPACE_TOOL_DEFINITIONS;
  readonly #nextVerificationId: () => string;

  constructor(private readonly dependencies: ReadOnlyWorkspaceToolsDependencies) {
    let sequence = 0;
    this.#nextVerificationId = dependencies.nextVerificationId ?? (() => `verification:read-only:${++sequence}`);
  }

  async execute(invocation: NormalizedToolInvocation, signal: AbortSignal): Promise<ReadOnlyWorkspaceToolExecution> {
    if (signal.aborted) return { status: "cancelled", effectSummary: "只读工具执行已取消。" };
    const definition = definitionsByName.get(invocation.toolName as ReadOnlyToolName);
    const normalized = normalizeReadOnlyWorkspaceToolArguments(invocation.toolName, invocation.arguments);
    if (!definition || invocation.toolVersion !== definition.version || !normalized.ok) {
      return { status: "failed", effectSummary: "只读工具参数无效。" };
    }

    let output: ToolOutput | undefined;
    switch (normalized.normalized.toolName) {
      case "list_files": {
        const result = hostOutput(await this.dependencies.host.files.list({ workspaceId: this.dependencies.workspaceId, ...normalized.normalized.value }));
        if (!result.ok) return result.execution;
        output = serializeList(result.value, definition.outputLimit);
        break;
      }
      case "read_file": {
        const result = hostOutput(await this.dependencies.host.files.read({ workspaceId: this.dependencies.workspaceId, ...normalized.normalized.value }));
        if (!result.ok) return result.execution;
        output = textOutput(result.value, "已读取受限工作区文件。", definition.outputLimit, {});
        break;
      }
      case "search_text": {
        const result = hostOutput(await this.dependencies.host.files.search({ workspaceId: this.dependencies.workspaceId, ...normalized.normalized.value }));
        if (!result.ok) return result.execution;
        output = serializeSearch(result.value, definition.outputLimit);
        break;
      }
      case "git_status": {
        const result = hostOutput(await this.dependencies.host.git.status({ workspaceId: this.dependencies.workspaceId }));
        if (!result.ok) return result.execution;
        output = textOutput(result.value, "已读取工作区 Git 状态。", definition.outputLimit, {});
        break;
      }
      case "git_diff": {
        const result = hostOutput(await this.dependencies.host.git.diff({ workspaceId: this.dependencies.workspaceId, ...normalized.normalized.value }));
        if (!result.ok) return result.execution;
        output = textOutput(result.value, "已读取受限工作区 Git 差异。", definition.outputLimit, {});
        break;
      }
    }
    if (!output) return { status: "failed", effectSummary: "只读工具未能完成。" };
    if (signal.aborted) return { status: "cancelled", effectSummary: "只读工具执行已取消。" };
    try {
      const content = new TextEncoder().encode(output.text);
      const artifact = await this.dependencies.artifacts.writePrivate({
        mediaType: "text/plain",
        content,
        contentHash: createHash("sha256").update(content).digest("hex"),
        metadata: { toolName: invocation.toolName, toolVersion: invocation.toolVersion, ...output.metadata },
      });
      if (signal.aborted) return { status: "cancelled", effectSummary: "只读工具执行已取消。" };
      return {
        status: "succeeded",
        effectSummary: output.truncated ? `${output.summary} 输出已截断并保存在私有证据中。` : `${output.summary} 结果保存在私有证据中。`,
        outputArtifactId: artifact.artifactId,
        verification: {
          verificationId: this.#nextVerificationId(), status: "passed", evidenceArtifactIds: [artifact.artifactId],
        },
      };
    } catch {
      return { status: "failed", effectSummary: "只读工具结果无法写入受控证据。" };
    }
  }
}

/** Concise composition helper for server-side wiring. */
export const createReadOnlyWorkspaceTools = (dependencies: ReadOnlyWorkspaceToolsDependencies): ReadOnlyWorkspaceTools =>
  new ReadOnlyWorkspaceTools(dependencies);
