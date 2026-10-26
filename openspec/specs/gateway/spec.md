# Spec: gateway

## Capability

WebSocket connection gateway. Authenticates connections, manages a hub of live clients,
distributes Redis-published events to connected clients.

---

### Requirement: connect

`GET ws://{gateway}/ws?token={session_token}` upgrades to WebSocket.

On upgrade:
1. Token validated against `sessions` JOIN `server_identities` (same query as auth middleware).
2. `is_disabled` identities are rejected.
3. Client registered in hub under their serverID.
4. `presence.joined` event published to `events:{serverID}` Redis channel.
5. Client starts receiving all events on `events:{serverID}`.

#### Scenario: valid token connects

GIVEN a valid non-expired session token
WHEN `GET /ws?token={token}` is called
THEN connection upgrades to WebSocket
AND client receives events broadcast to their serverID channel

#### Scenario: invalid token rejected

GIVEN an invalid or expired token
WHEN `GET /ws?token={bad_token}` is called
THEN connection is closed immediately with message `{"error":"unauthorized"}`

#### Scenario: disabled identity rejected

GIVEN an identity with is_disabled = true
WHEN `GET /ws?token={their_token}` is called
THEN connection is closed with `{"error":"unauthorized"}`

---

### Requirement: keepalive

Client sends `{"type":"ping"}` JSON frame. Gateway responds `{"type":"pong"}`.

Gateway also sends WebSocket ping frames every 30 seconds. If no pong received within
10 seconds, connection is closed and presence is cleaned up.

#### Scenario: client sends ping

WHEN client sends `{"type":"ping"}`
THEN gateway responds `{"type":"pong"}`

---

### Requirement: disconnect

On client disconnect (clean or timeout):
1. Client unregistered from hub.
2. `SREM online:{serverID} {identityID}` in Redis.
3. `presence.left` event published.

---

### Requirement: event-relay

Events published to `events:{serverID}` (Redis pub/sub) are relayed as-is (JSON string)
to all connected clients in that serverID.

#### Scenario: server-api publishes an event

WHEN server-api calls `PUBLISH events:{serverID} {"type":"message.created","payload":{...}}`
THEN all WebSocket clients connected under that serverID receive the JSON string

---

### Requirement: gateway-healthz

`GET /healthz` returns `{"status":"ok"}`. Used by docker-compose healthcheck.

---

## Event Envelope

All events sent to clients are JSON with at minimum `"type"` string field:

```json
{ "type": "presence.joined", "identity_id": "..." }
{ "type": "presence.left",   "identity_id": "..." }
{ "type": "pong" }
```

Events from server-api are forwarded verbatim (already enveloped by the publisher).
