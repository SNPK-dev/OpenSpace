CREATE TABLE IF NOT EXISTS pairing_tokens (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash           TEXT        NOT NULL UNIQUE,
  server_identity_id   UUID        NOT NULL REFERENCES server_identities(id) ON DELETE CASCADE,
  created_by_device_id UUID        NOT NULL REFERENCES device_credentials(id),
  scope                TEXT        NOT NULL DEFAULT 'add_device',
  expires_at           TIMESTAMPTZ NOT NULL,
  usage_limit          INT         NOT NULL DEFAULT 1,
  used_count           INT         NOT NULL DEFAULT 0,
  status               TEXT        NOT NULL DEFAULT 'active',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pairing_token_status_check CHECK (status IN ('active', 'used', 'revoked', 'suspicious'))
);

CREATE INDEX IF NOT EXISTS idx_pairing_tokens_hash     ON pairing_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_pairing_tokens_identity ON pairing_tokens(server_identity_id);
CREATE INDEX IF NOT EXISTS idx_pairing_tokens_expires  ON pairing_tokens(expires_at);
