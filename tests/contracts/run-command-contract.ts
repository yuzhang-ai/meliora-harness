import assert from "node:assert/strict";

import {
  acceptedRunCommandResponseFixture,
  idempotencyConflictResponseFixture,
  modelStepOutcomeUnknownFixture,
  privateUserInputFixture,
  reservedRunCommandFixture,
  runCommandHashFixture,
  runCommandRequestFixture,
  startedModelStepFixture,
} from "../../fixtures/contracts/v1/run-command";
import {
  TURN_COMMAND_REQUEST_SCHEMA_VERSION,
  parseTurnCommandRequest,
  turnCommandHttpStatus,
  type TurnCommandRequest,
} from "../../apps/server/api-contracts/turn-command";
import {
  RUN_COMMAND_USER_MESSAGE_MAX_UTF8_BYTES,
  RunCommandContractError,
  assertCanonicalRunCommandRequestHash,
  assertValidUserMessage,
  canonicalRunCommandRequestHash,
  deriveModelStepRecoveryDisposition,
  privateUserInputContentHash,
} from "../../packages/session-store/run-command-contract";

assert.equal(runCommandRequestFixture.schemaVersion, TURN_COMMAND_REQUEST_SCHEMA_VERSION);
assert.deepEqual(Object.keys(runCommandRequestFixture).sort(), [
  "idempotencyKey",
  "message",
  "schemaVersion",
  "workspaceId",
]);
assert.deepEqual(parseTurnCommandRequest(runCommandRequestFixture), runCommandRequestFixture);
assert.throws(
  () => parseTurnCommandRequest({ ...runCommandRequestFixture, localPrincipalId: "browser-controlled" }),
  (error: unknown) => error instanceof RunCommandContractError && error.code === "invalid_request",
);
for (const forbidden of ["localPrincipalId", "workspacePath", "provider", "endpoint", "apiKey", "sessionId", "runId"]) {
  assert.equal(forbidden in runCommandRequestFixture, false);
}

assert.equal(runCommandHashFixture, canonicalRunCommandRequestHash(runCommandRequestFixture));
assert.match(runCommandHashFixture, /^[a-f0-9]{64}$/u);
assert.doesNotThrow(() => assertCanonicalRunCommandRequestHash(runCommandRequestFixture, runCommandHashFixture));
assert.throws(
  () => assertCanonicalRunCommandRequestHash(runCommandRequestFixture, "0".repeat(64)),
  (error: unknown) => error instanceof RunCommandContractError && error.code === "invalid_request_hash",
);
assert.notEqual(
  canonicalRunCommandRequestHash({ ...runCommandRequestFixture, message: `${runCommandRequestFixture.message}!` }),
  runCommandHashFixture,
);
assert.notEqual(
  canonicalRunCommandRequestHash({ ...runCommandRequestFixture, workspaceId: "workspace-2" }),
  runCommandHashFixture,
);

assert.equal(reservedRunCommandFixture.canonicalRequestHash, runCommandHashFixture);
assert.equal(reservedRunCommandFixture.status, "reserved");
assert.equal(privateUserInputFixture.visibility, "private");
assert.equal(privateUserInputFixture.role, "user");
assert.equal(privateUserInputFixture.contentHash, privateUserInputContentHash(runCommandRequestFixture.message));
assert.equal(acceptedRunCommandResponseFixture.commandStatus, "reserved");
assert.equal(turnCommandHttpStatus(acceptedRunCommandResponseFixture), 202);
assert.equal(turnCommandHttpStatus({
  ...acceptedRunCommandResponseFixture,
  disposition: "replay",
  commandStatus: "terminal",
  terminalStatus: "completed",
}), 200);
assert.deepEqual(Object.keys(idempotencyConflictResponseFixture.error).sort(), ["code", "retryable"]);
assert.equal(idempotencyConflictResponseFixture.error.code, "idempotency_key_conflict");
assert.equal(JSON.stringify(idempotencyConflictResponseFixture).includes(runCommandRequestFixture.message), false);
assert.equal(JSON.stringify(idempotencyConflictResponseFixture).includes(runCommandHashFixture), false);

assert.deepEqual(deriveModelStepRecoveryDisposition(startedModelStepFixture), {
  kind: "blocked",
  code: "model_step_outcome_unknown",
  retryProvider: false,
});
assert.deepEqual(modelStepOutcomeUnknownFixture, {
  code: "model_step_outcome_unknown",
  retryProvider: false,
  commandStatus: "terminal",
  terminalStatus: "blocked",
  modelStep: startedModelStepFixture,
});

const exactAsciiBoundary = "a".repeat(RUN_COMMAND_USER_MESSAGE_MAX_UTF8_BYTES);
const exactEmojiBoundary = "😀".repeat(RUN_COMMAND_USER_MESSAGE_MAX_UTF8_BYTES / 4);
assert.doesNotThrow(() => assertValidUserMessage(exactAsciiBoundary));
assert.doesNotThrow(() => assertValidUserMessage(exactEmojiBoundary));
assert.throws(
  () => assertValidUserMessage(`${exactEmojiBoundary}a`),
  (error: unknown) => error instanceof RunCommandContractError && error.code === "user_message_too_large",
);
for (const sensitive of [
  "Authorization: Bearer opaque-provider-credential",
  "x-api-key: opaque-provider-credential",
  "OPENAI_API_KEY=opaque-provider-credential",
  "Cookie: sessionid=opaque-secret",
  "Set-Cookie: sessionid=opaque-secret; HttpOnly",
  "password = opaque-provider-credential",
  "sk-meliora-command-secret-123456789",
]) {
  assert.throws(
    () => assertValidUserMessage(sensitive),
    (error: unknown) => error instanceof RunCommandContractError && error.code === "sensitive_input_rejected",
  );
}

const compileOnlyRequest: TurnCommandRequest = runCommandRequestFixture;
void compileOnlyRequest;

console.log(JSON.stringify({
  gate: "run-command-contract",
  status: "PASS",
  browserInputAllowlist: true,
  canonicalHash: true,
  privateUserInput: true,
  utf8MessageBoundary: true,
  modelStepUnknownBlocks: true,
}));
