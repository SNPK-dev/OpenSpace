CREATE INDEX messages_content_fts_idx
    ON messages USING GIN(to_tsvector('english', content));

CREATE INDEX dm_content_fts_idx
    ON direct_messages USING GIN(to_tsvector('english', content));
