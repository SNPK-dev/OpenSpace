#!/usr/bin/env node
/**
 * Full e2e pipeline: bootstrap → text-chat → files/DM → voice → load tests.
 *
 * Usage (fresh server):
 *   API_URL=http://localhost:8080 node scripts/e2e-run-all.mjs
 *   (bootstraps, then asks you to re-run with API_TOKEN)
 *
 * Usage (already bootstrapped):
 *   API_TOKEN=<token> node scripts/e2e-run-all.mjs
 *   API_URL=http://localhost:8080 API_TOKEN=<token> node scripts/e2e-run-all.mjs
 */
import { spawn } from "node:child_process";

const API_URL = (process.env.API_URL ?? "http://localhost:8080").replace(/\/$/, "");

function run(script, env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [script], {
      stdio: "inherit",
      env: { ...process.env, ...env, API_URL },
    });
    proc.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

console.log("═══════════════════════════════════════════");
console.log("  OpenSpace — Full E2E Pipeline");
console.log(`  API: ${API_URL}`);
console.log("═══════════════════════════════════════════\n");

try {
  // Phase 1: Bootstrap flow
  // If API_TOKEN is already set (server already bootstrapped), skip bootstrap script
  // and use the provided token directly.
  let token = process.env.API_TOKEN ?? "";

  if (!token) {
    console.log("▶ Phase 1: Admin bootstrap flow");
    await run("scripts/e2e-admin-bootstrap-flow.mjs");
    // After bootstrap, the admin credentials are needed to obtain a token.
    // Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD, or provide API_TOKEN directly.
    throw new Error(
      "Bootstrap complete. Re-run with API_TOKEN=<token from bootstrap output> to continue."
    );
  } else {
    console.log("▶ Phase 1: Admin bootstrap flow (skipped — API_TOKEN provided)");
  }

  // Phase 2: Text chat
  console.log("\n▶ Phase 2: Text chat flow");
  await run("scripts/e2e-text-chat-flow.mjs", { API_TOKEN: token });

  // Phase 3: Files + DM + search
  console.log("\n▶ Phase 3: Files, DM and search flow");
  await run("scripts/e2e-files-dm-room-flow.mjs", { API_TOKEN: token });

  // Phase 4: Voice
  console.log("\n▶ Phase 4: Voice chat flow");
  await run("scripts/e2e-voice-chat-flow.mjs", { API_TOKEN: token });

  // Phase 5: Load/chaos
  console.log("\n▶ Phase 5: Load and chaos tests");
  await run("scripts/load-test.mjs", { API_TOKEN: token });

  console.log("\n═══════════════════════════════════════════");
  console.log("  ✓ ALL PHASES PASSED");
  console.log("═══════════════════════════════════════════");
} catch (err) {
  console.error("\n✗ E2E pipeline failed:", err.message);
  process.exit(1);
}
