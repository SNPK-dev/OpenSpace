#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";

let pass = 0;
let fail = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}${detail ? `: ${detail}` : ""}`);
    fail++;
  }
}

function fileContains(path, ...patterns) {
  if (!existsSync(path)) return false;
  const content = readFileSync(path, "utf8");
  return patterns.every((p) => content.includes(p));
}

console.log("validate-backups");

check(
  "scripts/backup.mjs exists",
  existsSync("scripts/backup.mjs")
);
check(
  "scripts/backup.mjs contains pg_dump and manifest",
  fileContains("scripts/backup.mjs", "pg_dump", "manifest")
);
check("shared backup bundle library exists", existsSync("scripts/lib/backup-bundle.mjs"));
check("backup captures object storage and completion markers", fileContains("scripts/backup.mjs", "mc mirror", "INCOMPLETE", "verifyBundle"));
check(
  "backup lifecycle uses argument-vector subprocesses (no shell interpolation)",
  fileContains("scripts/lib/backup-bundle.mjs", "spawnSync", "spawn(")
);
check(
  "scripts/restore.mjs exists",
  existsSync("scripts/restore.mjs")
);
check(
  "scripts/restore.mjs contains pg_restore",
  fileContains("scripts/restore.mjs", "pg_restore", "verifyBundle", "MinIO restore")
);
check("standalone backup verifier exists", existsSync("scripts/verify-backup.mjs"));
check("upgrade and rollback are recovery-gated", fileContains("scripts/upgrade.mjs", "pre-upgrade backup", "verifyBundle") && fileContains("scripts/rollback.mjs", "verifyBundle", "restore.mjs"));
check("Docker recovery drill exists", existsSync("scripts/recovery-drill.mjs") && existsSync("scripts/tests/fixtures/recovery-compose.yml"));
check("backup bundle tests exist", existsSync("scripts/tests/backup-bundle.test.mjs"));
check(
  "scripts/migrate-status.mjs exists",
  existsSync("scripts/migrate-status.mjs")
);
check(
  "scripts/migrate-status.mjs contains schema_migrations",
  fileContains("scripts/migrate-status.mjs", "schema_migrations")
);
check(
  "Migration 014 exists",
  existsSync("apps/server-api/internal/migrate/sql/014_create_backup_log.sql")
);
check(
  "Migration 014 contains backup_log table",
  fileContains("apps/server-api/internal/migrate/sql/014_create_backup_log.sql", "backup_log")
);
check(
  "Go backup service exists",
  existsSync("apps/server-api/internal/backup/service.go")
);
check(
  "Go backup handler exists",
  existsSync("apps/server-api/internal/backup/handler.go")
);
check(
  "server.go registers backup routes",
  fileContains("apps/server-api/internal/server/server.go", "/api/v1/admin/backup", "/api/v1/admin/migrations")
);
check(
  "docs/runbooks/backup-restore.md exists",
  existsSync("docs/runbooks/backup-restore.md")
);

console.log("");
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
