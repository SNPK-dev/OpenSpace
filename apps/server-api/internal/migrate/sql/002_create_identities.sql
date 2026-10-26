CREATE TABLE server_identities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id     UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  username      TEXT NOT NULL,
  email         TEXT,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  is_disabled   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(server_id, username),
  UNIQUE(server_id, email)
);

CREATE INDEX server_identities_server_idx ON server_identities(server_id);
