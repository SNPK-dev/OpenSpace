CREATE TABLE dm_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id       UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  participant_a   UUID NOT NULL REFERENCES server_identities(id) ON DELETE CASCADE,
  participant_b   UUID NOT NULL REFERENCES server_identities(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dm_conversations_canonical CHECK (participant_a < participant_b),
  CONSTRAINT dm_conversations_unique UNIQUE (server_id, participant_a, participant_b)
);

CREATE INDEX dm_conversations_a_idx ON dm_conversations(server_id, participant_a);
CREATE INDEX dm_conversations_b_idx ON dm_conversations(server_id, participant_b);
