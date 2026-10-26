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

console.log("validate-audit-logs");

check(
  "Migration 015 exists",
  existsSync("apps/server-api/internal/migrate/sql/015_create_audit_log.sql")
);
check(
  "Migration 015 contains audit_log table",
  fileContains("apps/server-api/internal/migrate/sql/015_create_audit_log.sql", "audit_log")
);
check(
  "internal/audit/logger.go exists",
  existsSync("apps/server-api/internal/audit/logger.go")
);
check(
  "logger.go contains async Log with goroutine",
  fileContains("apps/server-api/internal/audit/logger.go", "go func()")
);
check(
  "logger.go contains List function",
  fileContains("apps/server-api/internal/audit/logger.go", "func (l *Logger) List")
);
check(
  "internal/audit/handler.go exists",
  existsSync("apps/server-api/internal/audit/handler.go")
);
check(
  "server.go registers /api/v1/admin/audit",
  fileContains("apps/server-api/internal/server/server.go", "/api/v1/admin/audit")
);
check(
  "auth/handler.go emits auth.login audit",
  fileContains("apps/server-api/internal/auth/handler.go", "auth.login")
);
check(
  "auth/handler.go emits auth.login_failed audit",
  fileContains("apps/server-api/internal/auth/handler.go", "auth.login_failed")
);
check(
  "admin/handler.go emits role.assign audit",
  fileContains("apps/server-api/internal/admin/handler.go", "role.assign")
);
check(
  "admin/handler.go emits identity.disable audit",
  fileContains("apps/server-api/internal/admin/handler.go", "identity.disable")
);
check(
  "bootstrap/handler.go emits server.bootstrap audit",
  fileContains("apps/server-api/internal/bootstrap/handler.go", "server.bootstrap")
);
check(
  "internal/httputil/ip.go exists (shared ExtractIP)",
  existsSync("apps/server-api/internal/httputil/ip.go")
);
check(
  "docs/runbooks/operations.md exists",
  existsSync("docs/runbooks/operations.md")
);
check(
  "docs/runbooks/security-incidents.md exists",
  existsSync("docs/runbooks/security-incidents.md")
);

console.log("");
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
