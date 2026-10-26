CREATE TABLE permission_settings (
  action     TEXT PRIMARY KEY,
  roles      TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

