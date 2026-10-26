import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const requiredFiles = [
  "packages/contracts/buf.yaml",
  "packages/contracts/buf.gen.yaml",
  "packages/contracts/package.json",
  "packages/contracts/proto/openspace/v1/common.proto",
  "packages/contracts/proto/openspace/v1/identity.proto",
  "packages/contracts/proto/openspace/v1/room.proto",
  "packages/contracts/proto/openspace/v1/message.proto",
  "packages/contracts/proto/openspace/v1/errors.proto",
  "packages/contracts/proto/openspace/v1/events.proto",
  "packages/contracts/fixtures/v1/server-identity.json",
  "packages/contracts/fixtures/v1/room.json",
  "packages/contracts/fixtures/v1/message.json",
  "packages/contracts/fixtures/v1/realtime-event.json",
  "packages/contracts/fixtures/v1/error.json"
];

const missing = requiredFiles.filter((path) => !existsSync(path));
if (missing.length > 0) {
  console.error(`Missing contract files:\n${missing.join("\n")}`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync("packages/contracts/package.json", "utf8"));
for (const script of ["build", "lint", "test", "typecheck"]) {
  if (!pkg.scripts?.[script] || pkg.scripts[script].includes("placeholder")) {
    console.error(`packages/contracts script '${script}' must be a real command`);
    process.exit(1);
  }
}

const eventProto = readFileSync("packages/contracts/proto/openspace/v1/events.proto", "utf8");
for (const token of ["message RealtimeEvent", "oneof payload", "sequence", "trace_id"]) {
  if (!eventProto.includes(token)) {
    console.error(`events.proto missing required token: ${token}`);
    process.exit(1);
  }
}

const generatedDirs = ["packages/contracts/gen/ts", "packages/contracts/gen/go"];
for (const dir of generatedDirs) {
  if (!existsSync(dir)) {
    console.error(`Missing generated output directory: ${dir}`);
    process.exit(1);
  }
}

console.log("Contracts baseline OK.");
