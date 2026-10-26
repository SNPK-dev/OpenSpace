import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { validateEvidence, writeEvidence } from "./evidence.mjs";

const MODES = {
  local: ["host-baseline", "install", "socket-policy", "bootstrap", "chat", "websocket-reconnect", "attachment-roundtrip", "voice-local", "backup", "independent-restore", "previous-version-upgrade", "rollback"],
  public: ["staging-deploy", "dns", "tls", "wss", "socket-policy", "turn-only-call"],
};
const mode = process.argv.includes("--public") ? "public" : "local";
const dryRun = process.argv.includes("--dry-run");
const outputArg = process.argv.indexOf("--output");
const output = resolve(outputArg >= 0 ? process.argv[outputArg + 1] : `docs/evidence/results/clean-host-${mode}.json`);
const phases = [];
let failed = false;

for (const name of MODES[mode]) {
  const envName = `OPENSPACE_ACCEPT_${name.toUpperCase().replaceAll("-", "_")}_CMD`;
  const command = process.env[envName];
  const started = Date.now();
  try {
    if (dryRun) {
      if (!command) throw new Error(`missing ${envName}`);
    } else {
      if (!command) throw new Error(`missing required phase command ${envName}`);
      execFileSync(process.platform === "win32" ? "cmd.exe" : "/bin/bash", process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-euo", "pipefail", "-c", command], { stdio: "inherit", env: process.env, timeout: Number(process.env.OPENSPACE_ACCEPT_PHASE_TIMEOUT_MS ?? 900000) });
    }
    phases.push({ name, status: "passed", durationMs: Date.now() - started });
  } catch (error) {
    phases.push({ name, status: "failed", durationMs: Date.now() - started, error: String(error.message).slice(0, 500) });
    failed = true;
  }
}
const evidence = writeEvidence(output, { schema: "openspace.acceptance/v1", mode, revision: process.env.GITHUB_SHA ?? process.env.OPENSPACE_RELEASE_REVISION ?? "local", runner: process.env.ImageOS ?? `${process.platform}-${process.arch}`, startedAt: new Date(Date.now() - phases.reduce((n, p) => n + p.durationMs, 0)).toISOString(), completedAt: new Date().toISOString(), phases });
try { validateEvidence(evidence, MODES[mode]); } catch (error) { failed = true; console.error(error.message); }
console.log(JSON.stringify({ ok: !failed, mode, evidence: output }));
if (failed) process.exit(1);
