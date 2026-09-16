import {
  RunCommandContractError,
  assertValidIdempotencyKey,
  assertValidUserMessage,
  assertValidWorkspaceId,
} from "../../../packages/session-store/run-command-contract.js";
import {
  TURN_COMMAND_REQUEST_SCHEMA_VERSION,
  type TurnCommandRequest,
  type TurnCommandResponse,
} from "../../../packages/agent-runtime/turn-command-wire.js";
export {
  decodeTurnCommandErrorResponse,
  decodeTurnCommandResponse,
  TURN_COMMAND_ERROR_CODES,
  TURN_COMMAND_ERROR_SCHEMA_VERSION,
  TURN_COMMAND_REQUEST_SCHEMA_VERSION,
  TURN_COMMAND_RESPONSE_SCHEMA_VERSION,
  type TurnCommandErrorCode,
  type TurnCommandErrorResponse,
  type TurnCommandRequest,
  type TurnCommandResponse,
} from "../../../packages/agent-runtime/turn-command-wire.js";

/**
 * Browser-owned input. Principal, workspace path, Provider configuration,
 * endpoint, credential, trusted origin, and generated IDs are intentionally
 * absent and unknown fields must be rejected by the future HTTP parser.
 */
const TURN_COMMAND_REQUEST_FIELDS = ["idempotencyKey", "message", "schemaVersion", "workspaceId"] as const;

/** Runtime allowlist parser for the future handler; unknown authority-bearing fields fail closed. */
export const parseTurnCommandRequest = (value: unknown): TurnCommandRequest => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RunCommandContractError("invalid_request");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join("\u0000") !== [...TURN_COMMAND_REQUEST_FIELDS].sort().join("\u0000")
    || record.schemaVersion !== TURN_COMMAND_REQUEST_SCHEMA_VERSION
    || typeof record.workspaceId !== "string"
    || typeof record.idempotencyKey !== "string"
    || typeof record.message !== "string"
  ) {
    throw new RunCommandContractError("invalid_request");
  }
  try {
    assertValidWorkspaceId(record.workspaceId);
    assertValidIdempotencyKey(record.idempotencyKey);
    assertValidUserMessage(record.message);
  } catch (error) {
    if (
      error instanceof RunCommandContractError
      && ["invalid_idempotency_key", "user_message_empty", "user_message_too_large", "sensitive_input_rejected"].includes(error.code)
    ) {
      throw error;
    }
    throw new RunCommandContractError("invalid_request");
  }
  return {
    schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
    workspaceId: record.workspaceId,
    idempotencyKey: record.idempotencyKey,
    message: record.message,
  };
};

/** New and replayed non-terminal commands return 202; a terminal replay returns 200. */
export const turnCommandHttpStatus = (response: TurnCommandResponse): 200 | 202 =>
  response.commandStatus === "terminal" ? 200 : 202;
