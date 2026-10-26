import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const envPath = process.argv[2] ?? ".env";

const parseEnv = (path) => {
  const values = {};
  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }
    values[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return values;
};

const env = parseEnv(envPath);

const requireValue = (key) => {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment value: ${key}`);
  }
  return value;
};

const optionalValue = (key, fallback) => env[key] ?? fallback;

const writeGenerated = (path, content) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};

writeGenerated(
  ".generated/livekit/livekit.yaml",
  `port: 7880
rtc:
  tcp_port: 7881
  udp_port: 7882
keys:
  ${requireValue("LIVEKIT_API_KEY")}: ${requireValue("LIVEKIT_API_SECRET")}
logging:
  level: ${env.LOG_LEVEL ?? "info"}
room:
  empty_timeout: 300
  departure_timeout: 20
`
);

writeGenerated(
  ".generated/coturn/turnserver.conf",
  `listening-port=3478
min-port=${optionalValue("TURN_RELAY_PORT_START", "50000")}
max-port=${optionalValue("TURN_RELAY_PORT_END", "50100")}
fingerprint
use-auth-secret
static-auth-secret=${requireValue("TURN_SECRET")}
realm=${requireValue("TURN_REALM")}
no-cli
no-tls
no-dtls
log-file=stdout
simple-log
no-multicast-peers
no-loopback-peers
`
);

console.log(`Rendered dev infrastructure configs from ${envPath}.`);
