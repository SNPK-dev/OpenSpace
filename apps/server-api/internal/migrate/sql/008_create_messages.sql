CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id   UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  channel_id  UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  identity_id UUID NOT NULL REFERENCES server_identities(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_by  UUID REFERENCES server_identities(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX messages_channel_created_idx ON messages(channel_id, created_at DESC);
