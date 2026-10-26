#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { run } from "./lib/backup-bundle.mjs";

const started = Date.now(), work = mkdtempSync(join(tmpdir(), "openspace-recovery-drill-"));
const composeFile = resolve("scripts/tests/fixtures/recovery-compose.yml"), envPath = join(work, ".env"), backupRoot = join(work, "backups");
writeFileSync(envPath, "POSTGRES_USER=openspace\nPOSTGRES_PASSWORD=drill-password\nPOSTGRES_DB=openspace\nOBJECT_STORAGE_ACCESS_KEY=drill-access\nOBJECT_STORAGE_SECRET_KEY=drill-secret-key\nOBJECT_STORAGE_BUCKET=openspace\n");
const compose = ["compose", "-f", composeFile, "--env-file", envPath], childEnv = { ...process.env, OPENSPACE_COMPOSE_FILE: composeFile };
try {
  run("docker", [...compose, "up", "-d", "--wait", "postgres", "minio", "api", "realtime-gateway"], { stdio: "inherit", label: "drill startup" });
  run("docker", [...compose, "exec", "-T", "postgres", "psql", "-U", "openspace", "-d", "openspace", "-v", "ON_ERROR_STOP=1", "-c", "CREATE TABLE schema_migrations(name text primary key); INSERT INTO schema_migrations VALUES ('drill'); CREATE TABLE backup_log (id bigserial primary key, taken_at timestamptz not null default now(), manifest_path text not null, db_size_bytes bigint not null, schema_version int not null, env text not null default 'dev', status text not null default 'ok'); CREATE TABLE drill_data(value text); INSERT INTO drill_data VALUES ('recover-me');"], { stdio: "inherit" });
  run("docker", [...compose, "run", "--rm", "-T", "--no-deps", "--entrypoint", "/bin/sh", "minio-init", "-ec", 'mc alias set local http://minio:9000 "$OBJECT_STORAGE_ACCESS_KEY" "$OBJECT_STORAGE_SECRET_KEY" >/dev/null; mc mb --ignore-existing "local/$OBJECT_STORAGE_BUCKET"; printf recover-object >/tmp/object; mc cp /tmp/object "local/$OBJECT_STORAGE_BUCKET/drill.txt"'], { stdio: "inherit" });
  const output = run(process.execPath, [resolve("scripts/backup.mjs"), "--env", envPath, "--root", backupRoot, "--keep", "2", "--label", "drill"], { env: childEnv, stdio: ["ignore", "pipe", "inherit"], label: "drill backup" });
  const backup = JSON.parse(output.trim().split(/\r?\n/).at(-1)).bundle;
  run("docker", [...compose, "exec", "-T", "postgres", "psql", "-U", "openspace", "-d", "openspace", "-c", "DELETE FROM drill_data"], { stdio: "inherit" });
  run("docker", [...compose, "run", "--rm", "-T", "--no-deps", "--entrypoint", "/bin/sh", "minio-init", "-ec", 'mc alias set local http://minio:9000 "$OBJECT_STORAGE_ACCESS_KEY" "$OBJECT_STORAGE_SECRET_KEY" >/dev/null; mc rm --force "local/$OBJECT_STORAGE_BUCKET/drill.txt"'], { stdio: "inherit" });
  run(process.execPath, [resolve("scripts/restore.mjs"), "--backup-dir", backup, "--env", envPath, "--yes"], { env: childEnv, stdio: "inherit", label: "drill restore" });
  const row = run("docker", [...compose, "exec", "-T", "postgres", "psql", "-U", "openspace", "-d", "openspace", "-Atc", "SELECT value FROM drill_data"], { label: "database assertion" }).trim();
  const object = run("docker", [...compose, "run", "--rm", "-T", "--no-deps", "--entrypoint", "/bin/sh", "minio-init", "-ec", 'mc alias set local http://minio:9000 "$OBJECT_STORAGE_ACCESS_KEY" "$OBJECT_STORAGE_SECRET_KEY" >/dev/null; mc cat "local/$OBJECT_STORAGE_BUCKET/drill.txt"'], { label: "object assertion" }).trim();
  if (row !== "recover-me" || object !== "recover-object") throw new Error(`recovery assertion failed: row=${row}, object=${object}`);
  console.log(JSON.stringify({ ok: true, rpoSeconds: 0, rtoSeconds: (Date.now() - started) / 1000, database: true, objects: true }));
} catch (error) { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1; }
finally { try { run("docker", [...compose, "down", "-v", "--remove-orphans"], { stdio: "inherit" }); } finally { rmSync(work, { recursive: true, force: true }); } }
