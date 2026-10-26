#!/usr/bin/env node
import { createReadStream, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { composeArgs, parseEnv, run, verifyBundle } from "./lib/backup-bundle.mjs";

function parseArgs(argv) { const out = { bundle: "", envPath: ".env", yes: false }; for (let i = 0; i < argv.length; i++) { if (argv[i] === "--backup-dir") out.bundle = argv[++i]; else if (argv[i] === "--env") out.envPath = argv[++i]; else if (argv[i] === "--yes") out.yes = true; else throw new Error(`unknown argument: ${argv[i]}`); } return out; }
function confirm(message) { return new Promise((done) => { const rl = createInterface({ input: process.stdin, output: process.stdout }); rl.question(`${message} [y/N] `, (answer) => { rl.close(); done(answer.trim().toLowerCase() === "y"); }); }); }
function pipeFile(command, args, file, env) { return new Promise((done, reject) => { const child = spawn(command, args, { stdio: ["pipe", "inherit", "pipe"], env }); let stderr = ""; child.stderr.on("data", (x) => { process.stderr.write(x); if (stderr.length < 65536) stderr += x; }); child.on("error", reject); createReadStream(file).pipe(child.stdin); child.on("close", (code) => code === 0 ? done() : reject(new Error(`pg_restore failed (${code}): ${stderr.trim()}`))); }); }

try {
  const options = parseArgs(process.argv.slice(2)); if (!options.bundle) throw new Error("Usage: restore.mjs --backup-dir <bundle> [--env .env] [--yes]");
  const bundle = resolve(options.bundle);
  console.log("phase=preflight action=verify-bundle"); const manifest = await verifyBundle(bundle);
  const env = parseEnv(options.envPath), user = env.POSTGRES_USER, db = env.POSTGRES_DB, bucket = env.OBJECT_STORAGE_BUCKET || "openspace";
  if (!user || !db || !env.OBJECT_STORAGE_ACCESS_KEY || !env.OBJECT_STORAGE_SECRET_KEY) throw new Error("target database/object storage configuration is incomplete");
  if (bucket !== manifest.objects.bucket) throw new Error(`target bucket ${bucket} differs from bundle bucket ${manifest.objects.bucket}`);
  if (!options.yes && !await confirm(`Restore ${manifest.createdAt} to database ${db} and bucket ${bucket}? This replaces authoritative data.`)) process.exit(0);
  const compose = composeArgs(env, options.envPath), pgEnv = { ...process.env, PGPASSWORD: env.POSTGRES_PASSWORD };
  const availableServices = new Set(run("docker", [...compose, "config", "--services"], { label: "compose service discovery" }).trim().split(/\r?\n/));
  const writers = ["api", "realtime-gateway", "worker"].filter((service) => availableServices.has(service));
  if (!writers.includes("api") || !writers.includes("realtime-gateway")) throw new Error("compose is missing required writer services");
  let mutated = false, success = false;
  console.log("phase=maintenance action=stop-writers"); run("docker", [...compose, "stop", ...writers], { stdio: "inherit" });
  try {
    mutated = true;
    const quotedDb = `"${db.replaceAll('"', '""')}"`;
    run("docker", [...compose, "exec", "-T", "postgres", "psql", "-U", user, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${quotedDb}`], { env: pgEnv, stdio: "inherit", label: "database drop" });
    run("docker", [...compose, "exec", "-T", "postgres", "psql", "-U", user, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${quotedDb}`], { env: pgEnv, stdio: "inherit", label: "database create" });
    await pipeFile("docker", [...compose, "exec", "-T", "postgres", "pg_restore", "-Fc", "--exit-on-error", "-U", user, "-d", db], resolve(bundle, manifest.database.path), pgEnv);
    const mount = `${bundle.replaceAll("\\", "/")}:/backup:ro`;
    run("docker", [...compose, "run", "--rm", "-T", "--no-deps", "-v", mount, "--entrypoint", "/bin/sh", "minio-init", "-ec", 'mc alias set target http://minio:9000 "$OBJECT_STORAGE_ACCESS_KEY" "$OBJECT_STORAGE_SECRET_KEY" >/dev/null; mc rm --recursive --force "target/$OBJECT_STORAGE_BUCKET" >/dev/null 2>&1 || true; mc mb --ignore-existing "target/$OBJECT_STORAGE_BUCKET" >/dev/null; mc mirror --overwrite --remove /backup/objects "target/$OBJECT_STORAGE_BUCKET"'], { stdio: "inherit", label: "MinIO restore" });
    const schema = Number(run("docker", [...compose, "exec", "-T", "postgres", "psql", "-U", user, "-d", db, "-Atc", "SELECT COUNT(*) FROM schema_migrations"], { env: pgEnv, label: "schema verification" }).trim());
    if (schema !== manifest.database.schemaMigrations) throw new Error(`schema verification failed: expected ${manifest.database.schemaMigrations}, got ${schema}`);
    const objectCount = Number(run("docker", [...compose, "run", "--rm", "-T", "--no-deps", "--entrypoint", "/bin/sh", "minio-init", "-ec", 'mc alias set target http://minio:9000 "$OBJECT_STORAGE_ACCESS_KEY" "$OBJECT_STORAGE_SECRET_KEY" >/dev/null; mc ls --recursive --json "target/$OBJECT_STORAGE_BUCKET" | wc -l'], { label: "object verification" }).trim());
    if (objectCount !== manifest.objects.count) throw new Error(`object verification failed: expected ${manifest.objects.count}, got ${objectCount}`);
    run("docker",[...compose,"exec","-T","postgres","psql","-U",user,"-d",db,"-v","ON_ERROR_STOP=1","-c",`INSERT INTO backup_log(manifest_path,db_size_bytes,schema_version,env,status) VALUES('${bundle.replaceAll("'","''")}',${manifest.database.bytes},${manifest.database.schemaMigrations},'restore','restore-ok')`],{env:pgEnv,label:"restore metrics record"});
    success = true;
  } finally {
    if (success) {
      if (process.env.OPENSPACE_RESTORE_KEEP_WRITERS_STOPPED !== "1") run("docker", [...compose, "start", ...writers], { stdio: "inherit", label: "restart writers" });
      else console.log("phase=maintenance action=writers-remain-stopped reason=controlled-rollback");
    } else if (mutated) console.error("restore failed after mutation; writers remain stopped to prevent partial-state writes");
  }
  console.log(JSON.stringify({ ok: true, bundle, database: db, bucket, schemaMigrations: manifest.database.schemaMigrations, objectCount: manifest.objects.count }));
} catch (error) { console.error(JSON.stringify({ ok: false, phase: "restore", error: error.message })); process.exit(1); }
