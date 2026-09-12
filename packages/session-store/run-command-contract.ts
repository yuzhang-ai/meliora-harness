import { assertPersistableText } from "./src/sensitive-data.js";
import { hashBytes, hashJson } from "./src/integrity.js";
import type {
  ReserveRunCommandInput,
  RunCommandStatus,
  StoredModelStepCheckpoint,
} from "./contracts.js";

export const RUN_COMMAND_IDENTIFIER_MAX_LENGTH = 200;
export const RUN_COMMAND_IDEMPOTENCY_KEY_MAX_LENGTH = 200;
export const RUN_COMMAND_USER_MESSAGE_MAX_UTF8_BYTES = 65_536;

export type RunCommandSafeErrorCode =
  | "invalid_request"
  | "invalid_principal_id"
  | "invalid_workspace_id"
  | "invalid_idempotency_key"
  | "invalid_generated_id"
  | "invalid_request_hash"
  | "invalid_model_step_fingerprint"
  | "invalid_safe_code"
  | "invalid_timestamp"
  | "user_message_empty"
  | "user_message_too_large"
  | "sensitive_input_rejected";

const SAFE_MESSAGES: Readonly<Record<RunCommandSafeErrorCode, string>> = {
  invalid_request: "The turn command request is invalid.",
  invalid_principal_id: "The local principal is invalid.",
  invalid_workspace_id: "The workspace is invalid.",
  invalid_idempotency_key: "The idempotency key is invalid.",
  invalid_generated_id: "A generated identifier is invalid.",
  invalid_request_hash: "The canonical request hash is invalid.",
  invalid_model_step_fingerprint: "The model step fingerprint is invalid.",
  invalid_safe_code: "A durable status code is invalid.",
  invalid_timestamp: "A command timestamp is invalid.",
  user_message_empty: "The user message must not be empty.",
  user_message_too_large: "The user message is too large.",
  sensitive_input_rejected: "The user message contains data that cannot be persisted.",
};

export class RunCommandContractError extends Error {
  readonly name = "RunCommandContractError";

  constructor(readonly code: RunCommandSafeErrorCode) {
    super(SAFE_MESSAGES[code]);
  }
}

export type CanonicalRunCommandRequest = Readonly<{
  workspaceId: string;
  message: string;
}>;

const requireIdentifier = (
  value: string,
  code: Extract<RunCommandSafeErrorCode, "invalid_principal_id" | "invalid_workspace_id" | "invalid_generated_id">,
): void => {
  if (
    value.length === 0
    || value.length > RUN_COMMAND_IDENTIFIER_MAX_LENGTH
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
  ) {
    throw new RunCommandContractError(code);
  }
};

export const assertValidLocalPrincipalId = (value: string): void =>
  requireIdentifier(value, "invalid_principal_id");

export const assertValidWorkspaceId = (value: string): void =>
  requireIdentifier(value, "invalid_workspace_id");

export const assertValidGeneratedId = (value: string): void =>
  requireIdentifier(value, "invalid_generated_id");

export const assertValidIdempotencyKey = (value: string): void => {
  if (
    value.length === 0
    || value.length > RUN_COMMAND_IDEMPOTENCY_KEY_MAX_LENGTH
    || !/^[A-Za-z0-9._:-]+$/u.test(value)
  ) {
    throw new RunCommandContractError("invalid_idempotency_key");
  }
};

export const assertValidUserMessage = (value: string): void => {
  if (value.trim().length === 0) throw new RunCommandContractError("user_message_empty");
  if (Buffer.byteLength(value, "utf8") > RUN_COMMAND_USER_MESSAGE_MAX_UTF8_BYTES) {
    throw new RunCommandContractError("user_message_too_large");
  }
  try {
    assertPersistableText(value, "turn-command.message");
  } catch {
    throw new RunCommandContractError("sensitive_input_rejected");
  }
};

export const assertValidModelStepFingerprint = (value: string): void => {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new RunCommandContractError("invalid_model_step_fingerprint");
  }
};

export const assertValidSafeCode = (value: string): void => {
  if (!/^[a-z0-9][a-z0-9_.:-]{0,199}$/u.test(value)) {
    throw new RunCommandContractError("invalid_safe_code");
  }
};

export const assertValidCommandTimestamp = (value: string): void => {
  if (!Number.isFinite(Date.parse(value))) throw new RunCommandContractError("invalid_timestamp");
};

export const canonicalRunCommandRequestHash = (request: CanonicalRunCommandRequest): string => {
  assertValidWorkspaceId(request.workspaceId);
  assertValidUserMessage(request.message);
  return hashJson({
    schemaVersion: "meliora.turn-command-request.v1",
    workspaceId: request.workspaceId,
    message: request.message,
  });
};

export const privateUserInputContentHash = (message: string): string => {
  assertValidUserMessage(message);
  return hashBytes(message);
};

export const assertCanonicalRunCommandRequestHash = (
  request: CanonicalRunCommandRequest,
  canonicalRequestHash: string,
): void => {
  if (!/^[a-f0-9]{64}$/u.test(canonicalRequestHash)) {
    throw new RunCommandContractError("invalid_request_hash");
  }
  if (canonicalRunCommandRequestHash(request) !== canonicalRequestHash) {
    throw new RunCommandContractError("invalid_request_hash");
  }
};

export const assertValidReserveRunCommandInput = (input: ReserveRunCommandInput): void => {
  assertValidLocalPrincipalId(input.localPrincipalId);
  assertValidWorkspaceId(input.workspaceId);
  assertValidIdempotencyKey(input.idempotencyKey);
  for (const id of [input.sessionId, input.turnId, input.runId, input.attemptId, input.catalogHash]) {
    assertValidGeneratedId(id);
  }
  if (!Number.isSafeInteger(input.intentRevision) || input.intentRevision < 0) {
    throw new RunCommandContractError("invalid_request");
  }
  assertValidCommandTimestamp(input.reservedAt);
  assertCanonicalRunCommandRequestHash(
    { workspaceId: input.workspaceId, message: input.userMessage },
    input.canonicalRequestHash,
  );
};

const RUN_COMMAND_TRANSITIONS: Readonly<Record<RunCommandStatus, readonly RunCommandStatus[]>> = {
  reserved: ["accepted", "terminal"],
  accepted: ["terminal"],
  dispatched: ["terminal"],
  terminal: [],
};

export const canTransitionRunCommand = (from: RunCommandStatus, to: RunCommandStatus): boolean =>
  RUN_COMMAND_TRANSITIONS[from].includes(to);

export type ModelStepRecoveryDisposition =
  | Readonly<{ kind: "blocked"; code: "model_step_outcome_unknown"; retryProvider: false }>
  | Readonly<{ kind: "settled"; status: "terminal" | "failed"; retryProvider: false }>;

/** An unresolved started checkpoint is evidence that a paid call may have been sent. */
export const deriveModelStepRecoveryDisposition = (
  checkpoint: StoredModelStepCheckpoint,
): ModelStepRecoveryDisposition => checkpoint.status === "started"
  ? { kind: "blocked", code: "model_step_outcome_unknown", retryProvider: false }
  : { kind: "settled", status: checkpoint.status, retryProvider: false };
