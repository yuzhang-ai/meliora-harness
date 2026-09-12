import type {
  RunCommandStatus,
  RunCommandTerminalStatus,
} from "../../../packages/session-store/contracts.js";
import type { RunCommandSafeErrorCode } from "../../../packages/session-store/run-command-contract.js";
import {
  RunCommandContractError,
  assertValidIdempotencyKey,
  assertValidUserMessage,
  assertValidWorkspaceId,
} from "../../../packages/session-store/run-command-contract.js";

export const TURN_COMMAND_REQUEST_SCHEMA_VERSION = "meliora.turn-command-request.v1" as const;
export const TURN_COMMAND_RESPONSE_SCHEMA_VERSION = "meliora.turn-command-response.v1" as const;
export const TURN_COMMAND_ERROR_SCHEMA_VERSION = "meliora.turn-command-error.v1" as const;

/**
 * Browser-owned input. Principal, workspace path, Provider configuration,
 * endpoint, credential, trusted origin, and generated IDs are intentionally
 * absent and unknown fields must be rejected by the future HTTP parser.
 */
export type TurnCommandRequest = Readonly<{
  schemaVersion: typeof TURN_COMMAND_REQUEST_SCHEMA_VERSION;
  workspaceId: string;
  idempotencyKey: string;
  message: string;
}>;

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

type TurnCommandResponseBase = Readonly<{
  schemaVersion: typeof TURN_COMMAND_RESPONSE_SCHEMA_VERSION;
  disposition: "created" | "replay";
  sessionId: string;
  turnId: string;
  runId: string;
  attemptId: string;
}>;

export type TurnCommandResponse =
  | (TurnCommandResponseBase & Readonly<{
      commandStatus: Exclude<RunCommandStatus, "terminal">;
      terminalStatus?: never;
      terminalCode?: never;
    }>)
  | (TurnCommandResponseBase & Readonly<{
      commandStatus: "terminal";
      terminalStatus: RunCommandTerminalStatus;
      terminalCode?: string;
    }>);

export type TurnCommandErrorCode =
  | Extract<
      RunCommandSafeErrorCode,
      | "invalid_request"
      | "invalid_idempotency_key"
      | "user_message_empty"
      | "user_message_too_large"
      | "sensitive_input_rejected"
    >
  | "invalid_workspace"
  | "idempotency_key_conflict"
  | "command_identity_conflict"
  | "command_status_conflict"
  | "service_unavailable"
  | "internal_error";

/** Safe response only. It must never carry request text, hashes, paths, or raw errors. */
export type TurnCommandErrorResponse = Readonly<{
  schemaVersion: typeof TURN_COMMAND_ERROR_SCHEMA_VERSION;
  error: Readonly<{
    code: TurnCommandErrorCode;
    retryable: boolean;
  }>;
}>;

/** New and replayed non-terminal commands return 202; a terminal replay returns 200. */
export const turnCommandHttpStatus = (response: TurnCommandResponse): 200 | 202 =>
  response.commandStatus === "terminal" ? 200 : 202;
