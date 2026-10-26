CREATE TABLE servers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE server_settings (
  server_id  UUID PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT 'OpenSpace',
  public_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
