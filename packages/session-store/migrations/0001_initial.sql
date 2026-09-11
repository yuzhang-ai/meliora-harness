CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE turns (
  turn_id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(session_id),
  intent_revision INTEGER NOT NULL CHECK(intent_revision >= 0),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE runs (
  run_id TEXT PRIMARY KEY, turn_id TEXT NOT NULL REFERENCES turns(turn_id),
  session_id TEXT NOT NULL REFERENCES sessions(session_id), active_attempt_id TEXT NOT NULL,
  latest_attempt_number INTEGER NOT NULL CHECK(latest_attempt_number > 0),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE run_attempts (
  attempt_id TEXT NOT NULL, run_id TEXT NOT NULL REFERENCES runs(run_id),
  session_id TEXT NOT NULL REFERENCES sessions(session_id), turn_id TEXT NOT NULL REFERENCES turns(turn_id),
  attempt_number INTEGER NOT NULL CHECK(attempt_number > 0), status TEXT NOT NULL,
  last_event_sequence INTEGER NOT NULL CHECK(last_event_sequence >= 0), catalog_hash TEXT NOT NULL,
  intent_revision INTEGER NOT NULL CHECK(intent_revision >= 0),
  runtime_state_json TEXT NOT NULL CHECK(json_valid(runtime_state_json)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(run_id, attempt_id), UNIQUE(run_id, attempt_number)
);
CREATE TABLE events (
  event_id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(run_id), attempt_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence > 0), schema_version TEXT NOT NULL, kind TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK(visibility IN ('public', 'private')),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), event_hash TEXT NOT NULL,
  created_at TEXT NOT NULL, causation_id TEXT, correlation_id TEXT,
  FOREIGN KEY(run_id, attempt_id) REFERENCES run_attempts(run_id, attempt_id), UNIQUE(run_id, sequence)
);
CREATE INDEX events_run_sequence ON events(run_id, sequence);
CREATE TABLE run_snapshots (
  run_id TEXT PRIMARY KEY REFERENCES runs(run_id), attempt_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL UNIQUE, through_sequence INTEGER NOT NULL CHECK(through_sequence >= 0),
  state_json TEXT NOT NULL CHECK(json_valid(state_json)), state_hash TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY(run_id, attempt_id) REFERENCES run_attempts(run_id, attempt_id)
);
CREATE TABLE invocations (
  invocation_id TEXT NOT NULL, run_id TEXT NOT NULL REFERENCES runs(run_id), attempt_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL UNIQUE, idempotency_key TEXT NOT NULL,
  invocation_json TEXT NOT NULL CHECK(json_valid(invocation_json)), invocation_hash TEXT NOT NULL,
  status TEXT NOT NULL, reserved_at TEXT NOT NULL,
  PRIMARY KEY(run_id, attempt_id, invocation_id),
  FOREIGN KEY(run_id, attempt_id) REFERENCES run_attempts(run_id, attempt_id), UNIQUE(run_id, idempotency_key)
);
CREATE TABLE receipts (
  receipt_id TEXT NOT NULL, run_id TEXT NOT NULL, attempt_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL UNIQUE REFERENCES invocations(reservation_id),
  receipt_json TEXT NOT NULL CHECK(json_valid(receipt_json)), receipt_hash TEXT NOT NULL, committed_at TEXT NOT NULL,
  PRIMARY KEY(run_id, attempt_id, receipt_id),
  FOREIGN KEY(run_id, attempt_id) REFERENCES run_attempts(run_id, attempt_id)
);
CREATE TABLE artifacts (
  artifact_id TEXT PRIMARY KEY, content_hash TEXT NOT NULL, media_type TEXT NOT NULL,
  content BLOB NOT NULL, byte_length INTEGER NOT NULL CHECK(byte_length >= 0),
  visibility TEXT NOT NULL CHECK(visibility IN ('public', 'private')),
  metadata_json TEXT CHECK(metadata_json IS NULL OR json_valid(metadata_json)), created_at TEXT NOT NULL
);
CREATE TABLE run_leases (
  run_id TEXT NOT NULL, attempt_id TEXT NOT NULL, owner_id TEXT NOT NULL,
  lease_token_hash TEXT NOT NULL, expires_at TEXT NOT NULL,
  PRIMARY KEY(run_id, attempt_id),
  FOREIGN KEY(run_id, attempt_id) REFERENCES run_attempts(run_id, attempt_id)
);
