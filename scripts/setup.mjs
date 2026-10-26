#!/usr/bin/env node
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

function randomHex(bytes) {
  return randomBytes(bytes).toString("hex");
}

function parseArgs(argv) {
  const args = {
    nonInteractive: false,
    domain: null,
    adminEmail: null,
    envPath: ".env",
    force: false,
    objectStoragePublicEndpoint: null,
    livekitPublicUrl: null,
    localNetwork: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--non-interactive": args.nonInteractive = true; break;
      case "--force":           args.force = true; break;
      case "--domain":          args.domain = argv[++i]; break;
      case "--admin-email":     args.adminEmail = argv[++i]; break;
      case "--env":             args.envPath = argv[++i]; break;
      case "--object-storage-public-endpoint": args.objectStoragePublicEndpoint = argv[++i]; break;
      case "--livekit-public-url": args.livekitPublicUrl = argv[++i]; break;
      case "--local-network": args.localNetwork = true; break;
    }
  }
  return args;
}

function replaceEnvValue(template, key, value) {
  const re = new RegExp(`^(${key}=).*`, "m");
  if (re.test(template)) {
    return template.replace(re, `$1${value}`);
  }
  return template + `\n${key}=${value}`;
}

async function prompt(rl, question, defaultValue) {
  return new Promise((resolve) => {
    const hint = defaultValue ? ` [${defaultValue}]` : "";
    rl.question(`${question}${hint}: `, (answer) => {
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const envPath = resolve(args.envPath);
  const tmpPath = envPath + ".setup.tmp";

  if (existsSync(envPath) && !args.force) {
    console.error(`Error: ${envPath} already exists. Use --force to overwrite.`);
    process.exit(1);
  }

  if (!existsSync(".env.example")) {
    console.error("Error: .env.example not found. Run this script from the OpenSpace root directory.");
    process.exit(1);
  }

  let template = readFileSync(".env.example", "utf8");

  let domain = args.domain;
  let adminEmail = args.adminEmail;

  if (!args.nonInteractive) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log("\nOpenSpace Setup\n");

    domain = await prompt(rl, "Domain (e.g. chat.example.com, or localhost for local)", "localhost");
    adminEmail = await prompt(rl, "Admin email (for TLS certificate)", "ops@example.com");

    rl.close();
  } else {
    domain = domain || "localhost";
    adminEmail = adminEmail || "ops@example.com";
  }

  const isLoopback = domain === "localhost" || domain === "127.0.0.1";
  const isLocal = isLoopback || args.localNetwork;
  const scheme = isLoopback ? "http" : "https";

  const postgresPassword = randomHex(24);
  const storageSecret = randomHex(24);
  const turnSecret = randomHex(24);
  const livekitKey = randomHex(12);
  const livekitSecret = randomHex(32);

  // Update .env values
  template = replaceEnvValue(template, "APP_ENV", isLocal ? "development" : "production");
  template = replaceEnvValue(template, "PUBLIC_BASE_URL", `${scheme}://${domain}`);
  template = replaceEnvValue(template, "ADMIN_BASE_URL", `${scheme}://${domain}/admin`);
  template = replaceEnvValue(template, "WS_ALLOWED_ORIGINS", isLocal
    ? (isLoopback
      ? "http://localhost,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,file://"
      : `${scheme}://${domain},file://`)
    : `${scheme}://${domain},file://`);
  template = replaceEnvValue(template, "POSTGRES_PASSWORD", postgresPassword);
  template = replaceEnvValue(template, "DATABASE_URL",
    `postgres://openspace:${postgresPassword}@postgres:5432/openspace`);
  template = replaceEnvValue(template, "OBJECT_STORAGE_SECRET_KEY", storageSecret);
  template = replaceEnvValue(template, "OBJECT_STORAGE_PUBLIC_ENDPOINT",
    args.objectStoragePublicEndpoint || (isLoopback ? `${domain}:9000` : `files.${domain}`));
  template = replaceEnvValue(template, "OBJECT_STORAGE_PUBLIC_USE_SSL", isLoopback ? "false" : "true");
  template = replaceEnvValue(template, "TURN_HOST", domain);
  template = replaceEnvValue(template, "TURN_REALM", domain);
  template = replaceEnvValue(template, "TURN_SECRET", turnSecret);
  // LIVEKIT_URL is always internal (server ↔ LiveKit SDK, never exposed to clients)
  template = replaceEnvValue(template, "LIVEKIT_URL", "ws://livekit:7880");
  // LIVEKIT_PUBLIC_URL is what browser clients use for WebRTC signalling
  template = replaceEnvValue(template, "LIVEKIT_PUBLIC_URL",
    args.livekitPublicUrl || (isLoopback ? "ws://localhost:7880" : `wss://${domain}/livekit`));
  template = replaceEnvValue(template, "LIVEKIT_API_KEY", livekitKey);
  template = replaceEnvValue(template, "LIVEKIT_API_SECRET", livekitSecret);
  template = replaceEnvValue(template, "CADDY_EMAIL", adminEmail);

  writeFileSync(tmpPath, template, "utf8");
  renameSync(tmpPath, envPath);

  // Render configs
  const configScript = isLocal ? "scripts/render-dev-configs.mjs" : "scripts/render-prod-configs.mjs";
  if (existsSync(configScript)) {
    try {
      execFileSync(process.execPath, [configScript, envPath], { stdio: "inherit" });
    } catch {
      console.warn("Warning: config rendering failed. Run manually:");
      console.warn(`  node ${configScript} ${args.envPath}`);
    }
  }

  const composeCmd = isLocal
    ? (args.localNetwork
      ? "docker compose -f docker-compose.yml -f docker-compose.lan-test.yml --env-file .env up -d --build"
      : "docker compose --env-file .env up -d")
    : "docker compose -f docker-compose.prod.yml --env-file .env up -d";

  console.log(`\nSetup complete. .env written to: ${envPath}`);
  console.log("\nNext steps:");
  console.log(`  1. Start services:\n     ${composeCmd}`);
  console.log(`  2. Check health:\n     curl ${scheme}://${domain}/healthz`);
  console.log(`  3. Open the admin console:\n     ${scheme}://${domain}/admin`);
  console.log(`  4. Take a backup after first use:\n     node scripts/backup.mjs .env`);
  console.log(`\nKeep .env safe: chmod 600 ${args.envPath}`);
}

main().catch((err) => {
  console.error(`Setup failed: ${err.message}`);
  process.exit(1);
});
