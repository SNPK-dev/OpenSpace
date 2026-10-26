/**
 * Renders production infrastructure configs from an env file into .generated/prod/.
 * Usage: node scripts/render-prod-configs.mjs [path/to/.env]
 *
 * Reads infra/caddy/Caddyfile.prod, infra/coturn/turnserver.conf.prod,
 * infra/livekit/livekit.yaml.prod and writes rendered versions to:
 *   .generated/prod/caddy/Caddyfile
 *   .generated/prod/coturn/turnserver.conf
 *   .generated/prod/livekit/livekit.yaml
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const envPath = process.argv[2] ?? ".env";

const parseEnv = (path) => {
  const values = {};
  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    values[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return values;
};

const env = parseEnv(envPath);

const require = (key) => {
  const v = env[key];
  if (!v) throw new Error(`Missing required env key: ${key}`);
  return v;
};

const optional = (key, fallback) => env[key] ?? fallback;

const write = (path, content) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
};

// ── Derive domain from PUBLIC_BASE_URL ──────────────────────────────────────
const publicBaseUrl = require("PUBLIC_BASE_URL");
let prodDomain;
try {
  prodDomain = new URL(publicBaseUrl).hostname;
} catch {
  throw new Error(`PUBLIC_BASE_URL is not a valid URL: ${publicBaseUrl}`);
}

// ── Caddy ────────────────────────────────────────────────────────────────────
const caddyTemplate = readFileSync("infra/caddy/Caddyfile.prod", "utf8");
const caddyRendered = caddyTemplate
  .replace(/\{\$CADDY_EMAIL\}/g, require("CADDY_EMAIL"))
  .replace(/\{\$PROD_DOMAIN\}/g, prodDomain)
  .replace(/\{\$FILES_DOMAIN\}/g, require("OBJECT_STORAGE_PUBLIC_ENDPOINT"));

write(".generated/prod/caddy/Caddyfile", caddyRendered);

// ── Coturn ───────────────────────────────────────────────────────────────────
const certBase =
  `/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/${prodDomain}/${prodDomain}`;

const coturnTemplate = readFileSync("infra/coturn/turnserver.conf.prod", "utf8");
const coturnRendered = coturnTemplate
  .replace("MIN_PORT_PLACEHOLDER", optional("TURN_RELAY_PORT_START", "50000"))
  .replace("MAX_PORT_PLACEHOLDER", optional("TURN_RELAY_PORT_END", "50100"))
  .replace("SECRET_PLACEHOLDER", require("TURN_SECRET"))
  .replace("REALM_PLACEHOLDER", require("TURN_REALM"))
  .replace("CERT_PATH_PLACEHOLDER", `${certBase}.crt`)
  .replace("KEY_PATH_PLACEHOLDER", `${certBase}.key`);

write(".generated/prod/coturn/turnserver.conf", coturnRendered);

// ── LiveKit ──────────────────────────────────────────────────────────────────
const livekitTemplate = readFileSync("infra/livekit/livekit.yaml.prod", "utf8");
const livekitRendered = livekitTemplate
  .replace("LIVEKIT_KEY_PLACEHOLDER", require("LIVEKIT_API_KEY"))
  .replace("LIVEKIT_SECRET_PLACEHOLDER", require("LIVEKIT_API_SECRET"))
  .replace("LOG_LEVEL_PLACEHOLDER", optional("LOG_LEVEL", "info"));

write(".generated/prod/livekit/livekit.yaml", livekitRendered);

console.log(`Rendered production configs from ${envPath} for domain: ${prodDomain}`);
console.log("  .generated/prod/caddy/Caddyfile");
console.log("  .generated/prod/coturn/turnserver.conf");
console.log("  .generated/prod/livekit/livekit.yaml");
