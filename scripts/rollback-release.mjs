#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { run, verifyBundle } from "./lib/backup-bundle.mjs";

const stateArg = process.argv.indexOf("--state");
const statePath = resolve(stateArg >= 0 ? process.argv[stateArg + 1] : ".openspace/releases/artifact-rollback.json");

try {
  if (!existsSync(statePath)) throw new Error(`artifact rollback metadata not found: ${statePath}`);
  const metadata = JSON.parse(readFileSync(statePath, "utf8"));
  if (metadata.schema !== "openspace.artifact-rollback/v1") throw new Error("artifact rollback metadata is invalid");
  for (const path of [metadata.envPath, metadata.previousImages, metadata.backupBundle]) if (!existsSync(path)) throw new Error(`rollback input is missing: ${path}`);
  await verifyBundle(metadata.backupBundle);
  const common = ["compose", "-p", metadata.project, "-f", `${metadata.previousRoot}/docker-compose.prod.yml`, "--env-file", metadata.envPath, "--env-file", metadata.previousImages];
  run("docker", [...common, "stop", "api", "realtime-gateway", "worker"], { stdio: "inherit", label: "stop candidate writers" });
  run("docker", [...common, "up", "-d", "--no-build", "postgres", "redis", "minio", "minio-init"], { stdio: "inherit", label: "start rollback dependencies" });
  const restoreEnv = { ...process.env, OPENSPACE_COMPOSE_PROJECT_NAME: metadata.project, OPENSPACE_COMPOSE_FILE: `${metadata.previousRoot}/docker-compose.prod.yml`, OPENSPACE_IMAGES_ENV: metadata.previousImages, OPENSPACE_RESTORE_KEEP_WRITERS_STOPPED: "1" };
  run(process.execPath, [`${metadata.candidateRoot}/scripts/restore.mjs`, "--backup-dir", metadata.backupBundle, "--env", metadata.envPath, "--yes"], { env: restoreEnv, stdio: "inherit", label: "artifact rollback restore" });
  run("bash", [`${metadata.previousRoot}/scripts/deploy-release.sh`, metadata.envPath, metadata.previousImages], { env: { ...process.env, OPENSPACE_COMPOSE_PROJECT_NAME: metadata.project }, stdio: "inherit", label: "immutable previous deployment" });
  console.log(JSON.stringify({ ok: true, restoredRelease: metadata.previousRoot, backupBundle: metadata.backupBundle }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, phase: "artifact-rollback", error: error.message }));
  process.exit(1);
}
