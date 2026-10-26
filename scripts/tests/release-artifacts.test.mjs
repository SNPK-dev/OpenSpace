import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeArgs } from "../lib/backup-bundle.mjs";
test("canonical versions agree", () => assert.doesNotThrow(() => execFileSync(process.execPath, ["scripts/validate-release-version.mjs"], { stdio: "pipe" })));
test("mismatched tag fails", () => assert.notEqual(spawnSync(process.execPath, ["scripts/validate-release-version.mjs", "v9.9.9"]).status, 0));
test("final manifest preserves relative artifact paths", () => {
  const root = mkdtempSync(join(tmpdir(), "openspace-release-manifest-"));
  try {
    writeFileSync(join(root, "release-manifest.json"), JSON.stringify({ schema: "openspace.release/v1", version: "1.0.0-rc.1", artifacts: [] }));
    mkdirSync(join(root, "images"));
    writeFileSync(join(root, "images", "api.spdx.json"), "sbom");
    execFileSync(process.execPath, ["scripts/finalize-release-manifest.mjs", root]);
    const manifest = JSON.parse(readFileSync(join(root, "release-manifest.json"), "utf8"));
    assert.ok(manifest.artifacts.some((artifact) => artifact.name === "images/api.spdx.json"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("release lifecycle composes immutable images under a stable project name", () => {
  const before = { ...process.env };
  try {
    process.env.OPENSPACE_COMPOSE_PROJECT_NAME = "openspace-rc";
    process.env.OPENSPACE_COMPOSE_FILE = "previous/docker-compose.prod.yml";
    process.env.OPENSPACE_IMAGES_ENV = "previous/.release-images.env";
    assert.deepEqual(composeArgs({ APP_ENV: "production" }, ".env"), ["compose", "-p", "openspace-rc", "-f", join(process.cwd(), "previous/docker-compose.prod.yml"), "--env-file", join(process.cwd(), ".env"), "--env-file", join(process.cwd(), "previous/.release-images.env")]);
  } finally {
    for (const key of ["OPENSPACE_COMPOSE_PROJECT_NAME", "OPENSPACE_COMPOSE_FILE", "OPENSPACE_IMAGES_ENV"]) before[key] === undefined ? delete process.env[key] : process.env[key] = before[key];
  }
});
