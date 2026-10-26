# Spec: bootstrap

## Capability

Server bootstrap flow: first-run detection, superadmin creation, session issuance.

---

### Requirement: health-check

`GET /healthz` must return HTTP 200 with a JSON body at all times after startup.

Response shape:
```json
{ "status": "ok", "bootstrapped": <bool> }
```

#### Scenario: server running before bootstrap

GIVEN the server has started and migrations have run  
WHEN `GET /healthz` is called  
THEN response is 200 with `{ "status": "ok", "bootstrapped": false }`

#### Scenario: server running after bootstrap

GIVEN the server has been bootstrapped  
WHEN `GET /healthz` is called  
THEN response is 200 with `{ "status": "ok", "bootstrapped": true }`

---

### Requirement: bootstrap-status

`GET /api/v1/bootstrap/status` returns bootstrap state without side effects.

Response shape:
```json
{ "bootstrapped": <bool> }
```

#### Scenario: unbootstrapped server

GIVEN no server record exists in the database  
WHEN `GET /api/v1/bootstrap/status` is called  
THEN response is 200 with `{ "bootstrapped": false }`

#### Scenario: already bootstrapped server

GIVEN a server record and at least one identity with owner role exist  
WHEN `GET /api/v1/bootstrap/status` is called  
THEN response is 200 with `{ "bootstrapped": true }`

---

### Requirement: bootstrap-create

`POST /api/v1/bootstrap` creates the server record, seed roles, owner identity, and session.

Request body:
```json
{
  "server_name": <string, 1–100 chars>,
  "admin_username": <string, 1–50 chars, alphanumeric + underscore>,
  "admin_email": <string, valid email or empty>,
  "admin_password": <string, min 8 chars>
}
```

Success response (201):
```json
{
  "server_id": <uuid>,
  "identity_id": <uuid>,
  "token": <string>
}
```

#### Scenario: successful bootstrap

GIVEN server is unbootstrapped  
WHEN `POST /api/v1/bootstrap` is called with valid input  
THEN response is 201 with server_id, identity_id, and session token  
AND the database contains: one servers row, one server_identities row, five roles rows, one role_assignments row for owner, one sessions row  
AND calling `GET /api/v1/bootstrap/status` returns `{ "bootstrapped": true }`

#### Scenario: already bootstrapped

GIVEN server has already been bootstrapped  
WHEN `POST /api/v1/bootstrap` is called again  
THEN response is 409 with error body `{ "error": "already_bootstrapped" }`

#### Scenario: invalid input — missing server_name

GIVEN server is unbootstrapped  
WHEN `POST /api/v1/bootstrap` is called with empty `server_name`  
THEN response is 400 with error body `{ "error": "validation_error", "field": "server_name" }`

#### Scenario: invalid input — password too short

GIVEN server is unbootstrapped  
WHEN `POST /api/v1/bootstrap` is called with `admin_password` shorter than 8 characters  
THEN response is 400 with error body `{ "error": "validation_error", "field": "admin_password" }`

---

### Requirement: migrations

On server startup, the migration runner must:
- Create `schema_migrations` table if absent.
- Apply any unapplied migrations in numeric order (001, 002, ...).
- Be idempotent: a migration applied previously is never re-applied.
- Fail startup with a logged error if a migration fails.

#### Scenario: clean database

GIVEN a fresh PostgreSQL database with no tables  
WHEN server-api starts  
THEN all SQL migrations are applied and server starts accepting requests

#### Scenario: partial migrations already applied

GIVEN migration 001 was applied in a previous run  
WHEN server-api starts again  
THEN only migrations 002 and above are applied; 001 is skipped

---

### Requirement: seed-roles

Bootstrap must create five system roles in the `roles` table:
`owner`, `admin`, `moderator`, `member`, `guest`.

These roles are created as part of the servers/settings transaction.

#### Scenario: seed roles present after bootstrap

GIVEN successful bootstrap  
WHEN querying the roles table  
THEN exactly five rows exist: owner, admin, moderator, member, guest with `is_system_role = true`
