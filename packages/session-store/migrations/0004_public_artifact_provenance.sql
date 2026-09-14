-- WP-3B.2b.1: Store-only staged public derivative aliases.  The physical
-- artifact remains private; this table deliberately contains no source ID.
CREATE TABLE staged_public_artifact_provenance (
  public_alias TEXT PRIMARY KEY,
  physical_artifact_id TEXT NOT NULL UNIQUE REFERENCES artifacts(artifact_id),
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  origin_attempt_id TEXT NOT NULL,
  origin_invocation_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL UNIQUE REFERENCES invocations(reservation_id),
  projection_kind TEXT NOT NULL CHECK(projection_kind = 'tool_result'),
  content_hash TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK(media_type = 'text/plain'),
  byte_length INTEGER NOT NULL CHECK(byte_length >= 0),
  physical_visibility TEXT NOT NULL CHECK(physical_visibility = 'private'),
  created_at TEXT NOT NULL,
  FOREIGN KEY(run_id, origin_attempt_id) REFERENCES run_attempts(run_id, attempt_id),
  UNIQUE(run_id, origin_attempt_id, origin_invocation_id, projection_kind)
);

CREATE INDEX staged_public_artifact_provenance_resolve
  ON staged_public_artifact_provenance(run_id, session_id, public_alias);
