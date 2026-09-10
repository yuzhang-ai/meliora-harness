import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { open, readdir, realpath, lstat, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep, win32 } from "node:path";

import type {
  FileSystemPort,
  GitPort,
  HostFailure,
  HostResult,
  PatchPort,
  ShellPort,
  TruncatedText,
  WorkspaceHostPort,
} from "./contracts";

/** A workspace ID is resolved exclusively from this server-owned map. */
export type WorkspaceRoots = Readonly<Record<string, string>> | ReadonlyMap<string, string>;

type ListedEntry = Readonly<{
  path: string;
  kind: "file" | "directory" | "symlink";
  size?: number;
}>;

type SearchMatch = Readonly<{ path: string; line: number; preview: string }>;

const textDecoder = new TextDecoder("utf-8", { fatal: true });
const MAX_FILE_READ_BYTES = 4 * 1024 * 1024;
const MAX_GIT_DIFF_BYTES = 4 * 1024 * 1024;
const MAX_LIST_DEPTH = 32;
const MAX_LIST_ENTRIES = 10_000;
const MAX_SEARCH_RESULTS = 1_000;
const MAX_SEARCH_FILE_CANDIDATES = 20_000;
const MAX_SEARCH_DEPTH = 32;
const MAX_SEARCH_SCAN_BYTES = 32 * 1024 * 1024;
const GIT_ENV_ALLOWLIST = process.platform === "win32"
  ? ["PATH", "SystemRoot", "ComSpec", "PATHEXT", "TEMP", "TMP"]
  : ["PATH", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE"];

function failure(code: HostFailure["code"], message: string, retryable = false): HostFailure {
  return { ok: false, code, message, retryable };
}

function success<T>(value: T): HostResult<T> {
  return { ok: true, value };
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

function fromSystemError(error: unknown): HostFailure {
  if (error instanceof WorkspaceBoundaryError) return failure(error.hostCode, error.safeMessage);
  if (isAbortError(error)) return failure("cancelled", "Operation was cancelled.", true);
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  if (code === "ENOENT" || code === "ENOTDIR") return failure("not_found", "The requested path was not found.");
  if (code === "EACCES" || code === "EPERM") return failure("permission_denied", "Permission was denied for the requested path.");
  if (code === "ETIMEDOUT") return failure("timeout", "The operation timed out.", true);
  return failure("internal_error", "The workspace host could not complete the operation.", true);
}

class WorkspaceBoundaryError extends Error {
  constructor(
    readonly hostCode: "outside_workspace" | "conflict",
    readonly safeMessage: string,
  ) {
    super(safeMessage);
    this.name = "WorkspaceBoundaryError";
  }
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function gitEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_PAGER: "cat",
    GIT_TERMINAL_PROMPT: "0",
  };
  for (const key of GIT_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

function pathComparisonValue(value: string): string {
  return process.platform === "win32" ? value.toLocaleLowerCase("en-US") : value;
}

function isWithin(root: string, candidate: string): boolean {
  const normalizedRoot = pathComparisonValue(root);
  const normalizedCandidate = pathComparisonValue(candidate);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
}

function relativePath(root: string, target: string): string {
  const value = relative(root, target).split(sep).join("/");
  return value.length === 0 ? "." : value;
}

function assertRelativeRequestPath(requestPath: string): HostFailure | undefined {
  if (requestPath.includes("\0")) return failure("invalid_path", "Paths must not contain a null byte.");
  // win32 catches drive letters and UNC paths even when this host is tested on a non-Windows machine.
  if (isAbsolute(requestPath) || win32.isAbsolute(requestPath) || /^[A-Za-z]:/u.test(requestPath)) {
    return failure("invalid_path", "Paths must be relative to the selected workspace.");
  }
  return undefined;
}

function decodeText(bytes: Buffer): Pick<TruncatedText, "content" | "encoding"> {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { content: bytes.subarray(2).toString("utf16le"), encoding: "utf-16le" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { content: "", encoding: "unknown" };
  }
  // A BOM is preferred, but Windows-created UTF-16LE text often has none. The
  // alternating NUL pattern is deliberately conservative so arbitrary binary is
  // not presented as readable text.
  let evenNulls = 0;
  let oddNulls = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0) {
      if (index % 2 === 0) evenNulls += 1;
      else oddNulls += 1;
    }
  }
  if (bytes.length >= 4 && oddNulls > bytes.length / 4 && evenNulls <= bytes.length / 16) {
    return { content: bytes.toString("utf16le"), encoding: "utf-16le" };
  }
  try {
    const bomLength = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
    return { content: textDecoder.decode(bytes.subarray(bomLength)), encoding: "utf-8" };
  } catch {
    return { content: "", encoding: "binary" };
  }
}

async function readCappedFile(root: string, filePath: string, byteLimit: number): Promise<TruncatedText> {
  const handle = await open(filePath, "r");
  try {
    // The path can be replaced after the earlier realpath check. Validate the
    // opened handle against the path's current canonical target before reading;
    // after this point the handle remains bound even if the name is replaced.
    const openedInfo = await handle.stat({ bigint: true });
    const currentCanonicalPath = await realpath(filePath);
    if (!isWithin(root, currentCanonicalPath)) {
      throw new WorkspaceBoundaryError("outside_workspace", "The requested path resolves outside the selected workspace.");
    }
    const currentInfo = await stat(currentCanonicalPath, { bigint: true });
    if (openedInfo.dev !== currentInfo.dev || openedInfo.ino !== currentInfo.ino) {
      throw new WorkspaceBoundaryError("conflict", "The requested path changed while it was being opened.");
    }
    if (!openedInfo.isFile()) throw new WorkspaceBoundaryError("conflict", "The requested path is no longer a regular file.");
    const buffer = Buffer.allocUnsafe(byteLimit + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const truncated = bytesRead > byteLimit;
    const bytes = buffer.subarray(0, Math.min(bytesRead, byteLimit));
    const decoded = decodeText(bytes);
    return {
      ...decoded,
      bytesRead: bytes.length,
      truncated,
      ...(truncated ? {} : { contentHash: createHash("sha256").update(bytes).digest("hex") }),
    };
  } finally {
    await handle.close();
  }
}

function outputFromBytes(bytes: Buffer, byteLimit: number): TruncatedText {
  const truncated = bytes.length > byteLimit;
  const included = bytes.subarray(0, Math.min(bytes.length, byteLimit));
  const decoded = decodeText(included);
  return {
    ...decoded,
    bytesRead: included.length,
    truncated,
    ...(truncated ? {} : { contentHash: createHash("sha256").update(included).digest("hex") }),
  };
}

/**
 * Node adapter for the frozen WorkspaceHostPort. It intentionally implements only
 * read-only file and Git operations; shell and patch are explicit unsupported ports.
 */
export class NodeWorkspaceHost implements WorkspaceHostPort {
  readonly files: FileSystemPort;
  readonly git: GitPort;
  readonly shell: ShellPort;
  readonly patch: PatchPort;

  readonly #roots: ReadonlyMap<string, string>;

  constructor(workspaceRoots: WorkspaceRoots) {
    this.#roots = workspaceRoots instanceof Map ? new Map(workspaceRoots) : new Map(Object.entries(workspaceRoots));
    this.files = {
      list: async (input) => this.list(input),
      read: async (input) => this.read(input),
      search: async (input) => this.search(input),
    };
    this.git = {
      status: async (input) => this.gitStatus(input),
      diff: async (input) => this.gitDiff(input),
    };
    this.shell = {
      run: async (input) => input.signal?.aborted
        ? failure("cancelled", "Operation was cancelled.", true)
        : failure("unsupported", "Shell execution is not enabled by the read-only workspace host."),
    };
    this.patch = {
      preview: async () => failure("unsupported", "Patch preview is not enabled by the read-only workspace host."),
      apply: async () => failure("unsupported", "Patch application is not enabled by the read-only workspace host."),
      readback: async () => failure("unsupported", "Patch readback is not enabled by the read-only workspace host."),
    };
  }

  async #workspaceRoot(workspaceId: string): Promise<HostResult<string>> {
    const configuredRoot = this.#roots.get(workspaceId);
    if (!configuredRoot) return failure("not_found", "The selected workspace was not found.");
    try {
      const canonicalRoot = await realpath(resolve(configuredRoot));
      if (!(await stat(canonicalRoot)).isDirectory()) return failure("invalid_path", "The workspace root must be a directory.");
      return success(canonicalRoot);
    } catch (error) {
      return fromSystemError(error);
    }
  }

  async #resolveExisting(root: string, requestedPath: string): Promise<HostResult<string>> {
    const invalid = assertRelativeRequestPath(requestedPath);
    if (invalid) return invalid;
    const lexicalPath = resolve(root, requestedPath || ".");
    if (!isWithin(root, lexicalPath)) return failure("outside_workspace", "The requested path is outside the selected workspace.");
    try {
      const canonicalPath = await realpath(lexicalPath);
      if (!isWithin(root, canonicalPath)) return failure("outside_workspace", "The requested path resolves outside the selected workspace.");
      return success(canonicalPath);
    } catch (error) {
      return fromSystemError(error);
    }
  }

  async #resolveGitPath(root: string, requestedPath: string): Promise<HostResult<string>> {
    const invalid = assertRelativeRequestPath(requestedPath);
    if (invalid) return invalid;
    const lexicalPath = resolve(root, requestedPath || ".");
    if (!isWithin(root, lexicalPath)) return failure("outside_workspace", "The requested path is outside the selected workspace.");
    try {
      // Resolve the full path, not just a final symlink: `inside-link/file` is
      // otherwise a lexical in-workspace path whose parent can escape via a junction.
      const canonicalPath = await realpath(lexicalPath);
      if (!isWithin(root, canonicalPath)) return failure("outside_workspace", "The requested path resolves outside the selected workspace.");
    } catch (error) {
      const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
      if (code !== "ENOENT") return fromSystemError(error);
      // Git accepts a missing pathspec. Its lexical path was already constrained above.
    }
    return success(relativePath(root, lexicalPath));
  }

  async list(input: Parameters<FileSystemPort["list"]>[0]): ReturnType<FileSystemPort["list"]> {
    if (!isNonNegativeInteger(input.depth) || !isNonNegativeInteger(input.limit)) {
      return failure("invalid_path", "Depth and limit must be non-negative integers.");
    }
    if (input.depth > MAX_LIST_DEPTH || input.limit > MAX_LIST_ENTRIES) {
      return failure("output_limit_exceeded", "list_files exceeds the workspace host safety limit.");
    }
    const root = await this.#workspaceRoot(input.workspaceId);
    if (!root.ok) return root;
    const requested = await this.#resolveExisting(root.value, input.path);
    if (!requested.ok) return requested;
    try {
      if (!(await stat(requested.value)).isDirectory()) return failure("invalid_path", "list_files requires a directory path.");
      const entries: ListedEntry[] = [];
      await this.#listDirectory(root.value, requested.value, input.depth, input.limit, entries);
      return success(entries);
    } catch (error) {
      return fromSystemError(error);
    }
  }

  async #listDirectory(root: string, directory: string, depth: number, limit: number, entries: ListedEntry[]): Promise<void> {
    if (entries.length >= limit) return;
    const directoryHandle = await open(directory, "r");
    try {
      const openedInfo = await directoryHandle.stat({ bigint: true });
      if (!openedInfo.isDirectory()) throw new WorkspaceBoundaryError("conflict", "The listed path is no longer a directory.");
      const validateDirectoryIdentity = async (): Promise<void> => {
        const currentCanonical = await realpath(directory);
        if (!isWithin(root, currentCanonical)) {
          throw new WorkspaceBoundaryError("outside_workspace", "The listed directory resolves outside the selected workspace.");
        }
        const currentInfo = await stat(currentCanonical, { bigint: true });
        if (openedInfo.dev !== currentInfo.dev || openedInfo.ino !== currentInfo.ino) {
          throw new WorkspaceBoundaryError("conflict", "The listed directory changed during enumeration.");
        }
      };
      const children = await readdir(directory, { withFileTypes: true });
      await validateDirectoryIdentity();
      children.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
      for (const child of children) {
        if (entries.length >= limit) return;
        await validateDirectoryIdentity();
        const childPath = resolve(directory, child.name);
        const info = await lstat(childPath);
        await validateDirectoryIdentity();
        const kind: ListedEntry["kind"] = info.isSymbolicLink() ? "symlink" : info.isDirectory() ? "directory" : "file";
        // Size is intentionally omitted. Returning metadata read through a
        // mutable directory name would reopen a TOCTOU disclosure surface.
        entries.push({ path: relativePath(root, childPath), kind });
        if (kind === "directory" && depth > 0) {
          const canonicalChild = await realpath(childPath);
          if (!isWithin(root, canonicalChild)) {
            throw new WorkspaceBoundaryError("outside_workspace", "A listed directory resolves outside the selected workspace.");
          }
          await this.#listDirectory(root, canonicalChild, depth - 1, limit, entries);
        }
      }
    } finally {
      await directoryHandle.close();
    }
  }

  async read(input: Parameters<FileSystemPort["read"]>[0]): ReturnType<FileSystemPort["read"]> {
    if (!isNonNegativeInteger(input.byteLimit)) return failure("invalid_path", "byteLimit must be a non-negative integer.");
    if (input.byteLimit > MAX_FILE_READ_BYTES) {
      return failure("output_limit_exceeded", "read_file exceeds the workspace host safety limit.");
    }
    const root = await this.#workspaceRoot(input.workspaceId);
    if (!root.ok) return root;
    const requested = await this.#resolveExisting(root.value, input.path);
    if (!requested.ok) return requested;
    try {
      if (!(await stat(requested.value)).isFile()) return failure("invalid_path", "read_file requires a regular file.");
      return success(await readCappedFile(root.value, requested.value, input.byteLimit));
    } catch (error) {
      return fromSystemError(error);
    }
  }

  async search(input: Parameters<FileSystemPort["search"]>[0]): ReturnType<FileSystemPort["search"]> {
    if (input.query.length === 0) return failure("invalid_path", "search_text requires a non-empty query.");
    if (!isNonNegativeInteger(input.resultLimit) || !isNonNegativeInteger(input.byteLimit)) {
      return failure("invalid_path", "resultLimit and byteLimit must be non-negative integers.");
    }
    if (input.resultLimit > MAX_SEARCH_RESULTS || input.byteLimit > MAX_FILE_READ_BYTES) {
      return failure("output_limit_exceeded", "search_text exceeds the workspace host safety limit.");
    }
    const root = await this.#workspaceRoot(input.workspaceId);
    if (!root.ok) return root;
    try {
      const startPaths = input.paths.length === 0 ? ["."] : input.paths;
      const files = new Set<string>();
      for (const requestedPath of startPaths) {
        const requested = await this.#resolveExisting(root.value, requestedPath);
        if (!requested.ok) return requested;
        const info = await lstat(requested.value);
        if (info.isSymbolicLink()) continue;
        if (info.isDirectory() && !(await this.#findFiles(root.value, requested.value, files, 0))) {
          return failure("output_limit_exceeded", "search_text exceeded the workspace host candidate-file safety limit.");
        }
        else if (info.isFile()) files.add(requested.value);
      }
      const orderedFiles = [...files].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
      const matches: SearchMatch[] = [];
      let outputBytes = 0;
      let scannedBytes = 0;
      for (const filePath of orderedFiles) {
        if (matches.length >= input.resultLimit) break;
        const remainingScanBytes = MAX_SEARCH_SCAN_BYTES - scannedBytes;
        if (remainingScanBytes <= 0) break;
        const text = await readCappedFile(root.value, filePath, Math.min(input.byteLimit, remainingScanBytes));
        scannedBytes += text.bytesRead;
        if (text.encoding !== "utf-8" && text.encoding !== "utf-16le") continue;
        const lines = text.content.split(/\r?\n/u);
        for (let index = 0; index < lines.length && matches.length < input.resultLimit; index += 1) {
          if (!lines[index].includes(input.query)) continue;
          const match = { path: relativePath(root.value, filePath), line: index + 1, preview: lines[index].slice(0, 512) };
          const matchBytes = Buffer.byteLength(`${match.path}:${match.line}:${match.preview}`, "utf8");
          if (outputBytes + matchBytes > input.byteLimit) return success(matches);
          matches.push(match);
          outputBytes += matchBytes;
        }
      }
      return success(matches);
    } catch (error) {
      return fromSystemError(error);
    }
  }

  async #findFiles(root: string, directory: string, files: Set<string>, depth: number): Promise<boolean> {
    if (depth > MAX_SEARCH_DEPTH || files.size >= MAX_SEARCH_FILE_CANDIDATES) return false;
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    for (const child of children) {
      const childPath = resolve(directory, child.name);
      const info = await lstat(childPath);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) {
        const canonicalChild = await realpath(childPath);
        if (isWithin(root, canonicalChild) && !(await this.#findFiles(root, canonicalChild, files, depth + 1))) return false;
      } else if (info.isFile()) {
        files.add(childPath);
        if (files.size >= MAX_SEARCH_FILE_CANDIDATES) return false;
      }
    }
    return true;
  }

  async gitStatus(input: Parameters<GitPort["status"]>[0]): ReturnType<GitPort["status"]> {
    const root = await this.#workspaceRoot(input.workspaceId);
    if (!root.ok) return root;
    return this.#git(root.value, ["status", "--porcelain=v1", "--untracked-files=all"], 256 * 1024);
  }

  async gitDiff(input: Parameters<GitPort["diff"]>[0]): ReturnType<GitPort["diff"]> {
    if (!isNonNegativeInteger(input.byteLimit)) return failure("invalid_path", "byteLimit must be a non-negative integer.");
    if (input.byteLimit > MAX_GIT_DIFF_BYTES) {
      return failure("output_limit_exceeded", "git_diff exceeds the workspace host safety limit.");
    }
    const root = await this.#workspaceRoot(input.workspaceId);
    if (!root.ok) return root;
    const paths: string[] = [];
    for (const requestedPath of input.paths) {
      const resolvedPath = await this.#resolveGitPath(root.value, requestedPath);
      if (!resolvedPath.ok) return resolvedPath;
      paths.push(resolvedPath.value);
    }
    return this.#git(root.value, ["diff", "--no-ext-diff", "--no-textconv", "--no-color", ...(input.staged ? ["--cached"] : []), "--", ...paths], input.byteLimit);
  }

  #git(root: string, args: readonly string[], byteLimit: number): Promise<HostResult<TruncatedText>> {
    return new Promise((complete) => {
      // Do not inherit caller-provided GIT_* variables. In particular,
      // GIT_DIR/GIT_WORK_TREE could otherwise make `git -C root` read another
      // repository. `--work-tree` pins the selected tree while normal discovery
      // preserves support for linked worktrees whose `.git` is a pointer file.
      const child = spawn("git", [
        "--no-pager",
        "-C", root,
        `--work-tree=${root}`,
        "-c", "core.hooksPath=",
        "-c", "core.fsmonitor=false",
        ...args,
      ], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: gitEnvironment(),
      });
      const output: Buffer[] = [];
      const errors: Buffer[] = [];
      let outputLength = 0;
      let capturedLength = 0;
      let killedForLimit = false;
      child.stdout.on("data", (chunk: Buffer) => {
        const remaining = Math.max(0, byteLimit + 1 - capturedLength);
        if (remaining > 0) {
          const included = chunk.subarray(0, remaining);
          output.push(included);
          capturedLength += included.length;
        }
        outputLength += chunk.length;
        if (outputLength > byteLimit && !killedForLimit) {
          killedForLimit = true;
          child.kill();
        }
      });
      child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
      child.on("error", (error) => complete(fromSystemError(error)));
      child.on("close", (exitCode) => {
        if (killedForLimit) return complete(success(outputFromBytes(Buffer.concat(output), byteLimit)));
        if (exitCode === 0) return complete(success(outputFromBytes(Buffer.concat(output), byteLimit)));
        const errorText = Buffer.concat(errors).toString("utf8");
        if (/not a git repository/u.test(errorText)) return complete(failure("not_found", "The selected workspace is not a Git repository."));
        return complete(failure("internal_error", "Git could not complete the read-only operation.", true));
      });
    });
  }
}

export function createNodeWorkspaceHost(workspaceRoots: WorkspaceRoots): WorkspaceHostPort {
  return new NodeWorkspaceHost(workspaceRoots);
}

/** Alias kept concise for composition roots that only have one host implementation. */
export const createWorkspaceHost = createNodeWorkspaceHost;
