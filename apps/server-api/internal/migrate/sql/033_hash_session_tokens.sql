CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE sessions ADD COLUMN token_hash TEXT;

UPDATE sessions
SET token_hash = encode(digest(token, 'sha256'), 'hex');

ALTER TABLE sessions ALTER COLUMN token_hash SET NOT NULL;
ALTER TABLE sessions ADD CONSTRAINT sessions_token_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$');
CREATE UNIQUE INDEX sessions_token_hash_idx ON sessions(token_hash);

ALTER TABLE sessions DROP COLUMN token;
