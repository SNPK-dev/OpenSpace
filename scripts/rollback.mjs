#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run, verifyBundle } from "./lib/backup-bundle.mjs";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));

function parse(argv) { const out = { state: resolve(".openspace/releases/rollback.json"), yes: false }; for (let i = 0; i < argv.length; i++) { if (argv[i] === "--state") out.state = resolve(argv[++i]); else if (argv[i] === "--yes") out.yes = true; else throw new Error(`unknown argument: ${argv[i]}`); } return out; }
try {
  const options = parse(process.argv.slice(2)); if (!existsSync(options.state)) throw new Error(`rollback metadata not found: ${options.state}`);
  const metadata = JSON.parse(readFileSync(options.state, "utf8"));
  if (metadata.version !== 1 || !metadata.envPath || !metadata.backupBundle || !metadata.fromRelease) throw new Error("rollback metadata is invalid");
  await verifyBundle(metadata.backupBundle);
  run("git", ["cat-file", "-e", `${metadata.fromRelease}^{commit}`], { label: "rollback revision validation" });
  run("git", ["checkout", "--detach", metadata.fromRelease], { stdio: "inherit", label: "rollback release checkout" });
  run(process.execPath, [resolve(scriptDir, "restore.mjs"), "--backup-dir", metadata.backupBundle, "--env", metadata.envPath, ...(options.yes ? ["--yes"] : [])], { stdio: "inherit", label: "rollback restore" });
  console.log(JSON.stringify({ ok: true, restoredRelease: metadata.fromRelease, backupBundle: metadata.backupBundle }));
} catch (error) { console.error(JSON.stringify({ ok: false, phase: "rollback", error: error.message })); process.exit(1); }
