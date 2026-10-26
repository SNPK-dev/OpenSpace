CREATE TABLE IF NOT EXISTS device_credentials (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  server_identity_id UUID        NOT NULL REFERENCES server_identities(id) ON DELETE CASCADE,
  device_public_key  TEXT        NOT NULL,
  device_status      TEXT        NOT NULL DEFAULT 'active',
  client_type        TEXT        NOT NULL DEFAULT 'web',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at       TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ,
  CONSTRAINT device_status_check CHECK (device_status IN ('active', 'pending', 'revoked')),
  CONSTRAINT client_type_check   CHECK (client_type   IN ('web', 'windows', 'mobile'))
);

CREATE INDEX IF NOT EXISTS idx_device_credentials_identity ON device_credentials(server_identity_id);
CREATE INDEX IF NOT EXISTS idx_device_credentials_status   ON device_credentials(device_status);
