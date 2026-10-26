CREATE TABLE friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES server_identities(id) ON DELETE CASCADE,
    addressee_id UUID NOT NULL REFERENCES server_identities(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (requester_id <> addressee_id)
);

CREATE UNIQUE INDEX friendships_pair_unique ON friendships (
    server_id,
    LEAST(requester_id, addressee_id),
    GREATEST(requester_id, addressee_id)
);
CREATE INDEX friendships_requester_idx ON friendships(server_id, requester_id, status);
CREATE INDEX friendships_addressee_idx ON friendships(server_id, addressee_id, status);
CREATE INDEX server_identities_member_search_idx ON server_identities(server_id, LOWER(username));
