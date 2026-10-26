ALTER TABLE messages
  ADD COLUMN attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL;
