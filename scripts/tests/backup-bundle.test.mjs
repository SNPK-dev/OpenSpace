import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyRetention, artifact, confinedPath, finalizeBundle, retentionSelection, run, verifyBundle } from "../lib/backup-bundle.mjs";

const roots = [];
function root() { const path = mkdtempSync(join(tmpdir(), "openspace-backup-")); roots.push(path); return path; }
test.after(() => roots.forEach((path) => rmSync(path, { recursive: true, force: true })));
async function bundle(parent, name, createdAt = new Date().toISOString()) {
  const staging = join(parent, `${name}.incomplete`), finalPath = join(parent, name); mkdirSync(join(staging, "objects"), { recursive: true });
  writeFileSync(join(staging, "INCOMPLETE"), "yes"); writeFileSync(join(staging, "db.dump"), "database"); writeFileSync(join(staging, "objects", "avatar.bin"), "avatar");
  const artifacts = [await artifact(staging, "db.dump"), await artifact(staging, "objects/avatar.bin")];
  finalizeBundle(staging, finalPath, { format: "openspace-backup", version: 1, createdAt, database: { path: "db.dump", schemaMigrations: 1 }, objects: { directory: "objects", bucket: "openspace", count: 1, bytes: 6 }, artifacts }); return finalPath;
}

test("valid bundle verifies", async () => assert.equal((await verifyBundle(await bundle(root(), "valid"))).version, 1));
test("corruption is rejected", async () => { const path = await bundle(root(), "corrupt"); writeFileSync(join(path, "db.dump"), "changed"); await assert.rejects(verifyBundle(path), /size mismatch|hash mismatch/); });
test("incomplete bundle is rejected", async () => { const path = root(); mkdirSync(join(path, "objects")); writeFileSync(join(path, "INCOMPLETE"), "yes"); await assert.rejects(verifyBundle(path), /incomplete/); });
test("traversal and absolute paths are rejected", () => { const path = root(); assert.throws(() => confinedPath(path, "../secret"), /escapes/); assert.throws(() => confinedPath(path, resolveForTest()), /unsafe/); });
function resolveForTest() { return process.platform === "win32" ? "C:\\secret" : "/secret"; }
test("retention removes only oldest verified bundles", async () => { const path = root(); const old = await bundle(path, "old", "2025-01-01T00:00:00Z"); const recent = await bundle(path, "recent", "2026-01-01T00:00:00Z"); mkdirSync(join(path, "broken")); const removed = await applyRetention(path, 1); assert.deepEqual(removed, [old]); await verifyBundle(recent); });
test("tiered retention keeps daily, weekly, and monthly recovery points", () => {
  const candidates = ["2026-08-11", "2026-08-10", "2026-08-03", "2026-07-20", "2026-06-01"].map((day) => ({ path: day, manifest: { createdAt: `${day}T03:00:00Z` } }));
  const selected = retentionSelection(candidates, { daily: 2, weekly: 2, monthly: 2 });
  assert.deepEqual(selected.keep.map((item) => item.path), ["2026-08-11", "2026-08-10", "2026-08-03", "2026-07-20"]);
  assert.deepEqual(selected.remove.map((item) => item.path), ["2026-06-01"]);
});
test("subprocess failures are fail-closed", () => assert.throws(() => run(process.execPath, ["-e", "process.exit(7)"], { label: "fixture" }), /failed \(7\)/));
