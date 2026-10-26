CREATE TABLE backup_log (
  id             BIGSERIAL    PRIMARY KEY,
  taken_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  manifest_path  TEXT         NOT NULL,
  db_size_bytes  BIGINT       NOT NULL,
  schema_version INT          NOT NULL,
  env            TEXT         NOT NULL DEFAULT 'dev',
  status         TEXT         NOT NULL DEFAULT 'ok'
);
