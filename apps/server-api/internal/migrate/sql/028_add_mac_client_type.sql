ALTER TABLE device_credentials
  DROP CONSTRAINT client_type_check,
  ADD CONSTRAINT client_type_check CHECK (client_type IN ('web', 'windows', 'mobile', 'mac'));
