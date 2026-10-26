import { readFileSync, writeFileSync } from "node:fs";
const [manifestPath = "release-manifest.json", output = ".release-images.env"] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.schema !== "openspace.release/v1" || !Array.isArray(manifest.images)) throw new Error("release manifest has no immutable images");
const keys = { api: "OPENSPACE_API_IMAGE", "realtime-gateway": "OPENSPACE_GATEWAY_IMAGE", worker: "OPENSPACE_WORKER_IMAGE", "admin-web": "OPENSPACE_ADMIN_WEB_IMAGE", "web-client": "OPENSPACE_WEB_IMAGE" };
const lines = [];
for (const [name, key] of Object.entries(keys)) { const image = manifest.images.find((item) => item.name === name); if (!image || !/^sha256:[a-f0-9]{64}$/.test(image.digest)) throw new Error(`missing immutable digest for ${name}`); lines.push(`${key}=${image.ref}@${image.digest}`); }
writeFileSync(output, `${lines.join("\n")}\n`, { mode: 0o600 });
console.log(output);
