import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  ".env.example",
  "docker-compose.yml",
  "infra/caddy/Caddyfile",
  "infra/coturn/turnserver.conf",
  "infra/livekit/livekit.yaml",
  "scripts/render-dev-configs.mjs"
];

const requiredEnvKeys = [
  "APP_ENV",
  "PUBLIC_BASE_URL",
  "ADMIN_BASE_URL",
  "DATABASE_URL",
  "REDIS_URL",
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_ACCESS_KEY",
  "OBJECT_STORAGE_SECRET_KEY",
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "TURN_REALM",
  "TURN_SECRET",
  "TURN_PORT",
  "TURN_TLS_PORT",
  "TURN_RELAY_PORT_START",
  "TURN_RELAY_PORT_END",
  "CADDY_EMAIL",
  "LOG_LEVEL",
  "RETENTION_DEFAULT_DAYS",
  "MAX_UPLOAD_MB"
];

const requiredComposeServices = [
  "api",
  "realtime-gateway",
  "worker",
  "admin-web",
  "web-client",
  "postgres",
  "redis",
  "minio",
  "minio-init",
  "livekit",
  "coturn",
  "caddy"
];

const missingFiles = requiredFiles.filter((path) => !existsSync(path));
if (missingFiles.length > 0) {
  console.error(`Missing dev infra files:\n${missingFiles.join("\n")}`);
  process.exit(1);
}

const envExample = readFileSync(".env.example", "utf8");
const envKeys = new Set(
  envExample
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=")[0])
);

const missingEnvKeys = requiredEnvKeys.filter((key) => !envKeys.has(key));
if (missingEnvKeys.length > 0) {
  console.error(`Missing .env.example keys:\n${missingEnvKeys.join("\n")}`);
  process.exit(1);
}

const compose = readFileSync("docker-compose.yml", "utf8");
const missingServices = requiredComposeServices.filter(
  (service) => !compose.includes(`  ${service}:`)
);
if (missingServices.length > 0) {
  console.error(`Missing docker compose services:\n${missingServices.join("\n")}`);
  process.exit(1);
}

const missingHealthchecks = ["postgres", "redis", "minio", "livekit", "coturn", "caddy"].filter(
  (service) => !compose.includes(`x-healthcheck-${service}:`)
);
if (missingHealthchecks.length > 0) {
  console.error(`Missing healthcheck anchors:\n${missingHealthchecks.join("\n")}`);
  process.exit(1);
}

const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const upScript = rootPackage.scripts?.["dev:infra:up"] ?? "";
if (!upScript.includes("minio-init")) {
  console.error("dev:infra:up must start minio-init so the object-storage bucket exists.");
  process.exit(1);
}

if (!compose.includes("./.generated/livekit/livekit.yaml") || !compose.includes("./.generated/coturn/turnserver.conf")) {
  console.error("docker-compose.yml must mount rendered LiveKit and Coturn configs from .generated.");
  process.exit(1);
}

if (!compose.includes("TURN_RELAY_PORT_START") || !compose.includes("TURN_RELAY_PORT_END") || !compose.includes("/udp")) {
  console.error("docker-compose.yml must publish a bounded Coturn UDP relay port range.");
  process.exit(1);
}

const coturnTemplate = readFileSync("infra/coturn/turnserver.conf", "utf8");
const renderer = readFileSync("scripts/render-dev-configs.mjs", "utf8");
for (const requiredCoturnToken of ["min-port", "max-port"]) {
  if (!coturnTemplate.includes(requiredCoturnToken) || !renderer.includes(requiredCoturnToken)) {
    console.error(`Coturn config must include ${requiredCoturnToken} for relay UDP range support.`);
    process.exit(1);
  }
}

console.log("Dev infra baseline OK.");
