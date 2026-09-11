export class SequenceConflictError extends Error {
  readonly code = "sequence_conflict";

  constructor(
    readonly runId: string,
    readonly expectedSequence: number,
    readonly actualSequence: number,
  ) {
    super(`Run ${runId} expected sequence ${expectedSequence}, actual ${actualSequence}.`);
  }
}

export class EventCursorConflictError extends Error {
  readonly code = "event_cursor_conflict";
}

export class IdempotencyConflictError extends Error {
  readonly code = "idempotency_conflict";
}

export class StoreIntegrityError extends Error {
  readonly code = "store_integrity_error";
}

export class SensitiveDataError extends Error {
  readonly code = "sensitive_data_rejected";
}
