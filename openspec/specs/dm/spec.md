# Spec: dm

## Capability

Server-scoped direct messages between pairs of identities.

---

### Requirement: start-conversation

`POST /api/v1/dm/conversations`

Auth required. `SendDirectMessages` permission required.

Request: `{ "recipient_id": string }`
Response (200 or 201):
```json
{ "id": string, "recipient": { "id": string, "username": string, "display_name": string }, "created_at": string }
```

- 200 if conversation already exists, 201 if newly created.
- Cannot start a conversation with yourself → 400 `{ "error": "invalid_recipient" }`.
- Recipient must exist on this server → 404 `{ "error": "recipient_not_found" }`.

#### Scenario: first DM to alice

GIVEN member bob and member alice (no prior conversation)
WHEN bob calls `POST /api/v1/dm/conversations` with alice's ID
THEN response is 201 with conversation id

#### Scenario: reopen existing conversation

GIVEN bob and alice already have a conversation
WHEN bob calls `POST /api/v1/dm/conversations` with alice's ID again
THEN response is 200 with the same conversation id

---

### Requirement: list-conversations

`GET /api/v1/dm/conversations`

Auth required. `SendDirectMessages` permission required.

Response (200): array of conversations with the other participant's info, ordered by most-recent
message (or creation time if no messages). Most recent first.

```json
[{ "id": string, "recipient": {...}, "last_message_at": string|null, "created_at": string }]
```

---

### Requirement: send-dm

`POST /api/v1/dm/conversations/{id}/messages`

Auth required. Caller must be a participant in the conversation.

Request: `{ "content": string (1-4000 chars), "attachment_id"?: string }`
Response (201): message object.

```json
{
  "id": string,
  "conversation_id": string,
  "sender": { "id": string, "username": string, "display_name": string },
  "content": string,
  "attachment": {...}|null,
  "created_at": string
}
```

Publishes `dm.created` to `events:{serverID}`.

#### Scenario: send DM

GIVEN bob and alice have a conversation
WHEN bob sends a DM
THEN response is 201
AND alice receives a `dm.created` WebSocket event

---

### Requirement: list-dms

`GET /api/v1/dm/conversations/{id}/messages?before={id}&limit={n}`

Auth required. Caller must be a participant.

Same pagination shape as channel messages: `{ "messages": [...], "has_more": bool }`.

---

### Requirement: delete-dm

`DELETE /api/v1/dm/conversations/{id}/messages/{msg_id}`

Auth required. Caller must be the message sender (no moderator override for DMs).

Response: 204. Soft-delete, publishes `dm.deleted`.

---

## Event Envelope

```json
{ "type": "dm.created",  "conversation_id": "...", "message": {...} }
{ "type": "dm.deleted",  "conversation_id": "...", "message_id": "..." }
```
