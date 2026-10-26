# Spec: messages

## Capability

Text message send, list, and delete within a text channel.

---

### Requirement: send-message

`POST /api/v1/rooms/{room_id}/channels/{channel_id}/messages`

Auth required. `SendMessages` permission required (member+).
Channel must be type `text`.

Request: `{ "content": string (1-4000 chars) }`
Response (201):
```json
{
  "id": string,
  "channel_id": string,
  "sender": { "id": string, "username": string, "display_name": string },
  "content": string,
  "created_at": string
}
```

#### Scenario: member sends message

GIVEN an authenticated member in a text channel
WHEN `POST .../messages` with valid content
THEN response is 201 with the message object
AND a `message.created` event is published (received by WebSocket clients)

#### Scenario: voice channel rejected

GIVEN a voice channel
WHEN `POST .../messages` is called
THEN response is 400 with `{ "error": "not_a_text_channel" }`

#### Scenario: guest cannot send

GIVEN an identity with guest role only
WHEN `POST .../messages` is called
THEN response is 403 with `{ "error": "forbidden" }`

#### Scenario: content too long

GIVEN content with 4001 characters
WHEN `POST .../messages` is called
THEN response is 400 with `{ "error": "validation_error", "field": "content" }`

---

### Requirement: list-messages

`GET /api/v1/rooms/{room_id}/channels/{channel_id}/messages?before={id}&limit={n}`

Auth required. `ReadMessages` permission required (guest+).

Query params:
- `before` (optional): message ID; returns messages older than this message
- `limit` (optional): 1–100, default 50

Response (200):
```json
{
  "messages": [...],
  "has_more": bool
}
```

Messages ordered newest-first. `has_more` indicates whether older messages exist.

#### Scenario: list first page

GIVEN a channel with 60 messages
WHEN `GET .../messages?limit=50` (no before)
THEN response has 50 newest messages and `"has_more": true`

#### Scenario: list next page

GIVEN the cursor from the first page (oldest message ID in the batch)
WHEN `GET .../messages?before={id}&limit=50`
THEN response has the next 10 messages (older) and `"has_more": false`

#### Scenario: deleted messages excluded

GIVEN a channel where message X has been deleted
WHEN `GET .../messages` is called
THEN message X is not present in the response

---

### Requirement: delete-message

`DELETE /api/v1/rooms/{room_id}/channels/{channel_id}/messages/{id}`

Auth required.
- Own message: `SendMessages` permission sufficient (any member+)
- Other's message: `ModerateMessages` permission required (moderator+)

Response: 204.

#### Scenario: member deletes own message

GIVEN member "alice" who sent message X
WHEN alice calls `DELETE .../messages/X`
THEN response is 204
AND message X is soft-deleted
AND `message.deleted` event is published

#### Scenario: member cannot delete other's message

GIVEN member "bob" tries to delete alice's message
WHEN `DELETE .../messages/alice_message_id` by bob
THEN response is 403 with `{ "error": "forbidden" }`

#### Scenario: moderator deletes any message

GIVEN moderator "charlie" and alice's message X
WHEN charlie calls `DELETE .../messages/X`
THEN response is 204

---

## Event Envelope

Events published to `events:{serverID}` Redis channel:

```json
{
  "type": "message.created",
  "channel_id": "...",
  "message": { "id": "...", "channel_id": "...", "sender": {...}, "content": "...", "created_at": "..." }
}

{
  "type": "message.deleted",
  "channel_id": "...",
  "message_id": "..."
}
```
