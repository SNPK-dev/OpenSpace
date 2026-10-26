ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS room_type TEXT NOT NULL DEFAULT 'text'
    CHECK (room_type IN ('text', 'voice'));
