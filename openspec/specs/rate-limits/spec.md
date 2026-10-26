# Spec: rate-limits

## Behavior

### Scenario: Login brute-force blocked

GIVEN
- an IP address has made 5 POST /api/v1/auth/login requests in the current 60-second window

WHEN
- the same IP makes a 6th POST /api/v1/auth/login request

THEN
- response: 429 Too Many Requests
- response body: `{"error":"rate_limit_exceeded"}`
- response header: `Retry-After: 60`
- no authentication attempt performed

### Scenario: Login within limit

GIVEN
- an IP address has made 4 or fewer login attempts in the current window

WHEN
- the IP makes another POST /api/v1/auth/login request

THEN
- request proceeds normally (401 or 200 based on credentials)
- rate limit counter incremented

### Scenario: Message flood blocked

GIVEN
- an identity has sent 30 messages in the current 60-second window (across any channels)

WHEN
- the identity sends another POST .../messages request

THEN
- response: 429 Too Many Requests
- response body: `{"error":"rate_limit_exceeded"}`
- response header: `Retry-After: 60`
- message not persisted

### Scenario: Rate limits disabled

GIVEN
- RATE_DISABLED=true in environment

WHEN
- any endpoint receives more requests than the configured limit

THEN
- all requests proceed normally (no 429 responses)
- Redis not queried for rate limit purposes

### Scenario: Redis unavailable during rate limit check

GIVEN
- Redis is temporarily unreachable

WHEN
- a rate-limited endpoint receives a request

THEN
- request proceeds (fail-open: Redis error does not block the user)
- error logged at warn level

### Scenario: Registration spam blocked

GIVEN
- an IP has made 3 POST /api/v1/auth/register requests in 60s

WHEN
- the same IP makes a 4th registration request

THEN
- 429 Too Many Requests returned before any DB operation

### Scenario: Attachment upload spam blocked

GIVEN
- an identity has requested 10 upload URLs in 60s

WHEN
- the identity requests another upload URL

THEN
- 429 Too Many Requests
- no MinIO presigned URL generated

### Scenario: Invite creation spam blocked

GIVEN
- an identity has created 10 invites in 60s

WHEN
- the identity attempts to create another invite

THEN
- 429 Too Many Requests

### Scenario: DM flood blocked

GIVEN
- an identity has sent 30 DMs in 60s

WHEN
- the identity sends another DM

THEN
- 429 Too Many Requests
