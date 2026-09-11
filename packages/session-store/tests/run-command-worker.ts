import { SqliteSessionStore } from "../src/sqlite-session-store.js";
import type { ReserveRunCommandInput } from "../contracts.js";

const [databasePath, encodedInput] = process.argv.slice(2);
if (!databasePath || !encodedInput) throw new Error("worker_arguments_missing");

const input = JSON.parse(Buffer.from(encodedInput, "base64url").toString("utf8")) as ReserveRunCommandInput;
const store = new SqliteSessionStore(databasePath);
try {
  process.stdout.write(JSON.stringify(await store.reserveRunCommand(input)));
} finally {
  store.close();
}
