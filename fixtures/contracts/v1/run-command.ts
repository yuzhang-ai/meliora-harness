import type {
  StoredModelStepCheckpoint,
  StoredPrivateUserInput,
  StoredRunCommand,
} from "../../../packages/session-store/contracts.js";
import {
  canonicalRunCommandRequestHash,
  privateUserInputContentHash,
} from "../../../packages/session-store/run-command-contract.js";
import {
  TURN_COMMAND_REQUEST_SCHEMA_VERSION,
  TURN_COMMAND_RESPONSE_SCHEMA_VERSION,
  type TurnCommandRequest,
  type TurnCommandErrorResponse,
  type TurnCommandResponse,
} from "../../../apps/server/api-contracts/turn-command.js";
import { hashBytes } from "../../../packages/session-store/src/integrity.js";

export const RUN_COMMAND_FIXTURE_TIMESTAMP = "2026-09-11T02:00:00.000Z";

export const runCommandRequestFixture: TurnCommandRequest = {
  schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
  workspaceId: "workspace-1",
  idempotencyKey: "turn-command-1",
  message: "Inspect the repository status.",
};

export const runCommandHashFixture = canonicalRunCommandRequestHash(runCommandRequestFixture);

export const reservedRunCommandFixture: StoredRunCommand = {
  schemaVersion: "meliora.run-command.v1",
  localPrincipalId: "local-user",
  workspaceId: runCommandRequestFixture.workspaceId,
  idempotencyKey: runCommandRequestFixture.idempotencyKey,
  canonicalRequestHash: runCommandHashFixture,
  sessionId: "session-command-1",
  turnId: "turn-command-1",
  runId: "run-command-1",
  attemptId: "attempt-command-1",
  status: "reserved",
  createdAt: RUN_COMMAND_FIXTURE_TIMESTAMP,
  updatedAt: RUN_COMMAND_FIXTURE_TIMESTAMP,
};

export const privateUserInputFixture: StoredPrivateUserInput = {
  schemaVersion: "meliora.private-user-input.v1",
  sessionId: reservedRunCommandFixture.sessionId,
  turnId: reservedRunCommandFixture.turnId,
  role: "user",
  visibility: "private",
  content: runCommandRequestFixture.message,
  contentHash: privateUserInputContentHash(runCommandRequestFixture.message),
  createdAt: RUN_COMMAND_FIXTURE_TIMESTAMP,
};

export const acceptedRunCommandResponseFixture: TurnCommandResponse = {
  schemaVersion: TURN_COMMAND_RESPONSE_SCHEMA_VERSION,
  disposition: "created",
  sessionId: reservedRunCommandFixture.sessionId,
  turnId: reservedRunCommandFixture.turnId,
  runId: reservedRunCommandFixture.runId,
  attemptId: reservedRunCommandFixture.attemptId,
  commandStatus: reservedRunCommandFixture.status,
};

export const idempotencyConflictResponseFixture: TurnCommandErrorResponse = {
  schemaVersion: "meliora.turn-command-error.v1",
  error: {
    code: "idempotency_key_conflict",
    retryable: false,
  },
};

export const startedModelStepFixture: StoredModelStepCheckpoint = {
  schemaVersion: "meliora.model-step-checkpoint.v1",
  runId: reservedRunCommandFixture.runId,
  attemptId: reservedRunCommandFixture.attemptId,
  modelStepId: "model-step-1",
  requestFingerprint: hashBytes("model-request-1"),
  status: "started",
  startedAt: RUN_COMMAND_FIXTURE_TIMESTAMP,
};

export const modelStepOutcomeUnknownFixture = {
  code: "model_step_outcome_unknown",
  retryProvider: false,
  commandStatus: "terminal",
  terminalStatus: "blocked",
  modelStep: startedModelStepFixture,
} as const;
