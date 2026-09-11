CREATE TABLE run_commands (
  local_principal_id TEXT NOT NULL CHECK(length(local_principal_id) BETWEEN 1 AND 200),
  workspace_id TEXT NOT NULL CHECK(length(workspace_id) BETWEEN 1 AND 200),
  idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 200),
  canonical_request_hash TEXT NOT NULL CHECK(length(canonical_request_hash) > 0),
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  turn_id TEXT NOT NULL UNIQUE REFERENCES turns(turn_id),
  run_id TEXT PRIMARY KEY REFERENCES runs(run_id),
  attempt_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('reserved', 'accepted', 'dispatched', 'terminal')),
  terminal_status TEXT CHECK(terminal_status IS NULL OR terminal_status IN ('completed', 'blocked', 'failed', 'cancelled')),
  terminal_code TEXT CHECK(terminal_code IS NULL OR length(terminal_code) > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  accepted_at TEXT,
  dispatched_at TEXT,
  terminal_at TEXT,
  FOREIGN KEY(run_id, attempt_id) REFERENCES run_attempts(run_id, attempt_id),
  UNIQUE(local_principal_id, workspace_id, idempotency_key),
  UNIQUE(run_id, attempt_id),
  UNIQUE(run_id, session_id, turn_id),
  CHECK(dispatched_at IS NULL OR accepted_at IS NOT NULL),
  CHECK(status != 'reserved' OR (accepted_at IS NULL AND dispatched_at IS NULL AND terminal_at IS NULL)),
  CHECK(status != 'accepted' OR (accepted_at IS NOT NULL AND dispatched_at IS NULL AND terminal_at IS NULL)),
  CHECK(status != 'dispatched' OR (accepted_at IS NOT NULL AND dispatched_at IS NOT NULL AND terminal_at IS NULL)),
  CHECK(
    (status = 'terminal' AND terminal_status IS NOT NULL AND terminal_at IS NOT NULL)
    OR
    (status != 'terminal' AND terminal_status IS NULL AND terminal_code IS NULL AND terminal_at IS NULL)
  )
);

CREATE TABLE run_command_inputs (
  run_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role = 'user'),
  visibility TEXT NOT NULL CHECK(visibility = 'private'),
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK(length(content_hash) > 0),
  created_at TEXT NOT NULL,
  FOREIGN KEY(run_id, session_id, turn_id) REFERENCES run_commands(run_id, session_id, turn_id),
  FOREIGN KEY(session_id) REFERENCES sessions(session_id),
  FOREIGN KEY(turn_id) REFERENCES turns(turn_id),
  UNIQUE(session_id, turn_id)
);

CREATE TABLE model_steps (
  model_step_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL CHECK(length(request_fingerprint) > 0),
  status TEXT NOT NULL CHECK(status IN ('started', 'terminal', 'failed')),
  failure_code TEXT CHECK(failure_code IS NULL OR length(failure_code) > 0),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES run_commands(run_id),
  FOREIGN KEY(run_id, attempt_id) REFERENCES run_attempts(run_id, attempt_id),
  UNIQUE(run_id, model_step_id),
  CHECK(
    (status = 'started' AND failure_code IS NULL AND finished_at IS NULL)
    OR
    (status = 'terminal' AND failure_code IS NULL AND finished_at IS NOT NULL)
    OR
    (status = 'failed' AND failure_code IS NOT NULL AND finished_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX model_steps_one_started_per_run
  ON model_steps(run_id)
  WHERE status = 'started';

CREATE INDEX run_commands_recovery_status
  ON run_commands(status, updated_at);

CREATE INDEX model_steps_recovery_status
  ON model_steps(run_id, attempt_id, status, started_at);
