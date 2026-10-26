# Spec: rtc (extended)

## Capability (extension of rtc-signaling-v1)

Self-hosted STUN/TURN credential issuance and LiveKit token generation. No external ICE providers.

---

### Requirement: issue-token

`POST /api/v1/rtc/token`

Auth required. `JoinVoice` permission required. Channel must be type 'voice'.

Request:
```json
{ "channel_id": "uuid", "sources": ["camera","microphone","screen_share"] }
```
`sources` is optional. When omitted, defaults to `["camera","microphone","screen_share"]`.

Response (200):
```json
{ "token": "<LiveKit JWT>", "url": "ws://..." }
```

The JWT `video.canPublishSources` claim is set to the resolved sources array.

#### Scenario: token with restricted sources

GIVEN member identity
WHEN member requests token with `sources: ["microphone"]`
THEN JWT canPublishSources is `["microphone"]`

---

### Requirement: ice-servers

`GET /api/v1/rtc/ice-servers`

Auth required. `JoinVoice` permission required.

Response (200):
```json
{
  "ice_servers": [
    {
      "urls": ["stun:HOST:PORT"]
    },
    {
      "urls": [
        "turn:HOST:PORT?transport=udp",
        "turn:HOST:PORT?transport=tcp"
      ],
      "username": "EXPIRY_UNIX:IDENTITY_ID",
      "credential": "BASE64_HMAC_SHA1"
    }
  ]
}
```

- `HOST` and `PORT` are the operator-configured coturn address (`TURN_HOST`, `TURN_PORT`).
- Credentials use coturn's REST API format: `username = <expiry_unix>:<identity_id>`,
  `credential = base64(HMAC-SHA1(TURN_SECRET, username))`.
- Credential TTL: 24 hours.
- No external STUN/TURN servers. Only the operator's coturn.

#### Scenario: member gets ICE config

GIVEN member identity
WHEN member calls GET /api/v1/rtc/ice-servers
THEN response is 200 with stun and turn entries
AND credential is valid HMAC-SHA1 with coturn shared secret

#### Scenario: guest cannot get ICE config

GIVEN identity with guest role (no JoinVoice)
WHEN guest calls GET /api/v1/rtc/ice-servers
THEN response is 403

---

---

### Requirement: stats

`GET /api/v1/rtc/stats`

Auth required. ManageServer permission required.

Response (200):
```json
{
  "voice_rooms_active": 3,
  "voice_participants_total": 12,
  "counters": {
    "tokens_issued": 45,
    "ice_served": 45,
    "voice_joins": 30,
    "voice_leaves": 25,
    "voice_heartbeats": 480,
    "voice_evictions": 3
  }
}
```

Counters reset on server restart. Live room stats are read from Redis; if Redis is
unavailable they return 0 (not an error response).

---

## Error Codes (extension)

| Code      | Status | Meaning                                       |
|-----------|--------|-----------------------------------------------|
| forbidden | 403    | Caller lacks required permission              |
