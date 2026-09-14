-- A Receipt and the public tool facts derived from it are one immutable
-- observable fact. The stored hash protects exact replay after a crash.
CREATE TABLE receipt_public_event_bindings (
  reservation_id TEXT PRIMARY KEY REFERENCES invocations(reservation_id),
  receipt_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  expected_sequence INTEGER NOT NULL,
  first_sequence INTEGER NOT NULL,
  last_sequence INTEGER NOT NULL,
  events_json TEXT NOT NULL,
  events_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(receipt_id, run_id, attempt_id) REFERENCES receipts(receipt_id, run_id, attempt_id)
);
