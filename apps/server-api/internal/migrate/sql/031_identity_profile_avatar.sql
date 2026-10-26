ALTER TABLE server_identities
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
