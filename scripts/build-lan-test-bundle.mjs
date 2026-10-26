#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const revision = process.env.OPENSPACE_GIT_REVISION
  ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirty = process.env.OPENSPACE_WORKTREE_DIRTY != null
  ? process.env.OPENSPACE_WORKTREE_DIRTY === "true"
  : execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0;
const epoch = process.env.SOURCE_DATE_EPOCH
  ?? execFileSync("git", ["show", "-s", "--format=%ct", "HEAD"], { encoding: "utf8" }).trim();
const name = `openspace-v${rootPackage.version}-lan-test`;
const outputRoot = "artifacts/lan-test";
const bundleRoot = join(outputRoot, name);
const archive = join(outputRoot, `${name}.tar.gz`);
const windowsArchive = join(outputRoot, `${name}.zip`);

rmSync(bundleRoot, { recursive: true, force: true });
mkdirSync(bundleRoot, { recursive: true });

const excluded = new Set(["node_modules", "dist", "out", "release", ".git", ".generated", "artifacts", "backups"]);
const filter = (source) => !source.split(/[\\/]/).some((part) =>
  excluded.has(part) || part.startsWith("release-") || part === "playwright-report" || part === "test-results"
  || part === "output" || part.endsWith(".tgz")
);
for (const entry of ["apps", "packages", "infra", "scripts", "docs/runbooks", "docs/testing"]) {
  cpSync(entry, join(bundleRoot, entry), { recursive: true, filter });
}
for (const file of [
  ".env.example", "docker-compose.yml", "docker-compose.lan-test.yml", "INSTALL.md",
  "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json",
  "ЗАПУСТИТЬ-СЕРВЕР.cmd", "ЗАПУСТИТЬ-КЛИЕНТ.cmd", "СБРОСИТЬ-КЛИЕНТ.cmd", "УСТАНОВИТЬ-КЛИЕНТ-WINDOWS.cmd", "ОСТАНОВИТЬ-СЕРВЕР.cmd",
]) cpSync(file, join(bundleRoot, file));
cpSync("docs/testing/local-network-release-test.md", join(bundleRoot, "ЛОКАЛЬНОЕ-ТЕСТИРОВАНИЕ.md"));

const winRelease = "apps/desktop-win/release";
if (existsSync(winRelease)) {
  const destination = join(bundleRoot, "clients/windows");
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(winRelease, { withFileTypes: true })) {
    const isCurrentInstaller = entry.name.includes(rootPackage.version)
      && (/\.exe$/i.test(entry.name) || /\.blockmap$/i.test(entry.name));
    if (entry.isFile() && (isCurrentInstaller || entry.name === "latest.yml")) {
      cpSync(join(winRelease, entry.name), join(destination, entry.name));
    }
  }
}

writeFileSync(join(bundleRoot, "candidate-manifest.json"), `${JSON.stringify({
  schema: "openspace.lan-test/v1",
  version: rootPackage.version,
  revision,
  dirty,
  sourceDateEpoch: Number(epoch),
  purpose: "Local network prerelease testing only; not a stable public release.",
}, null, 2)}\n`);

rmSync(archive, { force: true });
rmSync(windowsArchive, { force: true });
if (process.platform === "win32") {
  execFileSync("tar.exe", ["-czf", archive, "-C", outputRoot, name]);
  execFileSync("jar.exe", ["-cf", windowsArchive, "-C", outputRoot, name]);
} else {
  execFileSync("tar", ["--sort=name", `--mtime=@${epoch}`, "--owner=0", "--group=0", "--numeric-owner", "-czf", archive, "-C", outputRoot, name]);
}
const bytes = readFileSync(archive);
const sha256 = createHash("sha256").update(bytes).digest("hex");
writeFileSync(`${archive}.sha256`, `${sha256}  ${basename(archive)}\n`);
const artifacts = [{ name: basename(archive), bytes: statSync(archive).size, sha256 }];
if (existsSync(windowsArchive)) {
  const windowsBytes = readFileSync(windowsArchive);
  const windowsSha256 = createHash("sha256").update(windowsBytes).digest("hex");
  writeFileSync(`${windowsArchive}.sha256`, `${windowsSha256}  ${basename(windowsArchive)}\n`);
  artifacts.unshift({ name: basename(windowsArchive), bytes: statSync(windowsArchive).size, sha256: windowsSha256 });
}
writeFileSync(join(outputRoot, "lan-test-manifest.json"), `${JSON.stringify({
  schema: "openspace.lan-test-artifacts/v1",
  version: rootPackage.version,
  revision,
  dirty,
  artifacts,
}, null, 2)}\n`);
console.log(`${artifacts.map((item) => `${join(outputRoot, item.name)}\nSHA-256: ${item.sha256}`).join("\n")}\nDirty working tree: ${dirty}`);
