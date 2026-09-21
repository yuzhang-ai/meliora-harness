import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { Readable } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const repositoryRoot = join(import.meta.dirname, "..", "..", "..");
const fixtureEntry = join(repositoryRoot, "apps", "server", "src", "demo-fixture-server.ts");
type FixtureProcess = ChildProcessByStdio<null, Readable, Readable>;
type RunningFixture = Readonly<{ child: FixtureProcess; requests: string[] }>;

const waitForFixture = (child: FixtureProcess): Promise<void> => new Promise((resolve, reject) => {
  let output = "";
  const timeout = setTimeout(() => reject(new Error(`fixture_start_timeout:${output}`)), 10_000);
  const receive = (chunk: Buffer) => {
    output += chunk.toString("utf8");
    if (output.includes("Meliora fixture API listening on loopback port 8787")) {
      clearTimeout(timeout);
      child.stdout.off("data", receive);
      resolve();
    }
  };
  child.stdout.on("data", receive);
  child.once("error", (error) => { clearTimeout(timeout); reject(error); });
  child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
  child.once("exit", (code) => {
    clearTimeout(timeout);
    reject(new Error(`fixture_exited_early:${code}:${output}`));
  });
});

const stopFixture = async (child: FixtureProcess): Promise<void> => {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await once(child, "exit");
};

const startFixture = async (workspaceRoot: string, databasePath: string): Promise<RunningFixture> => {
  const environment = { ...process.env };
  delete environment.MELIORA_API_KEY;
  delete environment.OPENAI_API_KEY;
  delete environment.ANTHROPIC_API_KEY;
  const child = spawn(process.execPath, ["--import", "tsx", fixtureEntry], {
    cwd: repositoryRoot,
    env: {
      ...environment,
      MELIORA_WORKSPACE_ID: "teacher-demo",
      MELIORA_WORKSPACE_ROOT: workspaceRoot,
      MELIORA_DATABASE_PATH: databasePath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const requests: string[] = [];
  let auditOutput = "";
  child.stdout.on("data", (chunk: Buffer) => {
    auditOutput += chunk.toString("utf8");
    const lines = auditOutput.split("\n");
    auditOutput = lines.pop() ?? "";
    for (const line of lines) {
      const match = /^Fixture audit: (GET|POST) (health|turns|events|resume|other)\.$/u.exec(line.trim());
      if (match) requests.push(`${match[1]} ${match[2]}`);
    }
  });
  await waitForFixture(child);
  return { child, requests };
};

const submitAndReadTerminal = async (idempotencyKey: string): Promise<string> => {
  const createdResponse = await fetch("http://127.0.0.1:8787/api/turns", {
    method: "POST",
    headers: { "content-type": "application/json", "host": "127.0.0.1:8787" },
    body: JSON.stringify({
      schemaVersion: "meliora.turn-command-request.v1",
      workspaceId: "teacher-demo",
      idempotencyKey,
      message: "请执行固定只读演示。",
    }),
  });
  assert.equal(createdResponse.status, 202);
  const created = await createdResponse.json() as { runId: string };
  const eventsResponse = await fetch(`http://127.0.0.1:8787/api/runs/${encodeURIComponent(created.runId)}/events`, {
    headers: { host: "127.0.0.1:8787" },
  });
  assert.equal(eventsResponse.status, 200);
  const events = await eventsResponse.text();
  assert.match(events, /"kind":"run_completed"/u);
  assert.match(events, /只读工具 git_status 已成功执行/u);
  assert.doesNotMatch(events, /固定演示流程已完成只读 Git 状态检查/u,
    "model-visible fixture text must remain behind the public projection");
  return created.runId;
};

test("deployment templates preserve loopback, whole-site auth, SSE, and no-upstream-retry policy", async () => {
  const [unit, nginx, environment, deploySource, fixtureSource] = await Promise.all([
    readFile(join(repositoryRoot, "deploy", "systemd", "meliora.service"), "utf8"),
    readFile(join(repositoryRoot, "deploy", "nginx", "meliora.conf"), "utf8"),
    readFile(join(repositoryRoot, "deploy", "env", "meliora.env.example"), "utf8"),
    readFile(join(repositoryRoot, "apps", "server", "src", "deploy-server.ts"), "utf8"),
    readFile(join(repositoryRoot, "apps", "server", "src", "demo-fixture-server.ts"), "utf8"),
  ]);
  assert.match(unit, /^User=meliora$/m);
  assert.match(unit, /^EnvironmentFile=\/etc\/meliora\/server\.env$/m);
  assert.match(unit, /^NoNewPrivileges=yes$/m);
  assert.match(unit, /^ProtectSystem=strict$/m);
  assert.match(unit, /^ReadWritePaths=\/var\/lib\/meliora \/var\/log\/meliora$/m);
  assert.match(nginx, /^\s*auth_basic /m);
  assert.match(nginx, /^\s*auth_basic_user_file \/etc\/nginx\/\.htpasswd-meliora;/m);
  assert.match(nginx, /^\s*ssl_certificate \/etc\/letsencrypt\/live\/melioracode\.com\/fullchain\.pem;/m);
  assert.match(nginx, /^\s*ssl_certificate_key \/etc\/letsencrypt\/live\/melioracode\.com\/privkey\.pem;/m);
  assert.match(nginx, /^\s*proxy_pass http:\/\/127\.0\.0\.1:8787;/m);
  assert.match(nginx, /^\s*proxy_set_header Host 127\.0\.0\.1:8787;/m);
  assert.match(nginx, /^\s*proxy_set_header X-Forwarded-Host \$host;/m);
  assert.match(nginx, /^\s*proxy_buffering off;/m);
  assert.match(nginx, /^\s*proxy_intercept_errors off;/m);
  assert.match(nginx, /^\s*proxy_next_upstream off;/m);
  assert.doesNotMatch(nginx, /proxy_pass http:\/\/0\.0\.0\.0/u);
  assert.match(environment, /MELIORA_API_KEY=REPLACE_AT_SERVER_ONLY/u);
  assert.doesNotMatch(environment, /sk-[A-Za-z0-9]/u);
  assert.match(deploySource, /required\("MELIORA_API_KEY"\)/u, "production entry must fail closed without a key");
  assert.match(fixtureSource, /no paid request can be made/u);
  assert.doesNotMatch(fixtureSource, /createDeepSeekChatTransport|createKimiChatTransport/u);
});

test("no-key fixture supports independent runs and restart resumes by observed GET only", async () => {
  const parent = await mkdtemp(join(tmpdir(), "meliora-deploy-fixture-"));
  const workspaceRoot = join(parent, "workspace");
  const databasePath = join(parent, "state", "meliora.sqlite");
  let first: RunningFixture | undefined;
  let second: RunningFixture | undefined;
  try {
    await exec("git", ["init", workspaceRoot]);
    await exec("git", ["-C", workspaceRoot, "config", "user.email", "fixture@example.invalid"]);
    await exec("git", ["-C", workspaceRoot, "config", "user.name", "Meliora Fixture"]);
    await writeFile(join(workspaceRoot, "README.md"), "# Fixed read-only teacher fixture\n", "utf8");
    await exec("git", ["-C", workspaceRoot, "add", "README.md"]);
    await exec("git", ["-C", workspaceRoot, "commit", "-m", "fixture"]);

    first = await startFixture(workspaceRoot, databasePath);
    const firstRunId = await submitAndReadTerminal("fixture-loopback-run-1");
    await submitAndReadTerminal("fixture-loopback-run-2");
    assert.deepEqual(first.requests, ["POST turns", "GET events", "POST turns", "GET events"]);
    await stopFixture(first.child);
    first = undefined;

    second = await startFixture(workspaceRoot, databasePath);
    const resume = await fetch(`http://127.0.0.1:8787/api/runs/${encodeURIComponent(firstRunId)}/resume`, {
      headers: { host: "127.0.0.1:8787" },
    });
    assert.equal(resume.status, 200);
    assert.match(await resume.text(), /"kind":"run_completed"/u);
    assert.deepEqual(second.requests, ["GET resume"], "restart recovery must be observed as GET-only by the Server");
  } finally {
    if (first) await stopFixture(first.child);
    if (second) await stopFixture(second.child);
    await rm(parent, { recursive: true, force: true, maxRetries: 3 });
  }
});
