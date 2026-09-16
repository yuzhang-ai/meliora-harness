export const TURN_COMMAND_REQUEST_SCHEMA_VERSION = "meliora.turn-command-request.v1" as const;
export const TURN_COMMAND_RESPONSE_SCHEMA_VERSION = "meliora.turn-command-response.v1" as const;
export const TURN_COMMAND_ERROR_SCHEMA_VERSION = "meliora.turn-command-error.v1" as const;

export type TurnCommandRequest = Readonly<{
  schemaVersion: typeof TURN_COMMAND_REQUEST_SCHEMA_VERSION;
  workspaceId: string;
  idempotencyKey: string;
  message: string;
}>;

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
      commandStatus: "reserved" | "accepted" | "dispatched";
      terminalStatus?: never;
      terminalCode?: never;
    }>)
  | (TurnCommandResponseBase & Readonly<{
      commandStatus: "terminal";
      terminalStatus: "completed" | "blocked" | "failed" | "cancelled";
      terminalCode?: string;
    }>);

export const TURN_COMMAND_ERROR_CODES = [
  "invalid_request",
  "invalid_idempotency_key",
  "user_message_empty",
  "user_message_too_large",
  "sensitive_input_rejected",
  "invalid_workspace",
  "idempotency_key_conflict",
  "command_identity_conflict",
  "command_status_conflict",
  "service_unavailable",
  "internal_error",
] as const;

export type TurnCommandErrorCode = typeof TURN_COMMAND_ERROR_CODES[number];

export type TurnCommandErrorResponse = Readonly<{
  schemaVersion: typeof TURN_COMMAND_ERROR_SCHEMA_VERSION;
  error: Readonly<{ code: TurnCommandErrorCode; retryable: boolean }>;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

export const decodeTurnCommandResponse = (value: unknown): TurnCommandResponse | null => {
  if (!isRecord(value)
    || value.schemaVersion !== TURN_COMMAND_RESPONSE_SCHEMA_VERSION
    || (value.disposition !== "created" && value.disposition !== "replay")
    || !isNonEmptyString(value.sessionId)
    || !isNonEmptyString(value.turnId)
    || !isNonEmptyString(value.runId)
    || !isNonEmptyString(value.attemptId)
    || !["reserved", "accepted", "dispatched", "terminal"].includes(String(value.commandStatus))) return null;
  const terminal = value.commandStatus === "terminal";
  const keys = terminal && value.terminalCode !== undefined
    ? ["schemaVersion", "disposition", "sessionId", "turnId", "runId", "attemptId", "commandStatus", "terminalStatus", "terminalCode"]
    : terminal
      ? ["schemaVersion", "disposition", "sessionId", "turnId", "runId", "attemptId", "commandStatus", "terminalStatus"]
      : ["schemaVersion", "disposition", "sessionId", "turnId", "runId", "attemptId", "commandStatus"];
  if (!hasExactKeys(value, keys)) return null;
  if (terminal) {
    if (!["completed", "blocked", "failed", "cancelled"].includes(String(value.terminalStatus))) return null;
    if (value.terminalCode !== undefined && typeof value.terminalCode !== "string") return null;
  }
  return value as TurnCommandResponse;
};

export const decodeTurnCommandErrorResponse = (value: unknown): TurnCommandErrorResponse | null => {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "error"])
    || value.schemaVersion !== TURN_COMMAND_ERROR_SCHEMA_VERSION || !isRecord(value.error)
    || !hasExactKeys(value.error, ["code", "retryable"])
    || !TURN_COMMAND_ERROR_CODES.includes(value.error.code as TurnCommandErrorCode)
    || typeof value.error.retryable !== "boolean") return null;
  return value as TurnCommandErrorResponse;
};
