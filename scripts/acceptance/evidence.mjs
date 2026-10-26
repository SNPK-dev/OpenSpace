import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const secretKey = /(token|password|secret|private.?key|credential|authorization)/i;
export function sanitize(value, key = "") {
  if (secretKey.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v, k)]));
  if (typeof value === "string") return value.replace(/(bearer\s+|token[=:]\s*|password[=:]\s*|secret[=:]\s*)\S+/gi, "$1[REDACTED]");
  return value;
}

export function validateEvidence(evidence, required) {
  if (evidence?.schema !== "openspace.acceptance/v1") throw new Error("unsupported acceptance evidence schema");
  const phases = new Map((evidence.phases ?? []).map((phase) => [phase.name, phase]));
  for (const name of required) {
    const phase = phases.get(name);
    if (!phase) throw new Error(`missing required phase: ${name}`);
    if (phase.status !== "passed") throw new Error(`required phase did not pass: ${name}`);
  }
  if (JSON.stringify(evidence).match(/"(token|password|secret|privateKey|credential)"\s*:\s*"(?!\[REDACTED\])/i)) throw new Error("evidence contains an unredacted secret");
  return evidence;
}

export function writeEvidence(path, evidence) {
  const clean = sanitize(evidence);
  const body = `${JSON.stringify(clean, null, 2)}\n`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, { mode: 0o600 });
  writeFileSync(`${path}.sha256`, `${createHash("sha256").update(body).digest("hex")}  ${path.split(/[\\/]/).at(-1)}\n`);
  return clean;
}

export function readEvidence(path) { return JSON.parse(readFileSync(path, "utf8")); }
