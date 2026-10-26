# Spec: audit-logs

## Behavior

### Scenario: Login emits audit event

GIVEN a valid login request (correct credentials)

WHEN POST /api/v1/auth/login succeeds

THEN an `auth.login` row is written to audit_log with actor_id=identity_id, meta containing IP

### Scenario: Failed login emits audit event

GIVEN an invalid login request (wrong password or unknown username)

WHEN POST /api/v1/auth/login returns 401

THEN an `auth.login_failed` row is written to audit_log with actor_id="", meta containing IP and attempted username

### Scenario: Role assignment audited

GIVEN an admin assigns a role to another identity

WHEN POST /api/v1/admin/identities/{id}/roles succeeds

THEN a `role.assign` row written: actor_id=caller_id, target_id=target_id, meta={role:"..."}

### Scenario: Identity disabled audited

GIVEN an admin disables an identity

WHEN POST /api/v1/admin/identities/{id}/disable succeeds

THEN an `identity.disable` row written: actor_id=caller_id, target_id=target_id

### Scenario: Server bootstrap audited

GIVEN a fresh server bootstrap

WHEN POST /api/v1/bootstrap succeeds

THEN a `server.bootstrap` row written: actor_id=identity_id, target_id=server_id, target_type="server"

### Scenario: Admin views audit log

GIVEN admin authenticated

WHEN GET /api/v1/admin/audit?limit=50

THEN 200 with JSON array of audit_log rows, ordered by created_at DESC, max 50

### Scenario: Audit log paginated

GIVEN audit log has >50 entries

WHEN GET /api/v1/admin/audit?limit=50&before=<id>

THEN entries with id < before returned, newest first

### Scenario: Audit write failure does not block request

GIVEN the audit DB write fails (e.g. table missing)

WHEN any audited action completes

THEN the primary response (200/201/204) is returned normally; audit failure is logged at warn level

### Scenario: Non-admin cannot access audit log

GIVEN a non-admin authenticated user

WHEN GET /api/v1/admin/audit

THEN 403 Forbidden
