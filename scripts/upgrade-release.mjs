#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run, verifyBundle } from "./lib/backup-bundle.mjs";

const candidateRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parse(argv) {
  const out = { previous: "", env: ".env", previousImages: "", candidateImages: join(candidateRoot, ".release-images.env"), state: "", backups: "", project: "openspace" };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[++i];
    if (argv[i - 1] === "--previous") out.previous = value;
    else if (argv[i - 1] === "--env") out.env = value;
    else if (argv[i - 1] === "--previous-images") out.previousImages = value;
    else if (argv[i - 1] === "--candidate-images") out.candidateImages = value;
    else if (argv[i - 1] === "--state") out.state = value;
    else if (argv[i - 1] === "--backups") out.backups = value;
    else if (argv[i - 1] === "--project") out.project = value;
    else throw new Error(`unknown argument: ${argv[i - 1]}`);
  }
  return out;
}

try {
  const options = parse(process.argv.slice(2));
  if (!options.previous) throw new Error("Usage: upgrade-release.mjs --previous <extracted-release-dir> [--env .env]");
  const previousRoot = resolve(options.previous);
  const envPath = resolve(options.env);
  const previousImages = resolve(options.previousImages || join(previousRoot, ".release-images.env"));
  const candidateImages = resolve(options.candidateImages);
  const statePath = resolve(options.state || join(dirname(envPath), ".openspace", "releases", "artifact-rollback.json"));
  const backups = resolve(options.backups || join(dirname(statePath), "pre-upgrade-backups"));
  for (const path of [envPath, previousImages, candidateImages, join(previousRoot, "docker-compose.prod.yml"), join(candidateRoot, "docker-compose.prod.yml")]) {
    if (!existsSync(path)) throw new Error(`required artifact lifecycle file is missing: ${path}`);
  }
  if (previousRoot === candidateRoot) throw new Error("previous and candidate release directories must differ");
  const lifecycleEnv = { ...process.env, OPENSPACE_COMPOSE_PROJECT_NAME: options.project, OPENSPACE_COMPOSE_FILE: join(previousRoot, "docker-compose.prod.yml"), OPENSPACE_IMAGES_ENV: previousImages };
  const output = run(process.execPath, [join(candidateRoot, "scripts", "backup.mjs"), "--env", envPath, "--root", backups, "--label", "pre-artifact-upgrade"], { env: lifecycleEnv, label: "pre-upgrade artifact backup" });
  const result = JSON.parse(output.trim().split(/\r?\n/).at(-1));
  await verifyBundle(result.bundle);
  mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 });
  const metadata = { schema: "openspace.artifact-rollback/v1", createdAt: new Date().toISOString(), project: options.project, envPath, previousRoot, previousImages, candidateRoot, candidateImages, backupBundle: result.bundle };
  writeFileSync(statePath, JSON.stringify(metadata, null, 2) + "\n", { mode: 0o600 });
  run("bash", [join(candidateRoot, "scripts", "deploy-release.sh"), envPath, candidateImages], { env: { ...process.env, OPENSPACE_COMPOSE_PROJECT_NAME: options.project }, stdio: "inherit", label: "immutable candidate deployment" });
  console.log(JSON.stringify({ ok: true, state: statePath, backupBundle: result.bundle, previousRoot, candidateRoot }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, phase: "artifact-upgrade", error: error.message }));
  process.exit(1);
}
