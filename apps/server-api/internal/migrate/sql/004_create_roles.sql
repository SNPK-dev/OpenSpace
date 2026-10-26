CREATE TABLE roles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id      UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  is_system_role BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(server_id, name)
);

CREATE TABLE role_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id   UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  identity_id UUID NOT NULL REFERENCES server_identities(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(server_id, identity_id, role_id)
);

CREATE INDEX role_assignments_identity_idx ON role_assignments(identity_id);
