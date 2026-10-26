ALTER TABLE server_settings
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
