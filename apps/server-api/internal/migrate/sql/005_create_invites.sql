CREATE TABLE invites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id  UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  code       TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES server_identities(id) ON DELETE CASCADE,
  max_uses   INT NOT NULL DEFAULT 1,
  use_count  INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX invites_code_idx ON invites(code);
