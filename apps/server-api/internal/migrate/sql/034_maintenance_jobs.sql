CREATE TABLE IF NOT EXISTS maintenance_runs (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed','dry_run')),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt > 0),
  examined BIGINT NOT NULL DEFAULT 0 CHECK (examined >= 0),
  affected BIGINT NOT NULL DEFAULT 0 CHECK (affected >= 0),
  error_category TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS maintenance_runs_job_started_idx ON maintenance_runs(job_name, started_at DESC);

CREATE TABLE IF NOT EXISTS maintenance_dead_letters (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  run_id BIGINT REFERENCES maintenance_runs(id) ON DELETE SET NULL,
  error_category TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS maintenance_dead_letters_unresolved_idx ON maintenance_dead_letters(created_at) WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS sessions_expires_cleanup_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS attachments_pending_cleanup_idx ON attachments(created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS push_tokens_created_cleanup_idx ON push_tokens(created_at);
