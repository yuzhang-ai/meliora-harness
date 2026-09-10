import { resolve } from "node:path";

export const E3_S0_SKILL_RUNNER_CONFIG_V1 = Object.freeze({
  contractVersion: "formal-r3-e3-s0-skill-runner-config-v1",
  stateDirectoryName: "e3-state-v1",
  databaseFileName: "skill-ledger.sqlite",
  providerInputRequired: false,
  realProviderCalls: 0,
  canvasWrite: false,
} as const);

export const resolveE3S0SkillDatabasePathV1 = (privateRoot: string) =>
  resolve(
    privateRoot,
    E3_S0_SKILL_RUNNER_CONFIG_V1.stateDirectoryName,
    E3_S0_SKILL_RUNNER_CONFIG_V1.databaseFileName
  );
