/**
 * Rotates the TURN shared secret in .env, re-renders coturn config, and restarts
 * the coturn and api containers so credentials stay in sync.
 *
 * Usage: node scripts/rotate-turn-secret.mjs [path/to/.env]
 */

import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";

const envPath = process.argv[2] ?? ".env";

let envContent;
try {
  envContent = readFileSync(envPath, "utf8");
} catch (err) {
  console.error(`Cannot read env file: ${envPath} — ${err.message}`);
  process.exit(1);
}

const newSecret = randomBytes(32).toString("hex");

// Patch only the TURN_SECRET line; preserve everything else exactly.
const updated = envContent.replace(
  /^TURN_SECRET=.*$/m,
  `TURN_SECRET=${newSecret}`
);

if (updated === envContent && !envContent.includes("TURN_SECRET=")) {
  console.error("TURN_SECRET key not found in env file — cannot rotate.");
  process.exit(1);
}

// Atomic write: temp file + rename.
const tmp = `${envPath}.rotating`;
writeFileSync(tmp, updated, "utf8");
renameSync(tmp, envPath);

console.log(`[1/3] TURN_SECRET rotated (${newSecret.slice(0, 8)}…)`);

// Re-render prod coturn config with the new secret.
try {
  execFileSync(process.execPath, ["scripts/render-prod-configs.mjs", envPath], {
    stdio: "inherit",
  });
} catch (err) {
  console.error(`[2/3] render-prod-configs failed: ${err.message}`);
  process.exit(1);
}

console.log("[2/3] Prod configs re-rendered.");

// Restart coturn and api so they pick up the new secret.
try {
  execFileSync("docker", ["compose", "-f", "docker-compose.prod.yml", "--env-file", envPath, "restart", "coturn", "api"], {
    stdio: "inherit",
  });
} catch (err) {
  console.error(`[3/3] docker compose restart failed: ${err.message}`);
  process.exit(1);
}

console.log("[3/3] coturn and api restarted.");
console.log(`\nTURN secret rotated successfully. New secret prefix: ${newSecret.slice(0, 8)}…`);
