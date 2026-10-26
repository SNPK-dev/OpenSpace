import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const FORMAT = "openspace-backup";
export const FORMAT_VERSION = 1;

export function parseEnv(filePath) {
  const abs = resolve(filePath);
  if (!existsSync(abs)) throw new Error(`env file not found: ${abs}`);
  const result = {};
  for (const line of readFileSync(abs, "utf8").split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith("#")) continue;
    const eq = value.indexOf("=");
    if (eq < 1) continue;
    result[value.slice(0, eq).trim()] = value.slice(eq + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return result;
}

export function composeArgs(env, envPath) {
  const args = ["compose"];
  if (process.env.OPENSPACE_COMPOSE_PROJECT_NAME) args.push("-p", process.env.OPENSPACE_COMPOSE_PROJECT_NAME);
  if (process.env.OPENSPACE_COMPOSE_FILE) args.push("-f", resolve(process.env.OPENSPACE_COMPOSE_FILE));
  else if (env.APP_ENV === "production") args.push("-f", "docker-compose.prod.yml");
  args.push("--env-file", resolve(envPath));
  if (process.env.OPENSPACE_IMAGES_ENV) args.push("--env-file", resolve(process.env.OPENSPACE_IMAGES_ENV));
  return args;
}

export function confinedPath(root, manifestPath) {
  if (typeof manifestPath !== "string" || !manifestPath || isAbsolute(manifestPath)) throw new Error(`unsafe artifact path: ${manifestPath}`);
  const rootAbs = resolve(root);
  const target = resolve(rootAbs, manifestPath);
  if (target !== rootAbs && !target.startsWith(rootAbs + sep)) throw new Error(`artifact path escapes bundle: ${manifestPath}`);
  return target;
}

export function ensurePrivateDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  try {
    if (process.platform !== "win32" && (statSync(path).mode & 0o077) !== 0) throw new Error(`backup directory is accessible by group/others: ${path}`);
  } catch (error) {
    if (error.code) throw error;
  }
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: options.stdio ?? ["ignore", "pipe", "pipe"], env: options.env ?? process.env, cwd: options.cwd });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${options.label ?? command} failed (${result.status}): ${(result.stderr || "").trim()}`);
  return result.stdout ?? "";
}

export function streamToFile(command, args, destination, options = {}) {
  mkdirSync(dirname(destination), { recursive: true });
  return new Promise((resolvePromise, reject) => {
    const output = createWriteStream(destination, { mode: 0o600 });
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: options.env ?? process.env, cwd: options.cwd });
    let stderr = "";
    child.stderr.on("data", (chunk) => { if (stderr.length < 65536) stderr += chunk; });
    child.on("error", reject); output.on("error", reject); child.stdout.pipe(output);
    child.on("close", (code) => output.close(() => code === 0 ? resolvePromise() : reject(new Error(`${options.label ?? command} failed (${code}): ${stderr.trim()}`))));
  });
}

export async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export function listFiles(root, prefix = "") {
  const base = confinedPath(root, prefix || ".");
  if (!existsSync(base)) return [];
  const files = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    const rel = join(prefix, entry.name).replaceAll("\\", "/");
    const absolute = confinedPath(root, rel);
    if (entry.isSymbolicLink()) throw new Error(`symlinks are forbidden in bundles: ${rel}`);
    if (entry.isDirectory()) files.push(...listFiles(root, rel));
    else if (entry.isFile()) files.push(rel);
    else throw new Error(`unsupported bundle entry: ${rel}`);
  }
  return files.sort();
}

export async function artifact(root, path) {
  const absolute = confinedPath(root, path);
  return { path: path.replaceAll("\\", "/"), size: statSync(absolute).size, sha256: await sha256(absolute) };
}

export function readManifest(bundle) {
  const path = confinedPath(bundle, "manifest.json");
  if (!existsSync(path)) throw new Error("manifest.json is missing");
  let manifest;
  try { manifest = JSON.parse(readFileSync(path, "utf8")); } catch (error) { throw new Error(`invalid manifest JSON: ${error.message}`); }
  if (manifest.format !== FORMAT || manifest.version !== FORMAT_VERSION) throw new Error(`unsupported backup format/version: ${manifest.format}/${manifest.version}`);
  if (!manifest.createdAt || !manifest.database || !manifest.objects || !Array.isArray(manifest.artifacts)) throw new Error("manifest is missing required fields");
  return manifest;
}

export async function verifyBundle(bundlePath) {
  const bundle = resolve(bundlePath);
  if (!existsSync(bundle) || !lstatSync(bundle).isDirectory()) throw new Error(`bundle directory not found: ${bundle}`);
  if (existsSync(join(bundle, "INCOMPLETE")) || !existsSync(join(bundle, "COMPLETE"))) throw new Error("bundle is incomplete");
  const manifest = readManifest(bundle);
  const seen = new Set();
  for (const item of manifest.artifacts) {
    if (!item || seen.has(item.path)) throw new Error(`duplicate/invalid artifact: ${item?.path}`);
    seen.add(item.path);
    const absolute = confinedPath(bundle, item.path);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new Error(`artifact is missing: ${item.path}`);
    if (statSync(absolute).size !== item.size) throw new Error(`artifact size mismatch: ${item.path}`);
    if (await sha256(absolute) !== item.sha256) throw new Error(`artifact hash mismatch: ${item.path}`);
  }
  if (!seen.has(manifest.database.path)) throw new Error("database artifact is not covered by integrity metadata");
  const actualObjects = listFiles(bundle, "objects");
  if (actualObjects.length !== manifest.objects.count || actualObjects.some((path) => !seen.has(path))) throw new Error("object inventory mismatch");
  return manifest;
}

export function finalizeBundle(staging, finalPath, manifest) {
  writeFileSync(join(staging, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  writeFileSync(join(staging, "COMPLETE"), `${new Date().toISOString()}\n`, { mode: 0o600 });
  rmSync(join(staging, "INCOMPLETE"), { force: true });
  renameSync(staging, finalPath);
}

export async function completedBundles(root) {
  const rootAbs = resolve(root);
  if (!existsSync(rootAbs)) return [];
  const selected = [];
  for (const entry of readdirSync(rootAbs, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.endsWith(".incomplete")) continue;
    const path = confinedPath(rootAbs, entry.name);
    try { selected.push({ path, manifest: await verifyBundle(path) }); } catch { /* invalid bundles are never retention candidates */ }
  }
  return selected.sort((a, b) => Date.parse(b.manifest.createdAt) - Date.parse(a.manifest.createdAt));
}

function weekKey(date) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return `${value.getUTCFullYear()}-W${String(Math.ceil((((value - yearStart) / 86400000) + 1) / 7)).padStart(2, "0")}`;
}

export function retentionSelection(candidates, policy) {
  const limits = { daily: Number(policy.daily ?? 7), weekly: Number(policy.weekly ?? 4), monthly: Number(policy.monthly ?? 6) };
  if (Object.values(limits).some((value) => !Number.isInteger(value) || value < 0) || Object.values(limits).every((value) => value === 0)) throw new Error("retention tiers must be non-negative and keep at least one recovery point");
  const keep = new Set();
  for (const [tier, limit] of Object.entries(limits)) {
    const keys = new Set();
    for (const item of candidates) {
      const date = new Date(item.manifest.createdAt);
      const key = tier === "daily" ? date.toISOString().slice(0, 10) : tier === "weekly" ? weekKey(date) : date.toISOString().slice(0, 7);
      if (!keys.has(key) && keys.size < limit) { keys.add(key); keep.add(item.path); }
    }
  }
  return { keep: candidates.filter((item) => keep.has(item.path)), remove: candidates.filter((item) => !keep.has(item.path)) };
}

export async function applyRetention(root, policy) {
  const candidates = await completedBundles(root);
  const selection = typeof policy === "number"
    ? { keep: candidates.slice(0, policy), remove: candidates.slice(policy) }
    : retentionSelection(candidates, policy);
  const removed = [];
  for (const item of selection.remove) {
    const canonicalRoot = realpathSync(resolve(root));
    const canonicalParent = realpathSync(dirname(item.path));
    if (canonicalParent !== canonicalRoot || relative(canonicalRoot, item.path).startsWith("..")) throw new Error(`refusing retention outside backup root: ${item.path}`);
    rmSync(item.path, { recursive: true });
    removed.push(item.path);
  }
  return removed;
}
