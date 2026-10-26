# Spec: admin

## Capability

Admin API for identity and role management. All endpoints require owner or admin role.

---

### Requirement: list-identities

`GET /api/v1/admin/identities` returns all identities on the server with their roles.

Response (200):
```json
[
  {
    "id": string,
    "username": string,
    "display_name": string,
    "email": string | null,
    "is_disabled": bool,
    "roles": [string]
  }
]
```

#### Scenario: admin lists identities

GIVEN an authenticated identity with admin role
WHEN `GET /api/v1/admin/identities` is called
THEN response is 200 with all server identities and their role names

#### Scenario: member is forbidden

GIVEN an authenticated identity with member role only
WHEN `GET /api/v1/admin/identities` is called
THEN response is 403 with `{ "error": "forbidden" }`

---

### Requirement: assign-role

`POST /api/v1/admin/identities/:id/roles` assigns a system role to an identity.

Request: `{ "role": string }`
Response: 204 on success.

Constraints:
- Role must be one of: owner, admin, moderator, member, guest
- Admin cannot assign the "owner" role (owner-only operation)
- Assigning an already-held role is idempotent (204, no error)

#### Scenario: admin assigns moderator role

GIVEN an identity "alice" with member role
WHEN `POST /api/v1/admin/identities/:alice_id/roles` with `{ "role": "moderator" }` by an admin
THEN response is 204
AND alice's roles include "moderator"

#### Scenario: admin cannot assign owner role

GIVEN an authenticated identity with admin role
WHEN `POST /api/v1/admin/identities/:id/roles` with `{ "role": "owner" }`
THEN response is 403 with `{ "error": "forbidden" }`

#### Scenario: unknown role rejected

GIVEN `{ "role": "superuser" }`
WHEN `POST /api/v1/admin/identities/:id/roles` is called
THEN response is 400 with `{ "error": "invalid_role" }`

---

### Requirement: revoke-role

`DELETE /api/v1/admin/identities/:id/roles/:role` removes a role from an identity.

Response: 204 on success. Revoking a role not held is idempotent.

Constraints:
- Admin cannot revoke the "owner" role from any identity
- Owner cannot have their owner role revoked via this API (requires manual DB operation)

#### Scenario: admin revokes moderator role

GIVEN "alice" has roles ["member", "moderator"]
WHEN `DELETE /api/v1/admin/identities/:alice_id/roles/moderator` by admin
THEN response is 204
AND alice's roles no longer include "moderator"

#### Scenario: admin cannot revoke owner role

GIVEN admin calls `DELETE /api/v1/admin/identities/:id/roles/owner`
THEN response is 403 with `{ "error": "forbidden" }`

---

### Requirement: disable-identity

`POST /api/v1/admin/identities/:id/disable` sets `is_disabled = true`.

Response: 204.

Constraints:
- An owner cannot be disabled via this endpoint
- A caller cannot disable their own account

#### Scenario: admin disables a member

GIVEN "bob" with member role and is_disabled = false
WHEN admin calls `POST /api/v1/admin/identities/:bob_id/disable`
THEN response is 204
AND bob can no longer log in (auth returns 403 account_disabled)
AND bob's active sessions are deleted

#### Scenario: owner identity cannot be disabled

GIVEN the server owner identity
WHEN `POST /api/v1/admin/identities/:owner_id/disable` is called
THEN response is 403 with `{ "error": "forbidden" }`

---

### Requirement: enable-identity

`POST /api/v1/admin/identities/:id/enable` sets `is_disabled = false`.

Response: 204.

#### Scenario: admin re-enables a disabled identity

GIVEN "bob" with is_disabled = true
WHEN admin calls `POST /api/v1/admin/identities/:bob_id/enable`
THEN response is 204
AND bob can log in again
