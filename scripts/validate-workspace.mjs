import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const command = process.argv[2] ?? "validate";

const commandPlans = {
  build: [
    ["apps/server-api", "build"],
    ["apps/realtime-gateway", "build"],
    ["apps/worker", "build"],
    ["apps/admin-web", "build"],
    ["apps/web-client", "build"],
    ["apps/mobile", "build"],
    ["apps/desktop-win", "build"],
    ["apps/desktop-mac", "build"],
    ["packages/contracts", "build"],
    ["packages/domain", "build"],
    ["packages/extract-zip", "build"],
    ["packages/image-size", "build"],
  ],
  lint: [
    ["apps/server-api", "lint"],
    ["apps/realtime-gateway", "lint"],
    ["apps/worker", "lint"],
    ["apps/admin-web", "typecheck"],
    ["apps/web-client", "typecheck"],
    ["apps/mobile", "typecheck"],
    ["apps/desktop-win", "typecheck"],
    ["apps/desktop-mac", "typecheck"],
    ["packages/contracts", "lint"],
    ["packages/domain", "lint"],
    ["packages/extract-zip", "lint"],
    ["packages/image-size", "lint"],
  ],
  typecheck: [
    ["apps/server-api", "typecheck"],
    ["apps/realtime-gateway", "typecheck"],
    ["apps/worker", "typecheck"],
    ["apps/admin-web", "typecheck"],
    ["apps/web-client", "typecheck"],
    ["apps/mobile", "typecheck"],
    ["apps/desktop-win", "typecheck"],
    ["apps/desktop-mac", "typecheck"],
    ["packages/contracts", "typecheck"],
    ["packages/domain", "typecheck"],
    ["packages/extract-zip", "typecheck"],
    ["packages/image-size", "typecheck"],
  ],
  test: [
    ["apps/server-api", "test"],
    ["apps/realtime-gateway", "test"],
    ["apps/worker", "test"],
    ["apps/web-client", "test:unit"],
    ["apps/mobile", "test"],
    ["apps/desktop-win", "test:unit"],
    ["packages/contracts", "test"],
    ["packages/domain", "test"],
    ["packages/extract-zip", "test"],
    ["packages/image-size", "test"],
  ],
};

const nonExecutableWorkspaces = [
  "packages/sdk",
  "packages/ui-kit",
  "packages/config",
  "packages/testkit",
];

const requiredRoots = ["apps", "packages", "infra", "docs", "openspec"];

const missingRoots = requiredRoots.filter((path) => !existsSync(path));
if (missingRoots.length > 0) {
  console.error(`Missing root directories: ${missingRoots.join(", ")}`);
  process.exit(1);
}

const plan = commandPlans[command];
if (!plan) {
  console.error(`Unsupported workspace command '${command}'. Expected: ${Object.keys(commandPlans).join(", ")}`);
  process.exit(1);
}

const missingPackages = [];
const missingScripts = [];
const runnableWorkspaces = [];

for (const [workspace, script] of plan) {
  const packagePath = join(workspace, "package.json");
  if (!existsSync(packagePath)) {
    missingPackages.push(packagePath);
    continue;
  }

  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  if (!pkg.scripts?.[script]) {
    missingScripts.push(`${workspace}:${script}`);
  } else {
    runnableWorkspaces.push([workspace, script]);
  }
}

for (const workspace of nonExecutableWorkspaces) {
  const entries = existsSync(workspace)
    ? readFileSync(join(workspace, "package.json"), "utf8")
    : null;
  if (!entries) missingPackages.push(join(workspace, "package.json"));
}

if (missingPackages.length > 0) {
  console.error(`Missing package manifests:\n${missingPackages.join("\n")}`);
  process.exit(1);
}

if (missingScripts.length > 0) {
  console.error(`Missing workspace scripts:\n${missingScripts.join("\n")}`);
  process.exit(1);
}

const commandRunner = process.platform === "win32" ? "cmd.exe" : "corepack";
for (const [workspace, script] of runnableWorkspaces) {
  console.log(`Running ${script} for ${workspace} (${command} gate)...`);
  const args =
    process.platform === "win32"
      ? ["/c", "corepack.cmd", "pnpm", "--dir", workspace, "run", script]
      : ["pnpm", "--dir", workspace, "run", script];
  const result = spawnSync(commandRunner, args, {
    stdio: "inherit"
  });

  if (result.error) {
    console.error(`Failed to run ${command} in ${workspace}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`${workspace}:${script} failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

for (const workspace of nonExecutableWorkspaces) {
  console.log(`Validating explicit non-runtime boundary for ${workspace}...`);
  const result = spawnSync(process.execPath, ["scripts/validate-non-runtime-package.mjs", workspace], {
    stdio: "inherit",
  });
  if (result.error || result.status !== 0) {
    console.error(`${workspace}: non-runtime boundary validation failed`);
    process.exit(result.status ?? 1);
  }
}

console.log(`Workspace ${command} gate OK (${runnableWorkspaces.length} executed checks).`);
console.log(`Explicit non-executable workspaces: ${nonExecutableWorkspaces.join(", ")}.`);
