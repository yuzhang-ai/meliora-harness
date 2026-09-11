import { SqliteSessionStore } from "../../../packages/session-store/index.js";
import { createMelioraServer, type MelioraServerOptions } from "./server.js";

export const createLocalSessionStore = (databasePath: string): SqliteSessionStore =>
  new SqliteSessionStore(databasePath);

export const createLocalMelioraServer = (
  databasePath: string,
  options: Omit<MelioraServerOptions, "store" | "resolveSessionId"> = {},
) => {
  const store = createLocalSessionStore(databasePath);
  const server = createMelioraServer({
    ...options,
    store,
    resolveSessionId: (runId) => store.readRunSessionId(runId),
  });
  return { server, store } as const;
};
