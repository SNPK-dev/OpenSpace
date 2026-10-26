CREATE TABLE attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id    UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  identity_id  UUID NOT NULL REFERENCES server_identities(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes   BIGINT NOT NULL,
  object_key   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX attachments_identity_idx ON attachments(identity_id, created_at DESC);
