# Spec: rooms

## Capability

Room CRUD for server owners and admins, with list access for all authenticated identities.

---

### Requirement: create-room

`POST /api/v1/rooms` creates a room. Auth required. Owner or admin role required.

Request: `{ "name": string (1-100 chars), "description"?: string (max 500 chars) }`
Response (201): `{ "id": string, "name": string, "description": string|null, "position": int, "created_at": string }`

Position is auto-assigned as (max existing position + 1). First room gets position 0.

#### Scenario: admin creates room

GIVEN an authenticated identity with admin role
WHEN `POST /api/v1/rooms` is called with `{ "name": "General" }`
THEN response is 201 with a room object including id and position

#### Scenario: member is forbidden

GIVEN an authenticated identity with member role
WHEN `POST /api/v1/rooms` is called
THEN response is 403 with `{ "error": "forbidden" }`

---

### Requirement: list-rooms

`GET /api/v1/rooms` returns all rooms ordered by position. Auth required. All roles can call.

Response (200): array of room objects ordered by position ascending.

#### Scenario: member lists rooms

GIVEN a server with two rooms
WHEN member calls `GET /api/v1/rooms`
THEN response is 200 with both rooms in position order

---

### Requirement: get-room

`GET /api/v1/rooms/{id}` returns a single room. Auth required.

Response (200): room object.
Response (404): `{ "error": "room_not_found" }` if id does not exist on this server.

---

### Requirement: update-room

`PATCH /api/v1/rooms/{id}` updates name and/or description. Auth required. Owner or admin only.

Request: `{ "name"?: string, "description"?: string|null }`
Response (200): updated room object.

---

### Requirement: delete-room

`DELETE /api/v1/rooms/{id}` deletes the room and all its channels. Auth required. Owner or admin only.

Response: 204.

#### Scenario: cascade delete

GIVEN a room with two channels
WHEN owner calls `DELETE /api/v1/rooms/:id`
THEN response is 204
AND both channels no longer exist
