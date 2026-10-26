import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "infra/caddy/Caddyfile.prod",
  "infra/coturn/turnserver.conf.prod",
  "infra/livekit/livekit.yaml.prod",
  "scripts/render-prod-configs.mjs",
  "scripts/check-domain.mjs",
];

const missing = requiredFiles.filter((f) => !existsSync(f));
if (missing.length > 0) {
  console.error(`Missing prod infra files:\n${missing.join("\n")}`);
  process.exit(1);
}

// Caddyfile.prod must have HTTPS and ACME directives
const caddyProd = readFileSync("infra/caddy/Caddyfile.prod", "utf8");
for (const token of ["email", "Strict-Transport-Security", "redir https"]) {
  if (!caddyProd.includes(token)) {
    console.error(`Caddyfile.prod missing required directive: ${token}`);
    process.exit(1);
  }
}
for (const token of ["{$FILES_DOMAIN}", "reverse_proxy minio:9000"]) {
  if (!caddyProd.includes(token)) {
    console.error(`Caddyfile.prod missing public object-storage directive: ${token}`);
    process.exit(1);
  }
}

// turnserver.conf.prod must have TURNS and cert directives
const coturnProd = readFileSync("infra/coturn/turnserver.conf.prod", "utf8");
for (const token of ["tls-listening-port", "cert=", "pkey="]) {
  if (!coturnProd.includes(token)) {
    console.error(`turnserver.conf.prod missing required directive: ${token}`);
    process.exit(1);
  }
}

// LiveKit must use external addresses and shared Redis state. TURN credentials
// are issued by the API; unsupported rtc.turn_* fields make LiveKit fail closed.
const livekitProd = readFileSync("infra/livekit/livekit.yaml.prod", "utf8");
for (const token of ["use_external_ip", "redis:", "address: redis:6379"]) {
  if (!livekitProd.includes(token)) {
    console.error(`livekit.yaml.prod missing required directive: ${token}`);
    process.exit(1);
  }
}
for (const invalidToken of ["turn_address", "turn_tls_port"]) {
  if (livekitProd.includes(invalidToken)) {
    console.error(`livekit.yaml.prod contains unsupported directive: ${invalidToken}`);
    process.exit(1);
  }
}

// render-prod-configs.mjs must write to .generated/prod/
const renderProd = readFileSync("scripts/render-prod-configs.mjs", "utf8");
if (!renderProd.includes(".generated/prod/")) {
  console.error("render-prod-configs.mjs must write to .generated/prod/");
  process.exit(1);
}

// check-domain.mjs must include DNS and TLS checks
const checkDomain = readFileSync("scripts/check-domain.mjs", "utf8");
for (const token of ["dns", "TLS cert", "tcpProbe"]) {
  if (!checkDomain.includes(token)) {
    console.error(`check-domain.mjs missing check: ${token}`);
    process.exit(1);
  }
}

// docker-compose must expose TURNS port and have caddy-data volume
const compose = readFileSync("docker-compose.yml", "utf8");
if (!compose.includes("5349")) {
  console.error("docker-compose.yml must expose coturn TURNS port 5349");
  process.exit(1);
}
if (!compose.includes("caddy-data")) {
  console.error("docker-compose.yml must declare caddy-data volume for cert persistence");
  process.exit(1);
}

// docker-compose.prod.yml must exist and reference .generated/prod/
if (!existsSync("docker-compose.prod.yml")) {
  console.error("Missing docker-compose.prod.yml");
  process.exit(1);
}
const prodCompose = readFileSync("docker-compose.prod.yml", "utf8");
if (!prodCompose.includes(".generated/prod/")) {
  console.error("docker-compose.prod.yml must reference .generated/prod/ mounts");
  process.exit(1);
}
for (const token of ["STORAGE_PUBLIC_ENDPOINT", "STORAGE_PUBLIC_USE_SSL", "MINIO_API_CORS_ALLOW_ORIGIN"]) {
  if (!prodCompose.includes(token)) {
    console.error(`docker-compose.prod.yml missing browser-safe object-storage setting: ${token}`);
    process.exit(1);
  }
}
const upstreamImageLines = prodCompose.split(/\r?\n/).filter((line) => /^\s+image:\s+(?!\$\{OPENSPACE_)/.test(line));
for (const line of upstreamImageLines) {
  if (!/@sha256:[a-f0-9]{64}\s*$/.test(line)) {
    console.error(`docker-compose.prod.yml contains a mutable upstream image: ${line.trim()}`);
    process.exit(1);
  }
}

// rotate-turn-secret.mjs must exist and use crypto.randomBytes
if (!existsSync("scripts/rotate-turn-secret.mjs")) {
  console.error("Missing scripts/rotate-turn-secret.mjs");
  process.exit(1);
}
const rotateScript = readFileSync("scripts/rotate-turn-secret.mjs", "utf8");
if (!rotateScript.includes("randomBytes")) {
  console.error("rotate-turn-secret.mjs must use crypto.randomBytes");
  process.exit(1);
}

// diagnose-turn.mjs must exist and implement STUN probe
if (!existsSync("scripts/diagnose-turn.mjs")) {
  console.error("Missing scripts/diagnose-turn.mjs");
  process.exit(1);
}
const diagnoseScript = readFileSync("scripts/diagnose-turn.mjs", "utf8");
if (!diagnoseScript.includes("XOR-MAPPED") && !diagnoseScript.includes("stun")) {
  console.error("diagnose-turn.mjs must implement STUN probe");
  process.exit(1);
}

// operator runbook must exist
if (!existsSync("docs/runbooks/domain-tls-turn.md")) {
  console.error("Missing docs/runbooks/domain-tls-turn.md");
  process.exit(1);
}

console.log("Prod infra baseline OK.");
