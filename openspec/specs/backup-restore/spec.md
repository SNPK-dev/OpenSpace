# Spec: backup-restore

## Behavior

### Scenario: Operator runs backup

GIVEN
- docker-compose stack is running (postgres container healthy)
- `.env` contains POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
- backup_log table exists (migration 014 applied)

WHEN
- operator runs `pnpm db:backup` (or `node scripts/backup.mjs .env`)

THEN
- a directory `backups/YYYY-MM-DDTHH-MM-SS/` is created
- `db.dump` file written via `pg_dump -Fc` (custom format)
- `manifest.json` written with: timestamp, db_file, db_size_bytes, schema_version (count from schema_migrations), env
- a row inserted into `backup_log` with those values
- summary printed to stdout: backup dir path, file size in bytes, schema_version
- exit code 0

### Scenario: Backup when postgres is unreachable

GIVEN
- postgres container is stopped or network is unavailable

WHEN
- operator runs `pnpm db:backup`

THEN
- error printed to stderr with clear message ("postgres unavailable" or pg_dump stderr)
- no partial backup directory left behind (cleanup on failure)
- exit code non-zero

### Scenario: Operator restores from backup

GIVEN
- a valid backup directory with `db.dump` and `manifest.json`
- stack is running
- operator has --yes flag OR runs interactively

WHEN
- operator runs `node scripts/restore.mjs --backup-dir backups/<timestamp> [--yes]`

THEN
- if interactive (no --yes): confirmation prompt displayed with backup timestamp and data-loss warning
- `docker compose stop api realtime-gateway worker` executed
- database dropped and recreated (same name)
- `pg_restore -Fc` applied from db.dump
- `docker compose start api realtime-gateway worker`
- schema_migrations count queried and compared to manifest.schema_version
- if counts match: "Restore complete. Schema version: N" printed, exit 0
- if mismatch: "Warning: schema version mismatch (expected N, got M)" printed, exit 1

### Scenario: Restore with corrupted db.dump

GIVEN
- backup directory exists but db.dump is truncated or corrupted

WHEN
- operator runs restore

THEN
- pg_restore exits non-zero
- error message printed to stderr
- services are restarted (best-effort, even on failure)
- exit code non-zero

### Scenario: Restore aborted at confirmation

GIVEN
- operator runs restore without --yes flag

WHEN
- operator types "n" or presses Ctrl-C at confirmation prompt

THEN
- no database operations performed
- no services stopped
- "Restore aborted." printed, exit 0

### Scenario: Admin views backup history

GIVEN
- admin user authenticated (valid session, admin role)
- one or more backup_log rows exist

WHEN
- GET /api/v1/admin/backup

THEN
- 200 response with JSON array of backup_log rows (desc by taken_at, limit 50)
- each row: id, taken_at, manifest_path, db_size_bytes, schema_version, env, status

### Scenario: Non-admin accesses backup API

GIVEN
- user authenticated but not admin

WHEN
- GET /api/v1/admin/backup

THEN
- 403 Forbidden
