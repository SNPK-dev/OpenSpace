-- Fix 7: add token_id for O(1) pairing token lookup.
-- Client format: "token_id.token_secret"; server looks up by token_id, verifies sha256(token_secret) == token_hash.
ALTER TABLE pairing_tokens
  ADD COLUMN IF NOT EXISTS token_id TEXT;

-- Backfill existing rows (dev/test data) using their UUID id
UPDATE pairing_tokens SET token_id = id::text WHERE token_id IS NULL;

ALTER TABLE pairing_tokens ALTER COLUMN token_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pairing_tokens_token_id_idx ON pairing_tokens(token_id);
