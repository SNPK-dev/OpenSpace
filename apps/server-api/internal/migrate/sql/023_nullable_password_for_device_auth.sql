ALTER TABLE server_identities
  ALTER COLUMN password_hash DROP NOT NULL;

COMMENT ON COLUMN server_identities.password_hash IS
  'NULL for device-authenticated identities (proof-of-possession via device_credentials)';
