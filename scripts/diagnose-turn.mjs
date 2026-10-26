/**
 * STUN/TURN connectivity diagnostics.
 *
 * Checks:
 *   1. STUN Binding Request over UDP → reports public IP and RTT
 *   2. TURN TCP port reachability
 *   3. TURNS TLS TCP port reachability
 *
 * Usage: node scripts/diagnose-turn.mjs [path/to/.env]
 * Exits 0 if STUN response received, 1 otherwise.
 */

import { readFileSync } from "node:fs";
import { createSocket } from "node:dgram";
import { createConnection } from "node:net";
import { randomBytes } from "node:crypto";

const envPath = process.argv[2] ?? ".env";

const parseEnv = (path) => {
  const values = {};
  try {
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      values[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
    }
  } catch {
    console.error(`Cannot read env file: ${path}`);
    process.exit(1);
  }
  return values;
};

const env = parseEnv(envPath);
const turnHost = env.TURN_HOST ?? "localhost";
const turnPort = parseInt(env.TURN_PORT ?? "3478", 10);
const turnTlsPort = parseInt(env.TURN_TLS_PORT ?? "5349", 10);

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

// ── STUN magic cookie and XOR-MAPPED-ADDRESS type (RFC 5389) ─────────────────
const MAGIC_COOKIE = 0x2112a442;
const BINDING_REQUEST = 0x0001;
const BINDING_SUCCESS = 0x0101;
const ATTR_XOR_MAPPED_ADDRESS = 0x0020;

function buildStunRequest() {
  const buf = Buffer.alloc(20);
  buf.writeUInt16BE(BINDING_REQUEST, 0); // message type
  buf.writeUInt16BE(0, 2);              // message length (no attrs)
  buf.writeUInt32BE(MAGIC_COOKIE, 4);  // magic cookie
  randomBytes(12).copy(buf, 8);        // 96-bit transaction ID
  return buf;
}

function parseXorMappedAddress(response) {
  if (response.length < 20) return null;
  if (response.readUInt16BE(0) !== BINDING_SUCCESS) return null;

  const msgLen = response.readUInt16BE(2);
  let offset = 20;
  const end = 20 + msgLen;

  while (offset + 4 <= end && offset + 4 <= response.length) {
    const attrType = response.readUInt16BE(offset);
    const attrLen = response.readUInt16BE(offset + 2);
    offset += 4;

    if (attrType === ATTR_XOR_MAPPED_ADDRESS && attrLen >= 8) {
      // offset+0: reserved, offset+1: family (0x01=IPv4), offset+2: port, offset+4: addr
      const family = response.readUInt8(offset + 1);
      if (family !== 0x01) return null; // IPv4 only

      const xorPort = response.readUInt16BE(offset + 2);
      const port = xorPort ^ (MAGIC_COOKIE >>> 16);

      const xorAddr = response.readUInt32BE(offset + 4);
      const addr = xorAddr ^ MAGIC_COOKIE;

      const ip = [
        (addr >>> 24) & 0xff,
        (addr >>> 16) & 0xff,
        (addr >>> 8) & 0xff,
        addr & 0xff,
      ].join(".");

      return { ip, port };
    }

    // attributes are padded to 4-byte boundary
    offset += attrLen + (attrLen % 4 !== 0 ? 4 - (attrLen % 4) : 0);
  }
  return null;
}

// ── 1. STUN UDP ───────────────────────────────────────────────────────────────
console.log(`\n[1] STUN UDP — ${turnHost}:${turnPort}`);

const stunResult = await new Promise((resolve) => {
  const socket = createSocket("udp4");
  const request = buildStunRequest();
  const start = Date.now();
  let done = false;

  const timer = setTimeout(() => {
    if (done) return;
    done = true;
    socket.close();
    resolve({ ok: false, reason: "timeout after 5s" });
  }, 5000);

  socket.on("message", (msg) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    const rtt = Date.now() - start;
    const mapped = parseXorMappedAddress(msg);
    socket.close();
    resolve({ ok: true, rtt, mapped });
  });

  socket.on("error", (err) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    socket.close();
    resolve({ ok: false, reason: err.message });
  });

  socket.send(request, turnPort, turnHost, (err) => {
    if (err && !done) {
      done = true;
      clearTimeout(timer);
      socket.close();
      resolve({ ok: false, reason: err.message });
    }
  });
});

if (stunResult.ok) {
  const addr = stunResult.mapped
    ? `public IP: ${stunResult.mapped.ip} (port ${stunResult.mapped.port})`
    : "response received (no XOR-MAPPED-ADDRESS)";
  ok(`STUN binding response in ${stunResult.rtt}ms — ${addr}`);
} else {
  fail(`STUN UDP to ${turnHost}:${turnPort}`, stunResult.reason);
}

// ── TCP probe helper ──────────────────────────────────────────────────────────
function tcpProbe(host, port, label) {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port, timeout: 8_000 }, () => {
      ok(`${label} TCP ${host}:${port} reachable`);
      sock.destroy();
      resolve();
    });
    sock.on("timeout", () => {
      fail(`${label} TCP ${host}:${port}`, "timeout");
      sock.destroy();
      resolve();
    });
    sock.on("error", (err) => {
      fail(`${label} TCP ${host}:${port}`, err.message);
      resolve();
    });
  });
}

// ── 2. TURN TCP ───────────────────────────────────────────────────────────────
console.log(`\n[2] TURN TCP — ${turnHost}:${turnPort}`);
await tcpProbe(turnHost, turnPort, "TURN");

// ── 3. TURNS TLS TCP ─────────────────────────────────────────────────────────
console.log(`\n[3] TURNS TLS TCP — ${turnHost}:${turnTlsPort}`);
await tcpProbe(turnHost, turnTlsPort, "TURNS");

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
