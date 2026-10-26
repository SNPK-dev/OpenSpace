#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { composeArgs, parseEnv, run, verifyBundle } from "./lib/backup-bundle.mjs";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));

function parse(argv) { const out = { envPath: ".env", target: "", root: process.env.OPENSPACE_BACKUP_ROOT || "backups" }; for (let i = 0; i < argv.length; i++) { if (argv[i] === "--env") out.envPath = argv[++i]; else if (argv[i] === "--target") out.target = argv[++i]; else if (argv[i] === "--root") out.root = argv[++i]; else throw new Error(`unknown argument: ${argv[i]}`); } return out; }
try {
  const options = parse(process.argv.slice(2)); if (!options.target) throw new Error("Usage: upgrade.mjs --target <release> [--env .env] [--root backups]");
  const env = parseEnv(options.envPath), stateDir = resolve(".openspace", "releases"); mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  if (run("git", ["status", "--porcelain"], { label: "working tree check" }).trim()) throw new Error("upgrade requires a clean working tree");
  const before = run("git", ["rev-parse", "HEAD"], { label: "current revision" }).trim();
  const targetRevision = run("git", ["rev-parse", "--verify", `${options.target}^{commit}`], { label: "target revision" }).trim();
  const output = run(process.execPath, [resolve(scriptDir, "backup.mjs"), "--env", options.envPath, "--root", options.root, "--label", `pre-upgrade-${before}`], { stdio: ["ignore", "pipe", "inherit"], label: "pre-upgrade backup" });
  const result = JSON.parse(output.trim().split(/\r?\n/).at(-1)); await verifyBundle(result.bundle);
  const metadata = { version: 1, createdAt: new Date().toISOString(), fromRelease: before, targetRelease: options.target, targetRevision, envPath: resolve(options.envPath), backupBundle: result.bundle };
  const statePath = join(stateDir, "rollback.json"); writeFileSync(statePath, JSON.stringify(metadata, null, 2) + "\n", { mode: 0o600 });
  const compose = composeArgs(env, options.envPath);
  run("docker", [...compose, "config", "--quiet"], { stdio: "inherit", label: "compose validation" });
  run("git", ["checkout", "--detach", targetRevision], { stdio: "inherit", label: "release checkout" });
  run("docker", [...compose, "pull"], { stdio: "inherit", label: "image pull" });
  run("docker", [...compose, "up", "-d", "--build", "--remove-orphans"], { stdio: "inherit", label: "upgrade deploy" });
  console.log(JSON.stringify({ ok: true, fromRelease: before, targetRelease: options.target, targetRevision, rollbackMetadata: statePath, backupBundle: result.bundle }));
} catch (error) { console.error(JSON.stringify({ ok: false, phase: "upgrade", error: error.message })); process.exit(1); }
