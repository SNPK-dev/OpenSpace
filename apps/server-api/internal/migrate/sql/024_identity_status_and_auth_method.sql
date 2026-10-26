-- Fix: separate server-side identity_status from client-side connection_state.
-- Add auth_method to guard legacy password login against device-credential identities.

-- Replace connection_state with identity_status (server-scoped concept)
ALTER TABLE server_identities
  ADD COLUMN IF NOT EXISTS identity_status TEXT NOT NULL DEFAULT 'active';

-- Drop the incorrectly-named column (replaced by identity_status)
-- Safe: connection_state was added in migration 022 and has only default value in existing rows
ALTER TABLE server_identities
  DROP COLUMN IF EXISTS connection_state;

-- Explicit auth method prevents accidental password-auth bypass when password_hash IS NULL
ALTER TABLE server_identities
  ADD COLUMN IF NOT EXISTS auth_method TEXT NOT NULL DEFAULT 'legacy_password';

-- Add check constraints
ALTER TABLE server_identities
  ADD CONSTRAINT identity_status_check
    CHECK (identity_status IN ('active', 'pending', 'rejected', 'revoked', 'suspended'));

ALTER TABLE server_identities
  ADD CONSTRAINT auth_method_check
    CHECK (auth_method IN ('legacy_password', 'device_credential', 'disabled'));

-- Backfill: existing identities with password_hash already set are legacy_password (already default)
-- Device-credential identities (password_hash IS NULL) are set below
UPDATE server_identities
  SET auth_method = 'device_credential'
  WHERE password_hash IS NULL;
