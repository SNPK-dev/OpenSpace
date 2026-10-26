# Spec: presence

## Capability

Server-scoped online presence via Redis sets. Gateway maintains the set; server-api reads it.

---

### Requirement: presence-set

Redis key: `online:{serverID}` — a Set of identity IDs currently connected via WebSocket.

- `SADD online:{serverID} {identityID}` on connect
- `SREM online:{serverID} {identityID}` on disconnect

No TTL on the set; it is authoritative while the gateway runs. On gateway restart the set is
cleared (gateway deletes `online:{serverID}` on startup).

---

### Requirement: list-online

`GET /api/v1/presence` returns all currently online identity IDs for the server.
Auth required. All roles can call.

Response (200):
```json
{ "online": ["uuid1", "uuid2"] }
```

Returns empty array `[]` if no one is online or Redis key does not exist.

#### Scenario: two clients connected

GIVEN identities A and B are both connected via WebSocket
WHEN `GET /api/v1/presence` is called
THEN response is 200 with both identity IDs in the `online` array

#### Scenario: no one connected

GIVEN no active WebSocket connections
WHEN `GET /api/v1/presence` is called
THEN response is 200 with `{ "online": [] }`

---

### Requirement: presence-events

When an identity connects, `presence.joined` is published to `events:{serverID}`.
When they disconnect, `presence.left` is published.

Both events are relayed to all other connected clients by the gateway's event loop.
The connecting client does NOT receive their own `presence.joined`.
