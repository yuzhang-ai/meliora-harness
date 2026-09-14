-- WP-3B.1a: private-only atomic terminal model result binding and dormant
-- invocation execution reservation. Runtime does not consume either permit yet.
ALTER TABLE invocations ADD COLUMN execution_started_at TEXT;

-- Immutable commit evidence. run_snapshots remains only the latest pointer.
CREATE TABLE run_snapshot_history (
  snapshot_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  attempt_id TEXT NOT NULL,
  -- Assigned inside the Store transaction; never derived from caller time/IDs.
  commit_ordinal INTEGER NOT NULL CHECK(commit_ordinal > 0),
  through_sequence INTEGER NOT NULL CHECK(through_sequence >= 0),
  state_json TEXT NOT NULL CHECK(json_valid(state_json)),
  state_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(run_id, attempt_id) REFERENCES run_attempts(run_id, attempt_id),
  UNIQUE(run_id, snapshot_id),
  UNIQUE(run_id, commit_ordinal),
  UNIQUE(snapshot_id, commit_ordinal)
);

CREATE TABLE model_step_terminal_results (
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  attempt_id TEXT NOT NULL,
  model_step_id TEXT NOT NULL REFERENCES model_steps(model_step_id),
  request_fingerprint TEXT NOT NULL,
  artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id),
  artifact_content_hash TEXT NOT NULL,
  artifact_media_type TEXT NOT NULL,
  artifact_byte_length INTEGER NOT NULL CHECK(artifact_byte_length >= 0),
  artifact_visibility TEXT NOT NULL CHECK(artifact_visibility = 'private'),
  snapshot_id TEXT NOT NULL UNIQUE REFERENCES run_snapshot_history(snapshot_id),
  commit_ordinal INTEGER NOT NULL CHECK(commit_ordinal > 0),
  through_sequence INTEGER NOT NULL CHECK(through_sequence >= 0),
  state_hash TEXT NOT NULL,
  snapshot_envelope_hash TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  PRIMARY KEY(run_id, model_step_id),
  FOREIGN KEY(run_id, attempt_id) REFERENCES run_attempts(run_id, attempt_id),
  FOREIGN KEY(snapshot_id, commit_ordinal) REFERENCES run_snapshot_history(snapshot_id, commit_ordinal),
  UNIQUE(run_id, commit_ordinal)
);

CREATE INDEX model_step_terminal_results_recovery
  ON model_step_terminal_results(run_id, attempt_id, finished_at, model_step_id);
CREATE INDEX run_snapshot_history_recovery
  ON run_snapshot_history(run_id, commit_ordinal);
CREATE INDEX invocations_recovery_execution
  ON invocations(run_id, attempt_id, status, execution_started_at, reserved_at);
