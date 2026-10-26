import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const dir = process.argv[2] ?? "dist";
const basePath = join(dir, "release-manifest.json");
const manifest = JSON.parse(readFileSync(basePath, "utf8"));
manifest.artifacts = readdirSync(dir, { recursive: true })
  .filter((name) => typeof name === "string" && name !== "release-manifest.json" && !name.endsWith(".sig") && !name.endsWith(".pem"))
  .map((name) => {
    const normalized = name.replaceAll("\\", "/");
    const path = join(dir, name);
    try {
      const bytes = readFileSync(path);
      return { name: normalized, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: statSync(path).size };
    } catch {
      return null;
    }
  })
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name));
if (new Set(manifest.artifacts.map((artifact) => artifact.name)).size !== manifest.artifacts.length) throw new Error("duplicate release artifact path");
manifest.images = readdirSync(dir, { recursive: true }).filter((name) => typeof name === "string" && name.endsWith("image.json")).map((name) => JSON.parse(readFileSync(join(dir, name), "utf8"))).sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(basePath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(basePath);
