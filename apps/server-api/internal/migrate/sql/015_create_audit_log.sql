CREATE TABLE audit_log (
  id           BIGSERIAL    PRIMARY KEY,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  server_id    TEXT         NOT NULL DEFAULT '',
  actor_id     TEXT         NOT NULL DEFAULT '',
  action       TEXT         NOT NULL,
  target_id    TEXT         NOT NULL DEFAULT '',
  target_type  TEXT         NOT NULL DEFAULT '',
  meta         JSONB        NOT NULL DEFAULT '{}'
);

CREATE INDEX audit_log_server_created ON audit_log (server_id, created_at DESC);
