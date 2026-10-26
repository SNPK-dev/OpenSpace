#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const runners = [
  "apps/web-client/e2e/runner.mjs",
  "apps/admin-web/e2e/runner.mjs",
  "apps/desktop-win/e2e/runner.mjs",
];

for (const runner of runners) {
  const requiredEnv = { ...process.env };
  delete requiredEnv.ADMIN_API_TOKEN;
  delete requiredEnv.E2E_OPTIONAL;
  const required = spawnSync(process.execPath, [runner], { env: requiredEnv, encoding: "utf8" });
  if (required.status === 0 || !required.stderr.includes("prerequisite missing")) {
    console.error(`${runner}: required mode must fail clearly without ADMIN_API_TOKEN`);
    process.exit(1);
  }

  const optional = spawnSync(process.execPath, [runner], {
    env: { ...requiredEnv, E2E_OPTIONAL: "1" },
    encoding: "utf8",
  });
  if (optional.status !== 0 || !optional.stdout.includes("explicitly skipped")) {
    console.error(`${runner}: optional mode must be an explicit successful skip`);
    process.exit(1);
  }

  console.log(`E2E runner mode OK: ${runner}`);
}
