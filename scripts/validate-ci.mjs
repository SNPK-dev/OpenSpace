#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from "node:fs";

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) { console.log(`  ✓ ${label}`); pass++; }
  else { console.log(`  ✗ ${label}`); fail++; }
}

function fileContains(path, ...patterns) {
  if (!existsSync(path)) return false;
  const content = readFileSync(path, "utf8");
  return patterns.every((p) => content.includes(p));
}

console.log("validate-ci");

const releaseWF = ".github/workflows/release.yml";
const ciWF      = ".github/workflows/ci.yml";

// Workflow files exist
check("release.yml exists",              existsSync(releaseWF));
check("ci.yml exists",                   existsSync(ciWF));

// Release workflow
check("release triggers on version tags", fileContains(releaseWF, "tags:", "v*.*.*"));
check("release has verify job",           fileContains(releaseWF, "name: Verify"));
check("release has build job",            fileContains(releaseWF, "name: Build"));
check("release runs pnpm verify",         fileContains(releaseWF, "pnpm verify"));
check("release builds bundle",            fileContains(releaseWF, "build-bundle.mjs"));
check("release verifies sha256",          fileContains(releaseWF, "sha256"));
check("release publishes artifacts",      fileContains(releaseWF, "upload-artifact") || fileContains(releaseWF, "action-gh-release"));
check("release has permissions: write",   fileContains(releaseWF, "contents: write"));

// CI workflow
check("ci triggers on push to main",      fileContains(ciWF, "branches:", "main"));
check("ci triggers on pull_request",      fileContains(ciWF, "pull_request"));
check("ci runs pnpm verify",              fileContains(ciWF, "pnpm verify"));
check("ci uses Node 22",                  fileContains(ciWF, "node-version") && fileContains(ciWF, 'node-version: "22"'));
check("ci has docker-build job",          fileContains(ciWF, "docker-build"));
check("ci builds api image",              fileContains(ciWF, "apps/server-api"));
check("ci builds realtime-gateway image", fileContains(ciWF, "apps/realtime-gateway"));
check("ci uses gha build cache",          fileContains(ciWF, "type=gha"));
check("ci has provisioned system E2E",   fileContains(ciWF, "system-e2e", "ADMIN_API_TOKEN", "test:e2e"));
check("ci E2E starts real stack",         fileContains(ciWF, "docker compose", "up -d --build"));

// Signing / checksum evidence in release
check("release uses sha256 checksum",     fileContains(releaseWF, "sha256"));
const release = readFileSync(releaseWF, "utf8");
const verifyJob = release.match(/^  verify:\r?\n([\s\S]*?)(?=^  [a-zA-Z][\w-]*:\r?$)/m)?.[1] ?? "";
const imagesJob = release.match(/^  images:\r?\n([\s\S]*?)(?=^  [a-zA-Z][\w-]*:\r?$)/m)?.[1] ?? "";
check("verify job does not reference image matrix outputs", !/matrix\.name|steps\.build\.outputs/.test(verifyJob));
check("images job generates retained per-image SBOM", /anchore\/sbom-action@[0-9a-f]{40}[\s\S]*output-file:\s*\$\{\{ matrix\.name \}\}\.spdx\.json[\s\S]*name:\s*image-\$\{\{ matrix\.name \}\}/.test(imagesJob));
check("release uploads sanitized acceptance evidence only", !/path:\s*[^\r\n]*\.acceptance\/\s*$/m.test(release));

for (const name of readdirSync(".github/workflows").filter((entry) => entry.endsWith(".yml") || entry.endsWith(".yaml"))) {
  const path = `.github/workflows/${name}`;
  const content = readFileSync(path, "utf8");
  const externalUses = [...content.matchAll(/uses:\s+([^\s#]+)/g)].map((match) => match[1]).filter((value) => !value.startsWith("./"));
  check(`${name} pins every external action to a commit SHA`, externalUses.every((value) => /@[a-f0-9]{40}$/.test(value)));
  const workflowImages = [...content.matchAll(/^ {4,8}(?:image|container):\s+([^\s#]+)/gm)].map((match) => match[1]);
  check(`${name} pins workflow containers to image digests`, workflowImages.every((value) => /@sha256:[a-f0-9]{64}$/.test(value)));
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
