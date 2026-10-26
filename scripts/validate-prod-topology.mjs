#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const composeFile = process.argv[2] ?? "docker-compose.prod.yml";
const envFile = process.argv[3] ?? ".env.example";

function fail(message) {
  console.error(`Production topology invalid: ${message}`);
  process.exit(1);
}

let model;
try {
  const output = execFileSync(
    "docker",
    ["compose", "-f", composeFile, "--env-file", envFile, "config", "--format", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  model = JSON.parse(output);
} catch (error) {
  const detail = error?.stderr?.toString().trim() || error.message;
  fail(`could not render ${composeFile}: ${detail}`);
}

const expectedServices = new Set([
  "api", "realtime-gateway", "admin-web", "web-client", "postgres", "redis",
  "minio", "minio-init", "livekit", "coturn", "caddy", "worker",
]);
const actualServices = new Set(Object.keys(model.services ?? {}));

for (const service of expectedServices) {
  if (!actualServices.has(service)) fail(`required service '${service}' is missing`);
}
for (const service of actualServices) {
  if (!expectedServices.has(service)) fail(`unexpected service '${service}' is present`);
}

for (const [serviceName, service] of Object.entries(model.services)) {
  if (!(Number(service.cpus) > 0)) fail(`${serviceName} has no positive CPU limit`);
  if (!(Number(service.mem_limit) > 0)) fail(`${serviceName} has no positive memory limit`);
  if (!(Number(service.pids_limit) > 0)) fail(`${serviceName} has no positive PID limit`);
}

const hardenedServices = ["api", "realtime-gateway", "admin-web", "web-client", "worker"];
for (const serviceName of hardenedServices) {
  const service = model.services[serviceName];
  if (service.read_only !== true) fail(`${serviceName} root filesystem is not read-only`);
  if (!(service.security_opt ?? []).includes("no-new-privileges:true")) {
    fail(`${serviceName} does not disable privilege escalation`);
  }
  if (!(service.cap_drop ?? []).includes("ALL")) fail(`${serviceName} does not drop all capabilities`);
  if (!(service.tmpfs ?? []).some((mount) => mount.startsWith("/tmp:"))) {
    fail(`${serviceName} has no bounded temporary filesystem`);
  }
}

const expectedNetworks = {
  api: ["data", "edge"],
  "realtime-gateway": ["data", "edge"],
  "admin-web": ["edge"],
  "web-client": ["edge"],
  postgres: ["data"],
  redis: ["data"],
  minio: ["data"],
  "minio-init": ["data"],
  livekit: ["data", "edge", "media"],
  coturn: ["media"],
  caddy: ["edge"],
  worker: ["data"],
};
for (const [serviceName, expected] of Object.entries(expectedNetworks)) {
  const actual = Object.keys(model.services[serviceName].networks ?? {}).sort();
  if (actual.join(",") !== [...expected].sort().join(",")) {
    fail(`${serviceName} networks are [${actual.join(", ")}], expected [${expected.join(", ")}]`);
  }
}
if (model.networks?.data?.internal !== true) fail("data network is not internal");

const redis = model.services.redis;
if (!(redis.command ?? []).includes("--appendonly") || !(redis.command ?? []).includes("yes")) {
  fail("redis append-only persistence is not enabled");
}
if (!(redis.volumes ?? []).some((volume) => volume.source === "redis-data" && volume.target === "/data")) {
  fail("redis-data volume is not mounted at /data");
}
if (redis.user !== "redis") fail("redis does not run as its unprivileged image user");

const caddy = model.services.caddy;
if (!(caddy.cap_drop ?? []).includes("ALL") || !(caddy.cap_add ?? []).includes("NET_BIND_SERVICE")) {
  fail("caddy must drop all capabilities and add only NET_BIND_SERVICE");
}

const publicServices = new Set(["caddy", "livekit", "coturn"]);
const published = [];
for (const [serviceName, service] of Object.entries(model.services)) {
  for (const port of service.ports ?? []) {
    const entry = {
      service: serviceName,
      target: Number(port.target),
      published: String(port.published),
      protocol: port.protocol ?? "tcp",
    };
    published.push(entry);
    if (!publicServices.has(serviceName)) {
      fail(`${serviceName} publishes host port ${entry.published}/${entry.protocol}`);
    }
  }
}

const required = [
  ["caddy", 80, "tcp"],
  ["caddy", 443, "tcp"],
  ["livekit", 7881, "tcp"],
  ["livekit", 7882, "udp"],
  ["coturn", 3478, "tcp"],
  ["coturn", 3478, "udp"],
  ["coturn", 5349, "tcp"],
  ["coturn", 5349, "udp"],
];
for (const [service, target, protocol] of required) {
  if (!published.some((port) => port.service === service && port.target === target && port.protocol === protocol)) {
    fail(`${service} does not publish required target ${target}/${protocol}`);
  }
}

const relayPorts = published.filter((port) => port.service === "coturn" && port.protocol === "udp" && port.target >= 49152);
if (relayPorts.length === 0) fail("coturn does not publish a UDP relay range");

console.log("Production topology OK.");
console.log(`Services: ${[...actualServices].sort().join(", ")}`);
console.log("Published endpoints:");
const relayTargets = relayPorts.map((port) => port.target).sort((a, b) => a - b);
for (const port of published.filter((entry) => !relayPorts.includes(entry))) {
  console.log(`  ${port.service}: ${port.published}->${port.target}/${port.protocol}`);
}
console.log(`  coturn relay: ${relayTargets[0]}-${relayTargets.at(-1)}/udp (${relayTargets.length} ports)`);
