CREATE TABLE IF NOT EXISTS maintenance_policy (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  message_retention_days INTEGER CHECK (message_retention_days IS NULL OR message_retention_days >= 30),
  audit_retention_days INTEGER CHECK (audit_retention_days IS NULL OR audit_retention_days >= 90),
  push_token_retention_days INTEGER CHECK (push_token_retention_days IS NULL OR push_token_retention_days >= 30),
  orphan_grace_hours INTEGER NOT NULL DEFAULT 24 CHECK (orphan_grace_hours >= 24),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES server_identities(id) ON DELETE SET NULL
);
INSERT INTO maintenance_policy(singleton) VALUES(TRUE) ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS messages_retention_idx ON messages(created_at);
CREATE INDEX IF NOT EXISTS audit_log_retention_idx ON audit_log(created_at);
