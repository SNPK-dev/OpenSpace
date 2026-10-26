import { readFileSync } from "node:fs";
const root = JSON.parse(readFileSync("package.json", "utf8"));
const desktop = JSON.parse(readFileSync("apps/desktop-win/package.json", "utf8"));
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(root.version)) throw new Error(`invalid canonical version: ${root.version}`);
if (desktop.version !== root.version) throw new Error(`desktop version ${desktop.version} differs from canonical ${root.version}`);
const tag = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : process.argv[2];
if (tag && tag !== `v${root.version}`) throw new Error(`tag ${tag} must equal v${root.version}`);
console.log(JSON.stringify({ ok: true, version: root.version, expectedTag: `v${root.version}` }));
