#!/usr/bin/env node
/**
 * Static analysis of Go service Dockerfiles.
 *
 * Checks:
 *  - Dockerfile exists for each Go service
 *  - go.sum is copied alongside go.mod before go mod download
 *    (missing go.sum causes "go mod download" to fail at build time)
 *  - Go version in Dockerfile >= Go version required in go.mod
 *    (mismatch causes "go mod download" to fail with GOTOOLCHAIN error)
 *  - Multi-stage build pattern is used (small final image)
 *  - CGO_ENABLED=0 for a fully static binary
 *  - Correct port is EXPOSEd
 *  - Final stage uses alpine (not the builder image)
 *  - .dockerignore (if present) does not exclude go.sum or go.mod
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

/** Parse the minimum Go version from a go.mod file. Returns e.g. [1, 23]. */
function goModVersion(modPath) {
  if (!existsSync(modPath)) return null;
  const match = readFileSync(modPath, "utf8").match(/^go\s+(\d+)\.(\d+)/m);
  return match ? [parseInt(match[1], 10), parseInt(match[2], 10)] : null;
}

/** Parse the Go version from a Dockerfile FROM line. Returns e.g. [1, 23]. */
function dockerfileGoVersion(src) {
  const match = src.match(/FROM\s+golang:(\d+)\.(\d+)/);
  return match ? [parseInt(match[1], 10), parseInt(match[2], 10)] : null;
}

function versionGte(a, b) {
  if (!a || !b) return false;
  return a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1]);
}

let pass = 0;
let fail = 0;

function check(label, condition, hint = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}${hint ? `  →  ${hint}` : ""}`);
    fail++;
  }
}

const services = [
  { dir: "apps/server-api",       service: "api",               port: "8080", binary: "server-api" },
  { dir: "apps/realtime-gateway", service: "realtime-gateway",  port: "3001", binary: "realtime-gateway" },
  { dir: "apps/worker",           service: "worker",            port: "8090", binary: "worker" },
];

console.log("validate-dockerfiles");

for (const { dir, service, port, binary } of services) {
  const dockerfilePath = `${dir}/Dockerfile`;

  check(`${service}: Dockerfile exists`, existsSync(dockerfilePath));
  if (!existsSync(dockerfilePath)) continue;

  const src = readFileSync(dockerfilePath, "utf8");
  const lines = src.split(/\r?\n/);

  // go.sum must be included in the COPY command that precedes go mod download.
  // Pattern: COPY go.mod go.sum ./
  const copyGoSum = lines.some((l) =>
    /^\s*COPY\s+go\.mod\s+go\.sum\s+\.\//.test(l) ||
    /^\s*COPY\s+go\.sum\s+go\.mod\s+\.\//.test(l)
  );
  check(
    `${service}: COPY includes go.sum before go mod download`,
    copyGoSum,
    'must be: COPY go.mod go.sum ./'
  );

  // Go version in Dockerfile must be >= version required in go.mod.
  // Mismatch produces: "go.mod requires go >= X.Y (running go A.B; GOTOOLCHAIN=local)"
  const modVer = goModVersion(`${dir}/go.mod`);
  const imgVer = dockerfileGoVersion(src);
  const verOk  = versionGte(imgVer, modVer);
  const imgStr = imgVer ? `${imgVer[0]}.${imgVer[1]}` : "unknown";
  const modStr = modVer ? `${modVer[0]}.${modVer[1]}` : "unknown";
  check(
    `${service}: Dockerfile Go ${imgStr} >= go.mod requires ${modStr}`,
    verOk,
    `update FROM golang:${modStr}-alpine (or higher) in ${dir}/Dockerfile`
  );

  check(`${service}: RUN go mod download present`,   src.includes("go mod download"));
  check(`${service}: multi-stage build (AS builder)`, src.includes("AS builder"));
  check(`${service}: CGO_ENABLED=0 for static binary`, src.includes("CGO_ENABLED=0"));
  check(`${service}: EXPOSE ${port}`,                src.includes(`EXPOSE ${port}`));
  check(`${service}: final stage uses alpine`,       src.includes("FROM alpine:"));
  check(`${service}: every base image is digest-pinned`, lines.filter((line) => /^FROM\s/.test(line)).every((line) => line.includes("@sha256:")));
  check(`${service}: builds correct binary (${binary})`, src.includes(binary));
  check(`${service}: creates dedicated runtime user`, src.includes("adduser -S -D -H -u 10001"));
  check(`${service}: final stage runs non-root`, /^USER openspace:openspace$/m.test(src));

  // .dockerignore must not exclude go.sum or go.mod
  const ignorePath = `${dir}/.dockerignore`;
  if (existsSync(ignorePath)) {
    const ignoreLines = readFileSync(ignorePath, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));

    check(
      `${service}: .dockerignore does not exclude go.sum`,
      !ignoreLines.some((l) => l === "go.sum" || l === "*.sum")
    );
    check(
      `${service}: .dockerignore does not exclude go.mod`,
      !ignoreLines.some((l) => l === "go.mod" || l === "*.mod")
    );
  }
}

for (const client of ["web-client", "admin-web"]) {
  const dockerfilePath = `apps/${client}/Dockerfile`;
  const nginxPath = `apps/${client}/nginx.conf`;
  const mainPath = `apps/${client}/nginx-main.conf`;
  check(`${client}: Dockerfile exists`, existsSync(dockerfilePath));
  check(`${client}: nginx main config exists`, existsSync(mainPath));
  if (!existsSync(dockerfilePath) || !existsSync(nginxPath)) continue;
  const dockerfile = readFileSync(dockerfilePath, "utf8");
  const nginx = readFileSync(nginxPath, "utf8");
  check(`${client}: nginx runs as non-root`, /^USER nginx$/m.test(dockerfile));
  check(`${client}: exposes unprivileged port 8080`, dockerfile.includes("EXPOSE 8080"));
  check(`${client}: listens on unprivileged port 8080`, /listen\s+8080;/.test(nginx));
  check(`${client}: every base image is digest-pinned`, dockerfile.split(/\r?\n/).filter((line) => /^FROM\s/.test(line)).every((line) => line.includes("@sha256:")));
  check(`${client}: install is frozen-lockfile pnpm`, dockerfile.includes("pnpm install --frozen-lockfile") && !dockerfile.includes("RUN npm install"));
}

// Optional: docker build --check (BuildKit Dockerfile linting, Docker 27+).
// Skip silently if Docker is not running or the flag is unsupported.
const dockerInfo = spawnSync("docker", ["info"], { stdio: "ignore", timeout: 10_000 });
const dockerRunning = dockerInfo.status === 0;
if (dockerInfo.error?.code === "ETIMEDOUT") {
  console.warn("Docker daemon did not respond within 10s; optional BuildKit lint is unavailable. Release image build and scan gates still require a working daemon.");
}

if (dockerRunning) {
  for (const { dir, service } of services) {
    const result = spawnSync(
      "docker",
      ["build", "--check", "--quiet", dir],
      { stdio: "pipe", timeout: 120_000 }
    );
    const stderr = result.stderr?.toString() ?? "";
    const unsupported =
      stderr.includes("unknown flag: --check") ||
      stderr.includes("unknown flag") ||
      result.error?.code === "ENOENT";

    if (!unsupported) {
      check(
        `${service}: docker build --check (BuildKit lint) passes`,
        result.status === 0,
        result.error?.message ?? stderr.trim().split("\n")[0]
      );
    }
    // If --check is unsupported, skip silently (older Docker versions).
  }
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
