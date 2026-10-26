#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const workspace = process.argv[2];
const allowed = new Set([
  "packages/sdk",
  "packages/config",
  "packages/testkit",
  "packages/ui-kit",
]);

if (!workspace || !allowed.has(workspace)) {
  console.error(`Workspace is not classified as non-runtime: ${workspace ?? "<missing>"}`);
  process.exit(1);
}

const manifestPath = resolve(workspace, "package.json");
if (!existsSync(manifestPath)) {
  console.error(`Missing package manifest: ${manifestPath}`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!manifest.private) {
  console.error(`${workspace} must remain private while classified as non-runtime`);
  process.exit(1);
}

if (workspace === "packages/ui-kit") {
  for (const required of ["src/tokens.css", "assets/logo-mark.svg", "assets/logo-wordmark.svg"]) {
    if (!existsSync(resolve(workspace, required))) {
      console.error(`${workspace} is missing required artifact: ${required}`);
      process.exit(1);
    }
  }
} else if (existsSync(resolve(workspace, "src"))) {
  console.error(`${workspace} contains src/ and must be promoted to executable workspace checks`);
  process.exit(1);
}

console.log(`${workspace}: explicit non-runtime boundary OK.`);
