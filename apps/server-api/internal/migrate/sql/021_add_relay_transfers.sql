CREATE TABLE IF NOT EXISTS relay_transfers (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  encrypted_bundle TEXT        NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  used_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relay_transfers_expires ON relay_transfers(expires_at);
