import { SqliteSessionStore } from "../../../packages/session-store/index.js";
import { createMelioraServer, type MelioraServerOptions } from "./server.js";
import { createTurnCommandSubmitter, type TurnCommandSubmitterOptions } from "./turn-command-composition.js";

export const createLocalSessionStore = (databasePath: string): SqliteSessionStore =>
  new SqliteSessionStore(databasePath);

export type LocalMelioraServerOptions =
  Omit<MelioraServerOptions, "store" | "resolveSessionId" | "submitTurnCommand">
  & Readonly<{ turnCommands?: Omit<TurnCommandSubmitterOptions, "store"> }>;

export const createLocalMelioraServer = (
  databasePath: string,
  options: LocalMelioraServerOptions = {},
) => {
  const store = createLocalSessionStore(databasePath);
  const { turnCommands, ...serverOptions } = options;
  const submitTurnCommand = turnCommands
    ? createTurnCommandSubmitter({ ...turnCommands, store })
    : undefined;
  const server = createMelioraServer({
    ...serverOptions,
    submitTurnCommand,
    store,
    resolveSessionId: (runId) => store.readRunSessionId(runId),
  });
  return { server, store } as const;
};
