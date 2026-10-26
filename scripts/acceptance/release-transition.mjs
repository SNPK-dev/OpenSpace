import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../lib/backup-bundle.mjs";

const args = process.argv.slice(2);
const previous = args[args.indexOf("--previous") + 1];
const mode = args.includes("--upgrade-only") ? "upgrade" : args.includes("--rollback-only") ? "rollback" : "";
if (!previous || previous.startsWith("--")) throw new Error("--previous <stable-tag> is required");
if (!mode) throw new Error("--upgrade-only or --rollback-only is required");

const root = resolve(".");
const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(process.env.OPENSPACE_TRANSITION_ENV ?? ".env.example");
const statePath = resolve(process.env.OPENSPACE_TRANSITION_STATE ?? ".acceptance/release-transition.json");
const compose = ["compose", "--env-file", envPath];

function git(...gitArgs) { return run("git", gitArgs, { cwd: root, label: `git ${gitArgs[0]}` }).trim(); }
function docker(...dockerArgs) { return run("docker", dockerArgs, { cwd: root, stdio: "inherit", label: `docker ${dockerArgs.slice(0, 2).join(" ")}` }); }
function query(sql) { return run("docker", [...compose, "exec", "-T", "postgres", "psql", "-U", "openspace", "-d", "openspace", "-Atc", sql], { cwd: root, label: "transition database assertion" }).trim(); }
function objectProof() { return run("docker", [...compose, "run", "--rm", "-T", "--no-deps", "--entrypoint", "/bin/sh", "minio-init", "-ec", 'mc alias set local http://minio:9000 "$OBJECT_STORAGE_ACCESS_KEY" "$OBJECT_STORAGE_SECRET_KEY" >/dev/null; mc cat "local/$OBJECT_STORAGE_BUCKET/transition-proof.txt"'], { cwd: root, label: "transition object assertion" }).trim(); }
function writeState(value) { mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 }); writeFileSync(statePath, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 }); }

async function seed(token) {
  const headers = { "content-type": "application/json", authorization: `Bearer ${token}` };
  const roomResponse = await fetch("http://localhost:8080/api/v1/rooms", { method: "POST", headers, body: JSON.stringify({ name: "Release transition proof" }) });
  if (roomResponse.status !== 201) throw new Error(`transition room create failed: ${roomResponse.status}`);
  const room = await roomResponse.json();
  const channelResponse = await fetch(`http://localhost:8080/api/v1/rooms/${room.id}/channels`, { method: "POST", headers, body: JSON.stringify({ name: "proof", type: "text" }) });
  if (channelResponse.status !== 201) throw new Error(`transition channel create failed: ${channelResponse.status}`);
  const channel = await channelResponse.json();
  const messageResponse = await fetch(`http://localhost:8080/api/v1/rooms/${room.id}/channels/${channel.id}/messages`, { method: "POST", headers, body: JSON.stringify({ content: "release-transition-proof" }) });
  if (messageResponse.status !== 201) throw new Error(`transition message create failed: ${messageResponse.status}`);
  docker(...compose, "run", "--rm", "-T", "--no-deps", "--entrypoint", "/bin/sh", "minio-init", "-ec", 'mc alias set local http://minio:9000 "$OBJECT_STORAGE_ACCESS_KEY" "$OBJECT_STORAGE_SECRET_KEY" >/dev/null; printf transition-object >/tmp/proof; mc cp /tmp/proof "local/$OBJECT_STORAGE_BUCKET/transition-proof.txt"');
  return { messageCount: Number(query("SELECT count(*) FROM messages WHERE content='release-transition-proof'")), object: "transition-object" };
}

if (mode === "upgrade") {
  git("cat-file", "-e", `${previous}^{commit}`);
  const candidate = git("rev-parse", "HEAD");
  const tools = mkdtempSync(join(tmpdir(), "openspace-transition-tools-"));
  cpSync(scriptRoot, join(tools, "scripts"), { recursive: true });
  mkdirSync(resolve(root, ".git", "info"), { recursive: true });
  const excludePath = resolve(root, ".git", "info", "exclude");
  const existingExclude = existsSync(excludePath) ? readFileSync(excludePath, "utf8") : "";
  writeFileSync(excludePath, `${existingExclude}\n.acceptance/\n.openspace/\n.transition.env\n`);
  docker(...compose, "down", "-v", "--remove-orphans");
  run("git", ["checkout", "--detach", previous], { cwd: root, stdio: "inherit", label: "previous release checkout" });
  run(process.execPath, [join(tools, "scripts", "render-dev-configs.mjs"), envPath], { cwd: root, stdio: "inherit", label: "previous config render" });
  docker(...compose, "up", "-d", "--build", "postgres", "redis", "minio", "minio-init", "livekit", "coturn", "api", "realtime-gateway", "worker");
  run(process.execPath, [join(tools, "scripts", "acceptance", "bootstrap.mjs")], { cwd: root, stdio: "inherit", label: "previous release bootstrap" });
  const token = readFileSync(resolve(root, ".acceptance", "admin-token"), "utf8").trim();
  const proof = await seed(token);
  writeState({ schema: "openspace.release-transition/v1", previousRevision: git("rev-parse", "HEAD"), candidateRevision: candidate, tools, proof });
  run(process.execPath, [join(tools, "scripts", "upgrade.mjs"), "--target", candidate, "--env", envPath, "--root", resolve(root, ".acceptance", "transition-backups")], { cwd: root, stdio: "inherit", label: "previous-version upgrade" });
  if (git("rev-parse", "HEAD") !== candidate) throw new Error("upgrade did not checkout the candidate revision");
  if (Number(query("SELECT count(*) FROM messages WHERE content='release-transition-proof'")) !== proof.messageCount || objectProof() !== proof.object) throw new Error("upgrade data assertion failed");
  console.log(JSON.stringify({ ok: true, mode, previous, candidate, proof }));
} else {
  if (!existsSync(statePath)) throw new Error(`transition state missing: ${statePath}`);
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const rollbackTool = join(state.tools, "scripts", "rollback.mjs");
  run(process.execPath, [rollbackTool, "--yes"], { cwd: root, stdio: "inherit", label: "release rollback" });
  if (git("rev-parse", "HEAD") !== state.previousRevision) throw new Error("rollback did not restore the previous revision");
  if (Number(query("SELECT count(*) FROM messages WHERE content='release-transition-proof'")) !== state.proof.messageCount || objectProof() !== state.proof.object) throw new Error("rollback data assertion failed");
  console.log(JSON.stringify({ ok: true, mode, restoredRevision: state.previousRevision, proof: state.proof }));
}
