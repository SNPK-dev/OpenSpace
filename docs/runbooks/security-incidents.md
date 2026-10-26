# Runbook: Security Incidents

Incident response procedures for OpenSpace server operators.

---

## Step 1: Identify the Incident

### Check the audit log for suspicious activity

```bash
# Via API (admin token required):
curl -H "Authorization: Bearer <admin_token>" \
  "http://localhost:8080/api/v1/admin/audit?limit=100"

# Via psql (no auth required, direct DB access):
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
SELECT created_at, actor_id, action, target_id, meta
FROM audit_log
ORDER BY created_at DESC
LIMIT 50;"
```

### Detect brute-force login attempts

```bash
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
SELECT meta->>'ip' AS ip, meta->>'username' AS username, COUNT(*) AS attempts
FROM audit_log
WHERE action = 'auth.login_failed'
  AND created_at > now() - interval '1 hour'
GROUP BY ip, username
ORDER BY attempts DESC;"
```

### Find unauthorized role changes

```bash
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
SELECT created_at, actor_id, action, target_id, meta
FROM audit_log
WHERE action IN ('role.assign', 'role.revoke', 'identity.disable', 'identity.enable')
ORDER BY created_at DESC
LIMIT 50;"
```

---

## Step 2: Contain the Incident

### Disable a compromised identity

```bash
# Via API:
curl -X POST \
  -H "Authorization: Bearer <admin_token>" \
  http://localhost:8080/api/v1/admin/identities/<identity_id>/disable

# Verify in audit log:
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
SELECT * FROM audit_log WHERE action = 'identity.disable' ORDER BY created_at DESC LIMIT 5;"
```

### Revoke a specific role

```bash
curl -X DELETE \
  -H "Authorization: Bearer <admin_token>" \
  http://localhost:8080/api/v1/admin/identities/<identity_id>/roles/<role>
```

### Invalidate all sessions for an identity

```bash
# Direct DB approach (removes all active sessions for a user):
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
DELETE FROM sessions WHERE identity_id = '<identity_id>';"
```

Users can contain a single-session compromise without database access:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:8080/api/v1/auth/sessions
curl -X DELETE -H "Authorization: Bearer <token>" http://localhost:8080/api/v1/auth/sessions/<session_id>
```

Rotate the current credential and immediately replace the stored client credential with the returned value:

```bash
curl -X POST -H "Authorization: Bearer <token>" http://localhost:8080/api/v1/auth/session/rotate
```

PostgreSQL stores only session-token SHA-256 digests. Raw bearer credentials cannot be recovered from a database dump.

### Temporarily disable all rate limits (if false-positive storm)

```bash
# Set in .env:
RATE_DISABLED=true
docker compose up -d --no-deps api
```

### Re-enable rate limits after investigation

```bash
# Remove or set to false in .env:
RATE_DISABLED=false
docker compose up -d --no-deps api
```

---

## Step 3: Rotate Secrets

### Rotate TURN secret (if TURN credentials may be compromised)

```bash
pnpm domain:rotate
# This: generates new secret, patches .env atomically, restarts coturn + api
```

### Rotate MinIO credentials

1. Update `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` in `.env`
2. Re-render configs: `node scripts/render-dev-configs.mjs .env`
3. Restart MinIO and API: `docker compose restart minio api`

### Rotate LiveKit API secret

1. Update `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in `.env`
2. Restart: `docker compose restart livekit api`

---

## Step 4: Take an Emergency Backup

Before making changes that affect data integrity:

```bash
pnpm db:backup
```

Verify the backup exists:
```bash
ls -lh backups/
```

---

## Step 5: Investigate and Document

### Export audit log to file

```bash
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "\COPY (SELECT * FROM audit_log ORDER BY created_at DESC) TO STDOUT WITH CSV HEADER" \
  > audit-export-$(date +%Y%m%dT%H%M%S).csv
```

### Check API logs around incident time

```bash
# Filter logs by time range (if your logging has timestamps):
docker compose logs api --since="2026-05-13T10:00:00" --until="2026-05-13T11:00:00"
```

---

## Step 6: Recover

### Restore from backup (if data was corrupted or deleted)

See `docs/runbooks/backup-restore.md` for full restore procedure.

```bash
node scripts/restore.mjs --backup-dir backups/<timestamp>
```

---

## Incident Severity Guide

| Level | Examples | Response |
|-------|---------|----------|
| Low | Single failed login, rate limit hit | Review audit log, monitor |
| Medium | Multiple failed logins from one IP, suspicious role change | Disable identity, rotate credentials |
| High | Admin credentials compromised, data exfiltration suspected | Disable all affected identities, rotate all secrets, restore from backup if needed, notify users |
| Critical | Server host compromise | Take system offline, forensic image, restore from clean backup on new host |

---

## After the Incident

1. Re-enable any disabled identities that were incorrectly flagged
2. Update admin passwords if credentials may have been exposed
3. Review audit log for the full scope of actions taken by the compromised identity
4. Document the incident in `docs/` for future reference
