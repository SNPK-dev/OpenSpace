/**
 * Pre-deployment domain/TLS/TURN readiness checker.
 * Usage: node scripts/check-domain.mjs [path/to/.env]
 *
 * Checks:
 *   1. PUBLIC_BASE_URL resolves (DNS)
 *   2. HTTPS cert is valid and not expiring within 14 days
 *   3. /healthz endpoint returns 200
 *   4. TURN port (TCP) is reachable
 *   5. TURNS port (TCP 5349) is reachable
 *
 * Exits 0 if all checks pass, 1 otherwise.
 */

import { readFileSync } from "node:fs";
import { createConnection } from "node:net";
import https from "node:https";
import dns from "node:dns/promises";

const envPath = process.argv[2] ?? ".env";

const parseEnv = (path) => {
  const values = {};
  try {
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      values[trimmed.slice(0, index)] = trimmed.slice(index + 1);
    }
  } catch {
    console.error(`Cannot read env file: ${path}`);
    process.exit(1);
  }
  return values;
};

const env = parseEnv(envPath);
const publicBaseUrl = env.PUBLIC_BASE_URL ?? "";
const turnHost = env.TURN_HOST ?? "";
const turnPort = parseInt(env.TURN_PORT ?? "3478", 10);
const turnTlsPort = parseInt(env.TURN_TLS_PORT ?? "5349", 10);
const filesDomain = env.OBJECT_STORAGE_PUBLIC_ENDPOINT ?? "";

let domain;
try {
  domain = new URL(publicBaseUrl).hostname;
} catch {
  console.error(`PUBLIC_BASE_URL is not a valid URL: ${publicBaseUrl}`);
  process.exit(1);
}

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✓ ${label}`);
  passed++;
}

function fail(label, detail) {
  console.log(`  ✗ ${label}${detail ? `: ${detail}` : ""}`);
  failed++;
}

// ── 1. DNS ───────────────────────────────────────────────────────────────────
console.log("\n[1] DNS");
try {
  const addrs = await dns.resolve4(domain);
  ok(`${domain} → ${addrs[0]}`);
} catch (err) {
  fail(`DNS resolve failed for ${domain}`, String(err.code ?? err.message));
}

// ── 2. HTTPS cert ────────────────────────────────────────────────────────────
console.log("\n[2] HTTPS certificate");
await new Promise((resolve) => {
  const req = https.request(
    { hostname: domain, port: 443, path: "/", method: "HEAD", timeout: 10_000 },
    (res) => {
      const cert = res.socket.getPeerCertificate();
      if (!cert || !cert.valid_to) {
        fail("TLS cert info unavailable");
        resolve();
        return;
      }
      const expiresAt = new Date(cert.valid_to);
      const daysLeft = Math.floor((expiresAt - Date.now()) / 86_400_000);
      if (daysLeft < 0) {
        fail("TLS cert EXPIRED", cert.valid_to);
      } else if (daysLeft < 14) {
        fail(`TLS cert expires in ${daysLeft} days — renew soon`, cert.valid_to);
      } else {
        ok(`TLS cert valid, expires ${expiresAt.toISOString().slice(0, 10)} (${daysLeft}d)`);
      }
      resolve();
    }
  );
  req.on("error", (err) => { fail("HTTPS connection failed", err.message); resolve(); });
  req.on("timeout", () => { fail("HTTPS connection timed out"); req.destroy(); resolve(); });
  req.end();
});

// ── 3. /healthz ──────────────────────────────────────────────────────────────
console.log("\n[3] API health check");
await new Promise((resolve) => {
  const req = https.request(
    { hostname: domain, port: 443, path: "/healthz", method: "GET", timeout: 10_000 },
    (res) => {
      let body = "";
      res.on("data", (d) => { body += d; });
      res.on("end", () => {
        if (res.statusCode === 200) {
          ok(`GET /healthz → ${res.statusCode}`);
        } else {
          fail(`GET /healthz returned ${res.statusCode}`, body.trim().slice(0, 80));
        }
        resolve();
      });
    }
  );
  req.on("error", (err) => { fail("/healthz request failed", err.message); resolve(); });
  req.on("timeout", () => { fail("/healthz timed out"); req.destroy(); resolve(); });
  req.end();
});

// ── TCP probe helper ─────────────────────────────────────────────────────────
console.log("\n[4] Object storage DNS/TLS");
if (!filesDomain || filesDomain.includes("://") || filesDomain.includes("/")) {
  fail("OBJECT_STORAGE_PUBLIC_ENDPOINT must be a host[:port] without scheme or path");
} else {
  const filesHost = filesDomain.split(":")[0];
  try {
    const addrs = await dns.resolve4(filesHost);
    ok(`${filesDomain} resolves to ${addrs[0]}`);
  } catch (err) {
    fail(`DNS resolve failed for ${filesDomain}`, String(err.code ?? err.message));
  }
  await new Promise((resolve) => {
    const req = https.request({ hostname: filesHost, port: 443, path: "/minio/health/live", method: "GET", timeout: 10_000 }, (res) => {
      const cert = res.socket.getPeerCertificate();
      if (res.statusCode === 200 && cert?.valid_to && new Date(cert.valid_to).getTime() - Date.now() >= 14 * 86_400_000) ok(`storage TLS and health passed for ${filesDomain}`);
      else fail(`storage TLS/health failed for ${filesDomain}`, `status=${res.statusCode ?? "none"}`);
      res.resume(); resolve();
    });
    req.on("error", err => { fail("storage HTTPS connection failed", err.message); resolve(); });
    req.on("timeout", () => { fail("storage HTTPS connection timed out"); req.destroy(); resolve(); });
    req.end();
  });
}

function tcpProbe(host, port, label) {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port, timeout: 8_000 }, () => {
      ok(`${label} TCP ${host}:${port} reachable`);
      sock.destroy();
      resolve();
    });
    sock.on("timeout", () => {
      fail(`${label} TCP ${host}:${port} timed out`);
      sock.destroy();
      resolve();
    });
    sock.on("error", (err) => {
      fail(`${label} TCP ${host}:${port} unreachable`, err.message);
      resolve();
    });
  });
}

// ── 4. TURN TCP ──────────────────────────────────────────────────────────────
console.log("\n[4] TURN TCP reachability");
await tcpProbe(turnHost, turnPort, "TURN");

// ── 5. TURNS TCP ─────────────────────────────────────────────────────────────
console.log("\n[5] TURNS (TLS) TCP reachability");
await tcpProbe(turnHost, turnTlsPort, "TURNS");

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
