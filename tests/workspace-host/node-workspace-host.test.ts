import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { NodeWorkspaceHost } from "../../packages/workspace-host/node-workspace-host";

const execFileAsync = promisify(execFile);
const temporaryParent = await mkdtemp(join(tmpdir(), "meliora-workspace-host-"));
const workspace = join(temporaryParent, "工作区 Space");
const outside = join(temporaryParent, "outside");
await mkdir(workspace);
await mkdir(outside);

try {
  await mkdir(join(workspace, "nested"));
  await writeFile(join(workspace, "README.md"), "hello\nneedle one\n", "utf8");
  await writeFile(join(workspace, "nested", "中文.txt"), "needle two\n", "utf8");
  await writeFile(join(workspace, "large.txt"), "abcdef", "utf8");
  await writeFile(join(workspace, "binary.bin"), Buffer.from([0xff, 0x00, 0x81]));
  await writeFile(join(workspace, "Case.TXT"), "case-insensitive on Windows", "utf8");
  await writeFile(join(workspace, "utf16.txt"), Buffer.from([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]));
  await writeFile(join(outside, "secret.txt"), "outside", "utf8");
  await symlink(outside, join(workspace, "outside-link"), process.platform === "win32" ? "junction" : "dir");

  const host = new NodeWorkspaceHost({ main: workspace });
  const listed = await host.files.list({ workspaceId: "main", path: ".", depth: 1, limit: 20 });
  assert.equal(listed.ok, true);
  if (!listed.ok) throw new Error(listed.message);
  assert.ok(listed.value.some((entry) => entry.path === "nested/中文.txt" && entry.kind === "file"));
  assert.ok(listed.value.some((entry) => entry.path === "outside-link" && entry.kind === "symlink"));

  const cappedRead = await host.files.read({ workspaceId: "main", path: "large.txt", byteLimit: 3 });
  assert.deepEqual(cappedRead, { ok: true, value: { content: "abc", encoding: "utf-8", bytesRead: 3, truncated: true } });
  const oversizedRead = await host.files.read({ workspaceId: "main", path: "large.txt", byteLimit: 4 * 1024 * 1024 + 1 });
  assert.deepEqual(oversizedRead.ok, false);
  if (!oversizedRead.ok) assert.equal(oversizedRead.code, "output_limit_exceeded");
  const oversizedList = await host.files.list({ workspaceId: "main", path: ".", depth: 33, limit: 1 });
  assert.deepEqual(oversizedList.ok, false);
  if (!oversizedList.ok) assert.equal(oversizedList.code, "output_limit_exceeded");
  const binaryRead = await host.files.read({ workspaceId: "main", path: "binary.bin", byteLimit: 10 });
  assert.equal(binaryRead.ok, true);
  if (!binaryRead.ok) throw new Error(binaryRead.message);
  assert.equal(binaryRead.value.encoding, "binary");
  assert.equal(binaryRead.value.content, "");
  const utf16Read = await host.files.read({ workspaceId: "main", path: "utf16.txt", byteLimit: 10 });
  assert.equal(utf16Read.ok, true);
  if (!utf16Read.ok) throw new Error(utf16Read.message);
  assert.equal(utf16Read.value.content, "hi");
  assert.equal(utf16Read.value.encoding, "utf-16le");
  assert.match(utf16Read.value.contentHash ?? "", /^[a-f0-9]{64}$/u);
  if (process.platform === "win32") {
    const caseInsensitiveRead = await host.files.read({ workspaceId: "main", path: "case.txt", byteLimit: 64 });
    assert.equal(caseInsensitiveRead.ok, true);
  }

  for (const unsafePath of ["../outside/secret.txt", "C:\\outside\\secret.txt", "outside-link/secret.txt"]) {
    const result = await host.files.read({ workspaceId: "main", path: unsafePath, byteLimit: 64 });
    assert.equal(result.ok, false, unsafePath);
    if (!result.ok) assert.ok(["invalid_path", "outside_workspace"].includes(result.code), unsafePath);
  }

  const matches = await host.files.search({ workspaceId: "main", query: "needle", paths: ["."], resultLimit: 1, byteLimit: 256 });
  assert.deepEqual(matches, { ok: true, value: [{ path: "README.md", line: 2, preview: "needle one" }] });
  const byteBounded = await host.files.search({ workspaceId: "main", query: "needle", paths: ["."], resultLimit: 10, byteLimit: 1 });
  assert.deepEqual(byteBounded, { ok: true, value: [] });
  const oversizedSearch = await host.files.search({ workspaceId: "main", query: "needle", paths: ["."], resultLimit: 1_001, byteLimit: 100 });
  assert.deepEqual(oversizedSearch.ok, false);
  if (!oversizedSearch.ok) assert.equal(oversizedSearch.code, "output_limit_exceeded");

  await execFileAsync("git", ["init", "--quiet"], { cwd: workspace });
  await execFileAsync("git", ["config", "user.email", "workspace-host@example.test"], { cwd: workspace });
  await execFileAsync("git", ["config", "user.name", "Workspace Host"], { cwd: workspace });
  await execFileAsync("git", ["add", "README.md"], { cwd: workspace });
  await execFileAsync("git", ["commit", "--quiet", "-m", "initial"], { cwd: workspace });
  await execFileAsync("git", ["init", "--quiet"], { cwd: outside });
  await execFileAsync("git", ["config", "user.email", "workspace-host@example.test"], { cwd: outside });
  await execFileAsync("git", ["config", "user.name", "Workspace Host"], { cwd: outside });
  await writeFile(join(outside, "outside-status.txt"), "outside baseline\n", "utf8");
  await execFileAsync("git", ["add", "outside-status.txt"], { cwd: outside });
  await execFileAsync("git", ["commit", "--quiet", "-m", "outside initial"], { cwd: outside });
  await writeFile(join(outside, "outside-status.txt"), "outside modified\n", "utf8");
  await writeFile(join(workspace, "README.md"), "hello changed\nneedle one\n", "utf8");
  const inheritedGitDir = process.env.GIT_DIR;
  const inheritedGitWorkTree = process.env.GIT_WORK_TREE;
  try {
    process.env.GIT_DIR = join(outside, ".git");
    process.env.GIT_WORK_TREE = outside;
    const status = await host.git.status({ workspaceId: "main" });
    assert.equal(status.ok, true);
    if (!status.ok) throw new Error(status.message);
    assert.match(status.value.content, /README\.md/u);
    assert.doesNotMatch(status.value.content, /outside-status\.txt/u);
    const diff = await host.git.diff({ workspaceId: "main", paths: ["README.md"], staged: false, byteLimit: 20 });
    assert.equal(diff.ok, true);
    if (!diff.ok) throw new Error(diff.message);
    assert.equal(diff.value.truncated, true);
    assert.doesNotMatch(diff.value.content, /outside modified/u);
  } finally {
    if (inheritedGitDir === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = inheritedGitDir;
    if (inheritedGitWorkTree === undefined) delete process.env.GIT_WORK_TREE;
    else process.env.GIT_WORK_TREE = inheritedGitWorkTree;
  }
  const unsafeDiff = await host.git.diff({ workspaceId: "main", paths: ["../outside/secret.txt"], staged: false, byteLimit: 100 });
  assert.deepEqual(unsafeDiff.ok, false);
  const oversizedDiff = await host.git.diff({ workspaceId: "main", paths: ["README.md"], staged: false, byteLimit: 4 * 1024 * 1024 + 1 });
  assert.deepEqual(oversizedDiff.ok, false);
  if (!oversizedDiff.ok) assert.equal(oversizedDiff.code, "output_limit_exceeded");
  const escapedDiff = await host.git.diff({ workspaceId: "main", paths: ["outside-link/secret.txt"], staged: false, byteLimit: 100 });
  assert.deepEqual(escapedDiff.ok, false);

  const cancelledShell = await host.shell.run({
    workspaceId: "main", command: "echo never", cwd: ".", timeoutMs: 1, outputLimit: 1,
    environmentAllowlist: [], cancellation: "process-tree", signal: AbortSignal.abort(),
  });
  assert.equal(cancelledShell.ok, false);
  if (!cancelledShell.ok) assert.equal(cancelledShell.code, "cancelled");

  console.log("Workspace host tests passed: paths, Unicode, symlink/junction, caps, search, and read-only Git.");
} finally {
  await rm(temporaryParent, { recursive: true, force: true, maxRetries: 3 });
}
