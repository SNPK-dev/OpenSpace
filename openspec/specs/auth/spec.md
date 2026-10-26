# Spec: auth

## Capability

Server-scoped identity auth lifecycle: login, logout, register, profile, invites.

---

### Requirement: login

`POST /api/v1/auth/login` authenticates an identity and returns a session token.

Request: `{ "username": string, "password": string }`
Success (200): `{ "token": string, "identity_id": string }`

#### Scenario: valid credentials

GIVEN a bootstrapped server with an owner identity  
WHEN `POST /api/v1/auth/login` is called with correct username and password  
THEN response is 200 with a token and identity_id  
AND the token is usable on auth-protected endpoints

#### Scenario: wrong password

GIVEN a bootstrapped server  
WHEN `POST /api/v1/auth/login` is called with wrong password  
THEN response is 401 with `{ "error": "invalid_credentials" }`

#### Scenario: unknown username

GIVEN a bootstrapped server  
WHEN `POST /api/v1/auth/login` is called with a username that does not exist  
THEN response is 401 with `{ "error": "invalid_credentials" }`  
AND timing is indistinguishable from wrong password (constant-time comparison)

#### Scenario: disabled identity

GIVEN an identity with `is_disabled = true`  
WHEN `POST /api/v1/auth/login` is called with that identity's credentials  
THEN response is 403 with `{ "error": "account_disabled" }`

---

### Requirement: logout

`POST /api/v1/auth/logout` revokes the current session. Auth required.

#### Scenario: valid token logout

GIVEN an authenticated session  
WHEN `POST /api/v1/auth/logout` is called with the session token  
THEN response is 204  
AND subsequent requests with that token return 401

---

### Requirement: register

`POST /api/v1/auth/register` creates an identity using a valid invite code and returns a session.

Request: `{ "invite_code": string, "username": string, "email"?: string, "password": string }`
Success (201): `{ "token": string, "identity_id": string }`

#### Scenario: valid invite registration

GIVEN a valid unused invite code  
WHEN `POST /api/v1/auth/register` is called with the code and valid credentials  
THEN response is 201 with token and identity_id  
AND the invite use_count is incremented  
AND the new identity has the "member" role

#### Scenario: expired invite

GIVEN an invite with expires_at in the past  
WHEN `POST /api/v1/auth/register` is called  
THEN response is 400 with `{ "error": "invite_expired" }`

#### Scenario: exhausted invite

GIVEN an invite where use_count == max_uses  
WHEN `POST /api/v1/auth/register` is called  
THEN response is 400 with `{ "error": "invite_exhausted" }`

#### Scenario: duplicate username

GIVEN an existing identity with username "alice"  
WHEN `POST /api/v1/auth/register` is called with username "alice"  
THEN response is 409 with `{ "error": "username_taken" }`

---

### Requirement: auth-middleware

All routes decorated with auth middleware must reject requests without a valid Bearer token.

#### Scenario: missing token

GIVEN a protected route  
WHEN called without Authorization header  
THEN response is 401 with `{ "error": "unauthorized" }`

#### Scenario: expired session

GIVEN a session whose expires_at is in the past  
WHEN called with that session's token  
THEN response is 401 with `{ "error": "unauthorized" }`

---

### Requirement: me-read

`GET /api/v1/me` returns the current identity's profile. Auth required.

Response (200):
```json
{ "id": string, "username": string, "display_name": string, "email": string|null, "roles": [string] }
```

#### Scenario: authenticated request

GIVEN a valid session token  
WHEN `GET /api/v1/me` is called  
THEN response is 200 with the identity's profile and role names

---

### Requirement: me-update

`PATCH /api/v1/me` updates the current identity's display_name. Auth required.

Request: `{ "display_name"?: string }`
Response (200): updated profile (same shape as GET /me)

#### Scenario: update display_name

GIVEN an authenticated identity  
WHEN `PATCH /api/v1/me` is called with `{ "display_name": "Alice" }`  
THEN response is 200 with the updated profile  
AND subsequent `GET /api/v1/me` returns the new display_name

---

### Requirement: invites

`POST /api/v1/invites` creates an invite. Auth required. Owner or admin role required.

Request: `{ "max_uses"?: int (default 1), "expires_in_hours"?: int }`
Response (201): `{ "code": string, "expires_at": string|null }`

#### Scenario: admin creates invite

GIVEN an authenticated identity with admin role  
WHEN `POST /api/v1/invites` is called  
THEN response is 201 with an invite code  
AND the invite can be used at `POST /api/v1/auth/register`

#### Scenario: member tries to create invite

GIVEN an authenticated identity with member role only  
WHEN `POST /api/v1/invites` is called  
THEN response is 403 with `{ "error": "forbidden" }`

---

### Requirement: device-registration-v2

`POST /api/auth/device-registration/challenge` + `POST /api/auth/device-registration/complete`

Replaces password-based registration with a per-device keypair proof-of-possession flow.

#### Scenario: open registration — device keypair

GIVEN a server with registration_policy = open  
WHEN challenge is called with device_public_key, display_name, client_type  
THEN response is 200 with challenge_id and nonce  
WHEN complete is called with challenge_id and ECDSA P-256 signature over nonce  
THEN response is 201 with server_identity_id, device_id, connection_state = joined, access_token  
AND device_credentials row is created on the server (public_key stored, private_key not stored)

#### Scenario: invalid signature

GIVEN a registration challenge  
WHEN complete is called with an incorrect signature  
THEN response is 400 with error = invalid_signature  
AND no identity or credential is created

#### Scenario: approval_required policy

GIVEN a server with registration_policy = approval_required  
WHEN complete is called with a valid signature  
THEN response is 201 with connection_state = pending_approval AND access_token = null  
AND device_credential is created with device_status = pending

---

### Requirement: device-pairing-tokens

`POST /api/devices/pairing-token` creates a one-time pairing token. Auth required.

#### Scenario: create pairing token

GIVEN an authenticated identity  
WHEN POST /api/devices/pairing-token is called with ttl_seconds = 1800  
THEN response is 201 with pairing_token (plaintext, returned once) and expires_at  
AND server stores only hash(pairing_token)

---

### Requirement: redeem-pairing-token

`POST /api/devices/redeem/challenge` + `POST /api/devices/redeem/complete`

#### Scenario: valid redeem

GIVEN a valid pairing_token and a new device keypair  
WHEN redeem/challenge is called with pairing_token + new_device_public_key  
THEN response is 200 with challenge_id and nonce  
WHEN redeem/complete is called with valid signature  
THEN response is 201 with server_identity_id, device_id, access_token  
AND the pairing_token is marked used (one-time)

#### Scenario: already-used token

GIVEN a pairing_token that was already redeemed  
WHEN redeem/challenge is called  
THEN response is 400 with error = token_already_used

---

### Requirement: relay-transfers

`POST /api/relay/transfers` + `GET /api/relay/transfers/{id}`

#### Scenario: one-time download

GIVEN a transfer_id for an unexpired, unused bundle  
WHEN GET /api/relay/transfers/{id} is called  
THEN response is 200 with encrypted_bundle  
AND subsequent calls return 404 transfer_already_used  
AND decrypt_key is never stored on the relay
