import { existsSync, readFileSync } from "node:fs";
const required = ["scripts/acceptance/clean-host.mjs", "scripts/acceptance/evidence.mjs", "scripts/acceptance/release-transition.mjs", "scripts/acceptance/run-local.sh", "scripts/tests/acceptance-evidence.test.mjs", ".github/workflows/clean-host-acceptance.yml", "docs/runbooks/clean-host-acceptance.md"];
const missing = required.filter((path) => !existsSync(path));
const workflow = existsSync(required[5]) ? readFileSync(required[5], "utf8") : "";
for (const marker of ["ubuntu-24.04", "environment: release-staging", "OPENSPACE_STAGING_DEPLOY_COMMAND", "turn-only-call", "acceptance-evidence"]) if (!workflow.includes(marker)) missing.push(`workflow marker: ${marker}`);
if (/path:\s*\.acceptance\/\s*$/m.test(workflow)) missing.push("workflow must not upload the acceptance directory containing credentials/backups");
if (missing.length) { console.error({ missing }); process.exit(1); }
console.log(`clean-host acceptance validation passed: ${required.length} artifacts`);
