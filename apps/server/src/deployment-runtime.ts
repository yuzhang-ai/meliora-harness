import { execFile } from "node:child_process";
import { mkdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";

import type { ReadOnlyRunModelPort } from "../../../packages/agent-runtime/index.js";
import { createLocalMelioraServer } from "./persistence.js";
import { createFrozenReadOnlyWorkspaceCatalog } from "./turn-command-composition.js";
import { localServerGitEnvironment } from "./local-git-environment.js";

export type DeploymentFilesystemConfiguration = Readonly<{
  workspaceId: string;
  workspaceRoot: string;
  databasePath: string;
}>;

const required = (name: string): string => {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing ${name}.`);
  return value;
};

/**
 * Validates the filesystem part of a single-user deployment without ever
 * inspecting or printing provider settings. The database must remain outside
 * the selected Git workspace so a fixed demo checkout cannot persist runtime
 * state into itself.
 */
export const loadDeploymentFilesystemConfiguration = async (): Promise<DeploymentFilesystemConfiguration> => {
  const workspaceId = required("MELIORA_WORKSPACE_ID");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(workspaceId)) throw new Error("Invalid workspace ID.");
  const workspaceRoot = await realpath(required("MELIORA_WORKSPACE_ROOT"));
  if (!(await stat(workspaceRoot)).isDirectory()) throw new Error("Workspace root must be a directory.");
  const { stdout: gitRoot } = await promisify(execFile)("git", ["-C", workspaceRoot, "rev-parse", "--show-toplevel"], {
    env: localServerGitEnvironment(),
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
  await mkdir(dirname(databasePath), { recursive: true });
  return { workspaceId, workspaceRoot, databasePath };
};

export const startLoopbackDeploymentServer = (
  configuration: DeploymentFilesystemConfiguration,
  model: ReadOnlyRunModelPort,
  label: "provider" | "fixture",
): void => {
  const { server, store } = createLocalMelioraServer(configuration.databasePath, {
    allowedHosts: ["127.0.0.1:8787", "localhost:8787"],
    turnCommands: {
      workspaceRoots: new Map([[configuration.workspaceId, configuration.workspaceRoot]]),
      model,
    },
  });
  if (label === "fixture") {
    server.on("request", (request) => {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      const route = pathname === "/api/turns"
        ? "turns"
        : pathname.endsWith("/events")
          ? "events"
          : pathname.endsWith("/resume")
            ? "resume"
            : pathname === "/api/health"
              ? "health"
              : "other";
      process.stdout.write(`Fixture audit: ${request.method ?? "UNKNOWN"} ${route}.\n`);
    });
  }
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => { store.close(); process.exitCode = 0; });
  };
  server.once("error", () => {
    process.stderr.write("Meliora deployment API could not bind to loopback port 8787.\n");
    store.close();
    process.exitCode = 1;
  });
  server.listen(8787, "127.0.0.1", () => {
    const catalogHash = createFrozenReadOnlyWorkspaceCatalog().catalogHash.slice(0, 12);
    process.stdout.write(`Meliora ${label} API listening on loopback port 8787 (catalog ${catalogHash}).\n`);
  });
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
};
