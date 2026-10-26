#!/usr/bin/env node
import {
  readFileSync, writeFileSync, mkdirSync, cpSync,
  rmSync, existsSync, readdirSync, copyFileSync,
  statSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = pkg.version || "0.0.0";
const bundleName = `openspace-v${version}`;
const distDir = "dist";
const bundleDir = join(distDir, bundleName);
const tarPath = join(distDir, `${bundleName}.tar.gz`);
const sha256Path = `${tarPath}.sha256`;

if (process.platform === "win32") {
  throw new Error("Reproducible release bundles require GNU tar on Linux. Run `wsl.exe -d Ubuntu-24.04 -- bash -lc 'cd /mnt/c/path/to/OpenSpace && corepack pnpm bundle:build'`.");
}

// Scripts excluded from the bundle (dev/monorepo tools not useful to operators)
const EXCLUDED_SCRIPTS = new Set([
  "deploy.sh",
  "validate-workspace.mjs",
]);

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      copyFileSync(s, d);
    }
  }
}

function copyScripts(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (["tests", "reliability"].includes(entry.name)) continue;
    if (entry.isDirectory()) {
      copyScripts(join(src, entry.name), join(dest, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;
    if (![".mjs", ".sh", ".ps1"].some((extension) => entry.name.endsWith(extension))) continue;
    if (EXCLUDED_SCRIPTS.has(entry.name)) continue;
    copyFileSync(join(src, entry.name), join(dest, entry.name));
  }
}

// Clean and recreate dist/
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true });
}
mkdirSync(bundleDir, { recursive: true });

console.log(`Building bundle: ${bundleName}`);

// Root files
for (const file of ["docker-compose.yml", "docker-compose.prod.yml", ".env.example", "INSTALL.md"]) {
  if (existsSync(file)) {
    copyFileSync(file, join(bundleDir, file));
    console.log(`  + ${file}`);
  } else {
    console.warn(`  ! Missing: ${file}`);
  }
}

// scripts/
copyScripts("scripts", join(bundleDir, "scripts"));
const scriptCount = readdirSync(join(bundleDir, "scripts")).length;
console.log(`  + scripts/ (${scriptCount} files)`);

// infra/
copyDir("infra", join(bundleDir, "infra"));
console.log("  + infra/");

// docs/runbooks/
copyDir("docs/runbooks", join(bundleDir, "docs/runbooks"));
console.log("  + docs/runbooks/");

// Create tar.gz
const sourceEpoch = process.env.SOURCE_DATE_EPOCH ?? "0";
execFileSync("tar", ["--sort=name", `--mtime=@${sourceEpoch}`, "--owner=0", "--group=0", "--numeric-owner", "-cf", `${tarPath}.tmp`, "-C", distDir, bundleName]);
execFileSync("gzip", ["-n", "-f", `${tarPath}.tmp`]);
const generated = `${tarPath}.tmp.gz`;
if (generated !== tarPath) copyFileSync(generated, tarPath);
rmSync(generated, { force: true });

// Compute sha256
const tarBytes = readFileSync(tarPath);
const sha256 = createHash("sha256").update(tarBytes).digest("hex");
writeFileSync(sha256Path, `${sha256}  ${basename(tarPath)}\n`, "utf8");
const manifest = {
  schema: "openspace.release/v1",
  version,
  revision: process.env.GITHUB_SHA ?? process.env.OPENSPACE_GIT_REVISION ?? "unknown",
  sourceDateEpoch: Number(sourceEpoch),
  artifacts: [{ name: basename(tarPath), sha256, bytes: statSync(tarPath).size }],
};
writeFileSync(join(distDir, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const sizeKB = Math.round(statSync(tarPath).size / 1024);
console.log(`\nBundle ready:`);
console.log(`  File:    ${tarPath}`);
console.log(`  Size:    ${sizeKB} KB`);
console.log(`  SHA256:  ${sha256}`);
console.log(`  Version: ${version}`);
