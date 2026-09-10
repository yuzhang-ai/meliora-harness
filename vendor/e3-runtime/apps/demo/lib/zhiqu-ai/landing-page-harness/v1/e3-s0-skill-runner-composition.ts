import type { E3S0SkillFinalAnswerProviderV1 } from "./e3-s0-skill-final-answer";
import { E3S0SkillDriverV1 } from "./e3-s0-skill-driver";
import { resolveE3S0SkillDatabasePathV1 } from "./e3-s0-skill-runner-config";
import { SqliteE3S0SkillLedgerV1 } from "./sqlite-e3-s0-skill-ledger";

export const createE3S0SkillRunnerCompositionV1 = (input: Readonly<{
  privateRoot: string;
  provider: E3S0SkillFinalAnswerProviderV1;
  clock?: () => number;
  nonce?: () => string;
}>) => {
  const databasePath = resolveE3S0SkillDatabasePathV1(input.privateRoot);
  mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
  chmodSync(dirname(databasePath), 0o700);
  const store = new SqliteE3S0SkillLedgerV1({
    databasePath,
    ...(input.clock ? { clock: input.clock } : {}),
    ...(input.nonce ? { nonce: input.nonce } : {}),
  });
  return Object.freeze({
    store,
    driver: new E3S0SkillDriverV1(store, input.provider, input.clock),
    close: () => store.close(),
  });
};
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
