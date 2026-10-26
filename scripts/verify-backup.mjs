#!/usr/bin/env node
import { resolve } from "node:path";
import { verifyBundle } from "./lib/backup-bundle.mjs";

const bundle = process.argv[2] === "--backup-dir" ? process.argv[3] : process.argv[2];
if (!bundle) { console.error("Usage: node scripts/verify-backup.mjs [--backup-dir] <bundle>"); process.exit(2); }
try {
  const manifest = await verifyBundle(resolve(bundle));
  console.log(JSON.stringify({ ok: true, bundle: resolve(bundle), createdAt: manifest.createdAt, artifacts: manifest.artifacts.length }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, bundle: resolve(bundle), error: error.message }));
  process.exit(1);
}
