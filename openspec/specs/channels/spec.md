# Spec: channels

## Capability

Channel CRUD within a room for owners/admins, with list access for all authenticated identities.

---

### Requirement: create-channel

`POST /api/v1/rooms/{room_id}/channels` creates a channel. Auth required. Owner or admin only.

Request: `{ "name": string (1-100 chars), "type": "text"|"voice" }`
Response (201): `{ "id": string, "room_id": string, "name": string, "type": string, "position": int, "created_at": string }`

Position auto-assigned as max existing position + 1 within the room. First channel gets 0.

#### Scenario: admin creates text channel

GIVEN a room "General"
WHEN admin calls `POST /api/v1/rooms/:room_id/channels` with `{ "name": "chat", "type": "text" }`
THEN response is 201 with channel object

#### Scenario: invalid type rejected

GIVEN `{ "name": "x", "type": "screen-share" }`
WHEN `POST /api/v1/rooms/:room_id/channels` is called
THEN response is 400 with `{ "error": "invalid_channel_type" }`

#### Scenario: room not found

GIVEN a non-existent room_id
WHEN `POST /api/v1/rooms/:room_id/channels` is called
THEN response is 404 with `{ "error": "room_not_found" }`

---

### Requirement: list-channels

`GET /api/v1/rooms/{room_id}/channels` returns channels in position order. Auth required. All roles.

Response (200): array ordered by position ascending.

---

### Requirement: get-channel

`GET /api/v1/rooms/{room_id}/channels/{id}` returns a single channel. Auth required.

Response (404): `{ "error": "channel_not_found" }` if not found within this room+server.

---

### Requirement: update-channel

`PATCH /api/v1/rooms/{room_id}/channels/{id}` updates channel name. Auth required. Owner or admin.

Request: `{ "name"?: string }`
Response (200): updated channel object.

---

### Requirement: delete-channel

`DELETE /api/v1/rooms/{room_id}/channels/{id}` deletes the channel. Auth required. Owner or admin.

Response: 204.

---

### Requirement: reorder-channels

`PUT /api/v1/rooms/{room_id}/channels/order` sets explicit ordering for all channels in a room.
Auth required. Owner or admin.

Request: `{ "order": [string] }` — array of channel IDs in desired position order.

Response (200): array of all channels in new order.

Constraints:
- `order` must contain exactly all channel IDs in the room (no partial reorder).
- Missing or extra IDs → 400 `{ "error": "invalid_order" }`

#### Scenario: reorder two channels

GIVEN channels [A(pos=0), B(pos=1)]
WHEN admin calls PUT with `{ "order": ["B_id", "A_id"] }`
THEN response is 200 with [B(pos=0), A(pos=1)]
