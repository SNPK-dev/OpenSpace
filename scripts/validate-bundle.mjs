#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}`);
    fail++;
  }
}

function fileContains(path, ...patterns) {
  if (!existsSync(path)) return false;
  const content = readFileSync(path, "utf8");
  return patterns.every((p) => content.includes(p));
}

console.log("validate-bundle");

// Core bundle files
check("docker-compose.yml exists",       existsSync("docker-compose.yml"));
check("docker-compose.prod.yml exists",  existsSync("docker-compose.prod.yml"));
check(".env.example exists",             existsSync(".env.example"));
check("INSTALL.md exists",              existsSync("INSTALL.md"));

// Setup script
check("scripts/setup.mjs exists",        existsSync("scripts/setup.mjs"));
check("setup.mjs uses randomBytes",      fileContains("scripts/setup.mjs", "randomBytes"));
check("setup.mjs handles --non-interactive", fileContains("scripts/setup.mjs", "nonInteractive", "--non-interactive"));
check("setup.mjs writes .env atomically", fileContains("scripts/setup.mjs", "renameSync"));

// Build script
check("scripts/build-bundle.mjs exists", existsSync("scripts/build-bundle.mjs"));
check("build-bundle.mjs reads version from package.json",
  fileContains("scripts/build-bundle.mjs", "package.json", "version"));
check("build-bundle.mjs creates tar.gz",  fileContains("scripts/build-bundle.mjs", "tar.gz"));
check("build-bundle.mjs computes sha256", fileContains("scripts/build-bundle.mjs", "sha256"));
check("build-bundle.mjs excludes validate-workspace.mjs",
  fileContains("scripts/build-bundle.mjs", "validate-workspace.mjs"));

// Infra templates
check("infra/ exists",                   existsSync("infra"));
check("infra/caddy/ exists",             existsSync("infra/caddy"));
check("infra/coturn/ exists",            existsSync("infra/coturn"));
check("infra/livekit/ exists",           existsSync("infra/livekit"));

// Runbooks
check("docs/runbooks/backup-restore.md exists",     existsSync("docs/runbooks/backup-restore.md"));
check("docs/runbooks/operations.md exists",         existsSync("docs/runbooks/operations.md"));
check("docs/runbooks/security-incidents.md exists", existsSync("docs/runbooks/security-incidents.md"));
check("docs/runbooks/domain-tls-turn.md exists",    existsSync("docs/runbooks/domain-tls-turn.md"));

// package.json scripts
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
check("package.json has bundle:setup script",  !!pkg.scripts?.["bundle:setup"]);
check("package.json has bundle:build script",  !!pkg.scripts?.["bundle:build"]);

console.log("");
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
