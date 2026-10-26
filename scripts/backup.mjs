#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { applyRetention, artifact, composeArgs, ensurePrivateDirectory, finalizeBundle, listFiles, parseEnv, run, streamToFile, verifyBundle } from "./lib/backup-bundle.mjs";

function args(argv) {
  const out = { envPath: ".env", root: process.env.OPENSPACE_BACKUP_ROOT || "backups", retention: { daily: Number(process.env.OPENSPACE_BACKUP_DAILY || 7), weekly: Number(process.env.OPENSPACE_BACKUP_WEEKLY || 4), monthly: Number(process.env.OPENSPACE_BACKUP_MONTHLY || 6) }, transfer: process.env.OPENSPACE_BACKUP_TRANSFER || "", label: "scheduled" };
  if (argv[0] && !argv[0].startsWith("--")) out.envPath = argv.shift();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--env") out.envPath = argv[++i]; else if (argv[i] === "--root") out.root = argv[++i];
    else if (argv[i] === "--keep") { const keep = Number(argv[++i]); out.retention = { daily: keep, weekly: 0, monthly: 0 }; }
    else if (argv[i] === "--daily") out.retention.daily = Number(argv[++i]); else if (argv[i] === "--weekly") out.retention.weekly = Number(argv[++i]); else if (argv[i] === "--monthly") out.retention.monthly = Number(argv[++i]);
    else if (argv[i] === "--transfer-command") out.transfer = argv[++i];
    else if (argv[i] === "--label") out.label = argv[++i]; else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return out;
}

const started = Date.now();
let staging;
try {
  const options = args(process.argv.slice(2));
  const env = parseEnv(options.envPath);
  const user = env.POSTGRES_USER, db = env.POSTGRES_DB, bucket = env.OBJECT_STORAGE_BUCKET || "openspace";
  if (!user || !db || !env.OBJECT_STORAGE_ACCESS_KEY || !env.OBJECT_STORAGE_SECRET_KEY) throw new Error("POSTGRES and OBJECT_STORAGE credentials/bucket must be configured");
  const root = resolve(options.root); ensurePrivateDirectory(root);
  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  const name = `${stamp}-${options.label.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  staging = join(root, `${name}.incomplete`); const finalPath = join(root, name);
  if (existsSync(staging) || existsSync(finalPath)) throw new Error(`backup path already exists: ${name}`);
  mkdirSync(join(staging, "objects"), { recursive: true, mode: 0o700 });
  writeFileSync(join(staging, "INCOMPLETE"), `${new Date().toISOString()}\n`, { mode: 0o600 });
  const compose = composeArgs(env, options.envPath); const pgEnv = { ...process.env, PGPASSWORD: env.POSTGRES_PASSWORD };
  const availableServices = new Set(run("docker", [...compose, "config", "--services"], { label: "compose service discovery" }).trim().split(/\r?\n/));
  const writers = ["api", "realtime-gateway", "worker"].filter((service) => availableServices.has(service));
  if (!writers.includes("api") || !writers.includes("realtime-gateway")) throw new Error("compose is missing required writer services");
  const consistencyStart = new Date().toISOString();
  console.log("phase=maintenance action=stop-writers"); run("docker", [...compose, "stop", ...writers], { stdio: "inherit" });
  try {
    console.log("phase=capture component=postgres");
    await streamToFile("docker", [...compose, "exec", "-T", "postgres", "pg_dump", "-Fc", "-U", user, "-d", db], join(staging, "db.dump"), { env: pgEnv, label: "pg_dump" });
    console.log("phase=capture component=minio");
    const mount = `${staging.replaceAll("\\", "/")}:/backup`;
    run("docker", [...compose, "run", "--rm", "-T", "--no-deps", "-v", mount, "--entrypoint", "/bin/sh", "minio-init", "-ec", 'mc alias set source http://minio:9000 "$OBJECT_STORAGE_ACCESS_KEY" "$OBJECT_STORAGE_SECRET_KEY" >/dev/null; mc mirror --overwrite "source/$OBJECT_STORAGE_BUCKET" /backup/objects'], { stdio: "inherit", label: "MinIO export" });
  } finally {
    run("docker", [...compose, "start", ...writers], { stdio: "inherit", label: "restart writers" });
  }
  const consistencyEnd = new Date().toISOString();
  const schemaCount = Number(run("docker", [...compose, "exec", "-T", "postgres", "psql", "-U", user, "-d", db, "-Atc", "SELECT COUNT(*) FROM schema_migrations"], { env: pgEnv, label: "schema query" }).trim());
  const objectPaths = listFiles(staging, "objects"); const artifacts = [await artifact(staging, "db.dump")];
  for (const path of objectPaths) artifacts.push(await artifact(staging, path));
  const manifest = { format: "openspace-backup", version: 1, createdAt: new Date().toISOString(), source: { release: process.env.OPENSPACE_RELEASE || env.OPENSPACE_RELEASE || "unknown", gitRevision: process.env.OPENSPACE_GIT_REVISION || "unknown" }, consistency: { startedAt: consistencyStart, completedAt: consistencyEnd }, database: { path: "db.dump", bytes: statSync(join(staging, "db.dump")).size, schemaMigrations: schemaCount }, objects: { directory: "objects", bucket, count: objectPaths.length, bytes: artifacts.slice(1).reduce((n, x) => n + x.size, 0) }, artifacts };
  finalizeBundle(staging, finalPath, manifest); staging = undefined;
  await verifyBundle(finalPath);
  try { const sql=`INSERT INTO backup_log(manifest_path,db_size_bytes,schema_version,env,status) VALUES('${finalPath.replaceAll("'","''")}',${manifest.database.bytes},${manifest.database.schemaMigrations},'${(env.APP_ENV||"dev").replaceAll("'","''")}','ok')`; run("docker",[...compose,"exec","-T","postgres","psql","-U",user,"-d",db,"-v","ON_ERROR_STOP=1","-c",sql],{env:pgEnv,label:"backup metrics record"}); } catch(error) { console.warn(`backup_metrics_record_failed=${error.message}`); }
  let offHost = "not-configured";
  if (options.transfer) { const parts = options.transfer.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((x) => x.replace(/^"|"$/g, "")) || []; if (!parts.length) throw new Error("empty transfer command"); run(parts[0], [...parts.slice(1), finalPath], { stdio: "inherit", label: "off-host transfer" }); offHost = "complete"; }
  const removed = await applyRetention(root, options.retention);
  const result = { ok: true, bundle: finalPath, durationSeconds: (Date.now() - started) / 1000, databaseBytes: manifest.database.bytes, objectBytes: manifest.objects.bytes, objectCount: manifest.objects.count, offHost, retentionRemoved: removed.length };
  writeFileSync(join(finalPath, "result.json"), JSON.stringify(result, null, 2) + "\n", { mode: 0o600 }); console.log(JSON.stringify(result));
} catch (error) {
  if (staging) writeFileSync(join(staging, "FAILED"), `${new Date().toISOString()} ${error.message}\n`, { mode: 0o600 });
  console.error(JSON.stringify({ ok: false, phase: "backup", error: error.message, incompleteBundle: staging })); process.exit(1);
}
