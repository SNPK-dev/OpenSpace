#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const FORBIDDEN_KEYS = [
  "password",
  "token",
  "secret",
  "code_prefix",
  "invite_code",
  "email",
  "username",
  "display_name",
  "content",
  "body",
];

const SCAN_ROOTS = [
  "apps/server-api/internal",
  "apps/server-api/cmd",
];

let violations = 0;

function walkGoFiles(dir, cb) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkGoFiles(full, cb);
    } else if (extname(entry) === ".go") {
      cb(full);
    }
  }
}

function checkFile(filePath) {
  const lines = readFileSync(filePath, "utf8").split("\n");
  lines.forEach((line, idx) => {
    // Only check lines that contain a slog call
    if (!line.includes("slog.")) return;

    for (const key of FORBIDDEN_KEYS) {
      if (line.includes(`"${key}"`)) {
        console.log(`  ✗ ${filePath}:${idx + 1} — forbidden log key "${key}"`);
        console.log(`    ${line.trim()}`);
        violations++;
      }
    }

    // Catch partial token logging patterns like .Code[:N] or .Code in slog context
    if (/\.Code\[/.test(line)) {
      console.log(`  ✗ ${filePath}:${idx + 1} — partial token logged (.Code[...])`);
      console.log(`    ${line.trim()}`);
      violations++;
    }
  });
}

console.log("validate-privacy-logs");

for (const root of SCAN_ROOTS) {
  try {
    walkGoFiles(root, checkFile);
  } catch {
    // Root may not exist in partial builds — skip silently
  }
}

console.log("");
if (violations === 0) {
  console.log("  ✓ No privacy log violations found");
  console.log("");
  console.log("0 violations");
} else {
  console.log(`${violations} violation${violations === 1 ? "" : "s"} found`);
  process.exit(1);
}
