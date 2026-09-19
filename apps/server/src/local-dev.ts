import { mkdir, realpath, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { isAbsolute, dirname, relative, resolve } from "node:path";
import { promisify } from "node:util";

import { createDeepSeekChatTransport, createKimiChatTransport } from "../../../packages/providers/index.js";
import {
  createFrozenReadOnlyWorkspaceCatalog,
  createProviderBackedReadOnlyRunModel,
} from "./turn-command-composition.js";
import { createLocalMelioraServer } from "./persistence.js";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing ${name}.`);
  return value;
};

async function main(): Promise<void> {
  const workspaceId = required("MELIORA_WORKSPACE_ID");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(workspaceId)) throw new Error("Invalid workspace ID.");
  const workspaceRoot = await realpath(required("MELIORA_WORKSPACE_ROOT"));
  if (!(await stat(workspaceRoot)).isDirectory()) throw new Error("Workspace root must be a directory.");
  const { stdout: gitRoot } = await promisify(execFile)("git", ["-C", workspaceRoot, "rev-parse", "--show-toplevel"], {
    env: Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith("GIT_"))),
    windowsHide: true,
  });
  const expectedGitRoot = resolve(workspaceRoot);
  const actualGitRoot = resolve(gitRoot.trim());
  if ((process.platform === "win32" ? actualGitRoot.toLowerCase() : actualGitRoot)
    !== (process.platform === "win32" ? expectedGitRoot.toLowerCase() : expectedGitRoot)) {
    throw new Error("Workspace root must be the Git root.");
  }
  const databasePath = required("MELIORA_DATABASE_PATH");
  if (!isAbsolute(databasePath)) throw new Error("Database path must be absolute.");
  const relativeDatabasePath = relative(workspaceRoot, resolve(databasePath));
  if (relativeDatabasePath === "" || (!relativeDatabasePath.startsWith("..") && !isAbsolute(relativeDatabasePath))) {
    throw new Error("Database must be outside the workspace.");
  }
  const provider = required("MELIORA_PROVIDER");
  if (provider !== "deepseek" && provider !== "kimi") throw new Error("Provider must be deepseek or kimi.");
  const modelName = required("MELIORA_MODEL");
  const apiKey = required("MELIORA_API_KEY");
  const endpoint = provider === "deepseek"
    ? "https://api.deepseek.com/chat/completions"
    : "https://api.moonshot.cn/v1/chat/completions";
  const transport = provider === "deepseek"
    ? createDeepSeekChatTransport({ endpoint, model: modelName, apiKey })
    : createKimiChatTransport({ endpoint, model: modelName, apiKey });
  const model = createProviderBackedReadOnlyRunModel({
    provider, transport, catalog: createFrozenReadOnlyWorkspaceCatalog(),
    now: () => new Date().toISOString(),
  });
  await mkdir(dirname(databasePath), { recursive: true });
  const { server, store } = createLocalMelioraServer(databasePath, {
    allowedHosts: ["127.0.0.1:8787", "localhost:8787"],
    turnCommands: { workspaceRoots: new Map([[workspaceId, workspaceRoot]]), model },
  });
  server.once("error", () => {
    process.stderr.write("Local API could not bind to loopback port 8787.\n");
    store.close();
    process.exitCode = 1;
  });
  server.listen(8787, "127.0.0.1", () => {
    process.stdout.write(`Meliora local API listening at http://127.0.0.1:8787 (workspace ID: ${workspaceId}).\n`);
  });
  const shutdown = () => {
    server.close(() => { store.close(); process.exitCode = 0; });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch(() => {
  // Never echo environment values, provider errors, or database paths.
  process.stderr.write("Local API configuration or startup failed; check the required environment variables and paths.\n");
  process.exitCode = 1;
});
