CREATE TABLE channels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id  UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  room_id    UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('text', 'voice')),
  position   INT  NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX channels_room_position_idx ON channels(room_id, position);
