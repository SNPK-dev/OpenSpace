# Spec: voice

## Capability

Application-level voice room presence and state management.

---

### Requirement: join-voice-room

`POST /api/v1/rtc/rooms/{channel_id}/join`

Auth required. `JoinVoice` permission required. Channel must be type 'voice'.

Response (200):
```json
{
  "participant": { "id": "...", "username": "...", "display_name": "...", "muted": false, "deafened": false, "camera_enabled": false, "screen_sharing": false },
  "participants": [ ... ]
}
```

Publishes `voice.joined` to `events:{serverID}`.

If already joined, updates the record (idempotent) and returns current state.

#### Scenario: member joins voice channel

GIVEN voice channel exists
WHEN member calls POST join
THEN response 200; all clients receive voice.joined event

#### Scenario: text channel rejected

GIVEN text channel
WHEN caller joins it
THEN 400 not_a_voice_channel

---

### Requirement: leave-voice-room

`POST /api/v1/rtc/rooms/{channel_id}/leave`

Auth required. `JoinVoice` permission required.

Response: 204. Idempotent (leaving when not joined is a no-op).

Publishes `voice.left` to `events:{serverID}`.

---

### Requirement: heartbeat

`POST /api/v1/rtc/rooms/{channel_id}/heartbeat`

Auth required. JoinVoice permission required. Caller must have joined the room.

Response: 204. Resets the 90s heartbeat TTL for this participant. Participants that stop
heartbeating are evicted by the server-side reaper after ≤120s.

Client responsibility: call every 20–25 seconds.

---

### Requirement: update-voice-state

`PATCH /api/v1/rtc/rooms/{channel_id}/state`

Auth required. `JoinVoice` permission required. Caller must have joined the room.

Request:
```json
{ "muted": true, "deafened": false, "camera_enabled": true, "screen_sharing": true }
```
All fields optional. Only provided fields are updated.

Response (200): updated participant object.

Publishes `voice.state_changed`.

#### Scenario: mute self

WHEN member PATCHes muted: true
THEN voice.state_changed event sent; participant.muted = true for all clients

---

### Requirement: list-voice-participants

`GET /api/v1/rtc/rooms/{channel_id}/participants`

Auth required. `JoinVoice` permission required.

Response (200):
```json
{ "participants": [ { "id": "...", "username": "...", "display_name": "...", "muted": false, "deafened": false, "camera_enabled": false, "screen_sharing": false } ] }
```

Returns current participants from Redis. Empty array if no one is in the room.

---

## Event Envelope

```json
{ "type": "voice.joined",        "channel_id": "...", "participant": {...} }
{ "type": "voice.left",          "channel_id": "...", "identity_id": "..." }
{ "type": "voice.state_changed", "channel_id": "...", "participant": {...} }
```

`voice.left` is emitted both on explicit leave and on reaper eviction.

---

## Error Codes

| Code               | Status | Meaning                                 |
|--------------------|---------|-----------------------------------------|
| not_a_voice_channel| 400    | Channel is text type                    |
| channel_not_found  | 404    | Channel not found on this server        |
| not_in_room        | 400    | State update / heartbeat but not joined |
| forbidden          | 403    | Missing JoinVoice                       |
