ALTER TABLE server_settings
  ADD COLUMN IF NOT EXISTS registration_policy TEXT NOT NULL DEFAULT 'invite_code_only';

ALTER TABLE server_identities
  ADD COLUMN IF NOT EXISTS connection_state TEXT NOT NULL DEFAULT 'joined';
