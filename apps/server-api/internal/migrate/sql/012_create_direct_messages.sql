CREATE TABLE direct_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id       UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES server_identities(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  attachment_id   UUID REFERENCES attachments(id) ON DELETE SET NULL,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_by      UUID REFERENCES server_identities(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX dm_messages_conv_created_idx ON direct_messages(conversation_id, created_at DESC);
