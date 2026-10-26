# Spec: search

## Capability

Full-text search across channel messages and DMs within a server.

---

### Requirement: search-messages

`GET /api/v1/search/messages?q=<text>&channel_id=<uuid>&before=<uuid>&limit=<n>`

Auth required. `ReadMessages` permission required.

- `q` (required): search text, minimum 2 characters.
- `channel_id` (optional): restrict results to a specific channel.
- `before` (optional): cursor — return results older than the message with this ID.
- `limit` (optional): 1–100, default 50.

Response (200):
```json
{
  "results": [
    {
      "id": "string",
      "channel_id": "string",
      "channel_name": "string",
      "sender": { "id": "string", "username": "string", "display_name": "string" },
      "content": "string",
      "created_at": "string"
    }
  ],
  "has_more": true
}
```

Results ordered by `created_at DESC` (most recent first).
Deleted messages are excluded.

#### Scenario: basic text search

GIVEN server has messages containing "hello world"
WHEN member calls `GET /api/v1/search/messages?q=hello`
THEN response is 200 with matching messages

#### Scenario: channel filter

GIVEN messages across multiple channels
WHEN caller includes `channel_id=<uuid>`
THEN only messages from that channel are returned

#### Scenario: empty query

WHEN caller sends `q=a` (less than 2 characters)
THEN response is 400 `{ "error": "invalid_query" }`

#### Scenario: guest can search messages

GIVEN identity with guest role (ReadMessages but not SendMessages)
WHEN guest calls `GET /api/v1/search/messages?q=hello`
THEN response is 200

---

### Requirement: search-dms

`GET /api/v1/search/dm?q=<text>&conversation_id=<uuid>&before=<uuid>&limit=<n>`

Auth required. `SendDirectMessages` permission required (members and above; guests cannot DM).

- `q` (required): search text, minimum 2 characters.
- `conversation_id` (optional): restrict to a specific DM conversation.
- `before` / `limit`: same as message search.

Response (200):
```json
{
  "results": [
    {
      "id": "string",
      "conversation_id": "string",
      "sender": { "id": "string", "username": "string", "display_name": "string" },
      "content": "string",
      "created_at": "string"
    }
  ],
  "has_more": true
}
```

Only returns DMs from conversations the caller participates in.
Deleted messages are excluded.

#### Scenario: DM search scoped to participant

GIVEN alice and bob have a conversation with "deploy failed" message
GIVEN charlie is not in that conversation
WHEN alice searches `q=deploy`
THEN alice gets the result
WHEN charlie searches `q=deploy`
THEN charlie gets no results for that conversation

#### Scenario: conversation filter

GIVEN caller is in multiple DM conversations
WHEN caller includes `conversation_id=<uuid>`
THEN only DMs from that conversation are returned

---

## Error Codes

| Code            | Status | Meaning                         |
|-----------------|--------|---------------------------------|
| invalid_query   | 400    | Query is too short (< 2 chars)  |
| forbidden       | 403    | Missing required permission     |
