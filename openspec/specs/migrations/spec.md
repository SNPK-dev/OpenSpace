# Spec: migrations

## Behavior

### Scenario: Operator checks migration status

GIVEN
- docker-compose stack running (postgres container healthy)
- `apps/server-api/internal/migrate/sql/` contains one or more .sql files
- schema_migrations table exists

WHEN
- operator runs `pnpm db:migrate-status` (or `node scripts/migrate-status.mjs`)

THEN
- a table printed to stdout:
  ```
  Migration                     Status
  ─────────────────────────────────────────────
  001_create_servers            applied
  ...
  013_add_search_indexes        applied
  014_create_backup_log         applied
  ```
- summary line: "N applied, M pending"
- exit code 0

### Scenario: Pending migrations exist

GIVEN
- a new .sql file exists in the migrations directory
- the migration has NOT yet been applied (not in schema_migrations)

WHEN
- operator runs `pnpm db:migrate-status`

THEN
- pending migration shown with "pending" status
- summary shows "N applied, M pending" with M > 0
- exit code 0 (status check is informational, not an error)

### Scenario: Admin views migration list via API

GIVEN
- admin user authenticated

WHEN
- GET /api/v1/admin/migrations

THEN
- 200 response with JSON array of schema_migrations rows
- each row: name (string), applied_at (ISO 8601 timestamp)
- rows ordered by name ASC

### Scenario: Migration 014 applied on startup

GIVEN
- OpenSpace API starts after this change is deployed
- migration 014_create_backup_log.sql exists
- backup_log table does not yet exist

WHEN
- API process starts

THEN
- Go migration runner detects 014 as unapplied
- runs 014 in a transaction
- inserts "014_create_backup_log" into schema_migrations
- API startup continues normally
- backup_log table now exists and accepts inserts from backup.mjs
