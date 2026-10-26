import { spawnSync } from "node:child_process";
import { excludedRoots } from "./dependency-audit-policy.mjs";
const pnpm = process.platform === "win32" ? "cmd.exe" : "corepack";
const args = process.platform === "win32" ? ["/d", "/s", "/c", "corepack.cmd", "pnpm", "audit", "--prod", "--json"] : ["pnpm", "audit", "--prod", "--json"];
const result = spawnSync(pnpm, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (!result.stdout) throw new Error(`dependency audit produced no JSON: ${result.error?.message ?? result.stderr}`);
const audit = JSON.parse(result.stdout);
const blocked = [];
const excluded = [];
for (const advisory of Object.values(audit.advisories ?? {})) {
  if (!["critical", "high"].includes(advisory.severity)) continue;
  const paths = (advisory.findings ?? []).flatMap((finding) => finding.paths ?? []);
  const supportedPaths = paths.filter((path) => !excludedRoots.some((pattern) => pattern.test(path)));
  const item = { id: advisory.github_advisory_id ?? advisory.id, severity: advisory.severity, module: advisory.module_name, title: advisory.title, paths: supportedPaths };
  if (supportedPaths.length) blocked.push(item); else excluded.push({ ...item, paths });
}
console.log(JSON.stringify({ schema: "openspace.dependency-audit/v1", supported: { unresolvedSevere: blocked }, previewExperimental: { unresolvedSevereCount: excluded.length, advisoryIds: [...new Set(excluded.map((item) => item.id))].sort() } }, null, 2));
if (blocked.length) process.exit(1);
