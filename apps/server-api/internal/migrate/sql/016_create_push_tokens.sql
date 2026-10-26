CREATE TABLE IF NOT EXISTS push_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_id UUID        NOT NULL REFERENCES server_identities(id) ON DELETE CASCADE,
    platform    TEXT        NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    token       TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (identity_id, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_identity ON push_tokens (identity_id);
