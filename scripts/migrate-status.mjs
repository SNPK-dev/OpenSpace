#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const envPath = process.argv[2] || ".env";
const migrationsDir = "apps/server-api/internal/migrate/sql";

function parseEnv(filePath) {
  const abs = resolve(filePath);
  if (!existsSync(abs)) {
    console.error(`Error: env file not found: ${abs}`);
    process.exit(1);
  }
  const result = {};
  for (const line of readFileSync(abs, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    result[key] = val;
  }
  return result;
}

const env = parseEnv(envPath);
const user = env.POSTGRES_USER;
const pass = env.POSTGRES_PASSWORD;
const db = env.POSTGRES_DB;

if (!user || !db) {
  console.error("Error: POSTGRES_USER and POSTGRES_DB must be set in .env");
  process.exit(1);
}

const knownFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

// Migration runner stores names as "sql/001_create_servers.sql" (full embed path)
let appliedSet = new Set();
try {
  const out = execFileSync("docker", [
    "compose", "exec", "-T", "postgres",
    "psql", "-U", user, "-d", db, "-Atc",
    "SELECT name FROM schema_migrations ORDER BY name",
  ], { env: { ...process.env, PGPASSWORD: pass }, encoding: "utf8" });
  appliedSet = new Set(out.trim().split("\n").filter(Boolean));
} catch (err) {
  console.error(`Error: could not query schema_migrations: ${err.message}`);
  process.exit(1);
}

const COL = 44;
console.log(`${"Migration".padEnd(COL)} Status`);
console.log("─".repeat(COL + 10));

let applied = 0;
let pending = 0;
for (const file of knownFiles) {
  const displayName = file.replace(".sql", "");
  const dbName = `sql/${file}`;
  const status = appliedSet.has(dbName) ? "applied" : "pending";
  if (status === "applied") applied++;
  else pending++;
  console.log(`${displayName.padEnd(COL)} ${status}`);
}

console.log("");
console.log(`${applied} applied, ${pending} pending`);
