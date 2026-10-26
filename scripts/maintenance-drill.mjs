#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const file = resolve("scripts/tests/fixtures/maintenance-compose.yml");
const compose = ["compose", "-f", file];
const run = (args, capture = false) => execFileSync("docker", [...compose, ...args], {
  stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  encoding: capture ? "utf8" : undefined,
});
const sql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE sessions(id uuid primary key default gen_random_uuid(),expires_at timestamptz not null);
CREATE TABLE pairing_tokens(id uuid primary key default gen_random_uuid(),expires_at timestamptz not null);
CREATE TABLE relay_transfers(id uuid primary key default gen_random_uuid(),expires_at timestamptz not null);
CREATE TABLE attachments(id uuid primary key default gen_random_uuid(),object_key text not null,status text not null,created_at timestamptz not null);
CREATE TABLE push_tokens(id uuid primary key default gen_random_uuid(),created_at timestamptz not null);
CREATE TABLE messages(id uuid primary key default gen_random_uuid(),created_at timestamptz not null);
CREATE TABLE audit_log(id bigserial primary key,created_at timestamptz not null);
CREATE TABLE server_identities(id uuid primary key);
CREATE TABLE maintenance_policy(singleton boolean primary key,message_retention_days int,audit_retention_days int,push_token_retention_days int,orphan_grace_hours int,updated_at timestamptz,updated_by uuid);
INSERT INTO maintenance_policy VALUES(true,NULL,NULL,NULL,24,NOW(),NULL);
CREATE TABLE maintenance_runs(id bigserial primary key,job_name text,started_at timestamptz default now(),finished_at timestamptz,status text,attempt int default 1,examined bigint default 0,affected bigint default 0,error_category text default '',metadata jsonb default '{}');
CREATE TABLE maintenance_dead_letters(id bigserial primary key,job_name text,run_id bigint,error_category text,attempts int,created_at timestamptz default now());
INSERT INTO sessions(expires_at) VALUES(NOW()-interval '1 hour'),(NOW()+interval '1 hour');
INSERT INTO pairing_tokens(expires_at) VALUES(NOW()-interval '1 hour');
INSERT INTO relay_transfers(expires_at) VALUES(NOW()-interval '1 hour');
INSERT INTO attachments(object_key,status,created_at) VALUES('referenced.txt','ready',NOW()-interval '2 days'),('abandoned.txt','pending',NOW()-interval '2 days');`;

try {
  run(["up", "-d", "--wait", "postgres", "minio"]);
  run(["exec", "-T", "postgres", "psql", "-U", "openspace", "-d", "openspace", "-v", "ON_ERROR_STOP=1", "-c", sql]);
  run(["run", "--rm", "-T", "--no-deps", "--entrypoint", "/bin/sh", "minio-init", "-ec", 'mc alias set local http://minio:9000 drill-access drill-secret >/dev/null; mc mb --ignore-existing local/openspace; printf ref >/tmp/ref; printf orphan >/tmp/orphan; mc cp /tmp/ref local/openspace/referenced.txt; mc cp /tmp/orphan local/openspace/orphan.txt; mc cp /tmp/orphan local/openspace/abandoned.txt']);
  // Production enforces >=24h. The isolated fixture accelerates time so the
  // deletion path can be exercised; the grace invariant has a separate unit test.
  // Set this before starting the worker so its eager first run cannot observe
  // the fixture's production-like 24-hour value and race the assertion loop.
  run(["exec", "-T", "postgres", "psql", "-U", "openspace", "-d", "openspace", "-c", "UPDATE maintenance_policy SET orphan_grace_hours=0"]);
  run(["up", "-d", "--build", "worker"]);
  const deadline = Date.now() + 45000;
  let result = "";
  do {
    await new Promise((done) => setTimeout(done, 1000));
    result = run(["exec", "-T", "postgres", "psql", "-U", "openspace", "-d", "openspace", "-Atc", "SELECT (SELECT count(*) FROM sessions),(SELECT count(*) FROM pairing_tokens),(SELECT count(*) FROM relay_transfers),(SELECT count(*) FROM maintenance_runs WHERE status='succeeded')"], true).trim();
  } while (Date.now() < deadline && !/^1\|0\|0\|[4-9]/.test(result));
  if (!/^1\|0\|0\|[4-9]/.test(result)) throw new Error(`cleanup assertion failed: ${result}`);
  const inventory = run(["run", "--rm", "-T", "--no-deps", "--entrypoint", "/bin/sh", "minio-init", "-ec", "mc alias set local http://minio:9000 drill-access drill-secret >/dev/null; mc ls --recursive --json local/openspace"], true);
  const objects = inventory.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line).key);
  if (!objects.includes("referenced.txt") || objects.includes("orphan.txt") || objects.includes("abandoned.txt")) throw new Error(`object assertion failed: ${objects.join(",")}`);
  run(["exec", "-T", "postgres", "psql", "-U", "openspace", "-d", "openspace", "-c", "DROP TABLE pairing_tokens"]);
  let deadLetters = 0;
  const failureDeadline = Date.now() + 15000;
  do {
    await new Promise((done) => setTimeout(done, 1000));
    deadLetters = Number(run(["exec", "-T", "postgres", "psql", "-U", "openspace", "-d", "openspace", "-Atc", "SELECT count(*) FROM maintenance_dead_letters WHERE job_name='expired_pairing_tokens' AND attempts=1"], true).trim());
  } while (Date.now() < failureDeadline && deadLetters === 0);
  if (deadLetters === 0) throw new Error("dead-letter assertion failed");
  console.log(JSON.stringify({ ok: true, database: result, referencedPreserved: true, orphanRemoved: true, deadLetterRecorded: true }));
} finally {
  try { run(["down", "-v", "--remove-orphans"]); } catch { /* preserve primary failure */ }
}
