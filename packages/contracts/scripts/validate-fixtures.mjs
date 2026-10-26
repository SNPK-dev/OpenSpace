import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const fixtureDir = fileURLToPath(new URL("../fixtures/v1/", import.meta.url));

const fixtures = {
  "server-identity.json": ["meta", "handle", "displayName", "roleIds"],
  "room.json": ["meta", "name", "kind"],
  "message.json": ["meta", "roomId", "authorIdentityId", "body", "attachments"],
  "realtime-event.json": ["eventId", "serverId", "streamId", "sequence", "occurredAtUnixMs", "traceId"],
  "error.json": ["code", "message", "retryable", "traceId"]
};

/**
 * @param {string} name
 * @returns {Record<string, unknown>}
 */
const readFixture = (name) => {
  const path = join(fixtureDir, name);
  if (!existsSync(path)) {
    throw new Error(`Missing fixture: ${name}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
};

for (const [name, requiredKeys] of Object.entries(fixtures)) {
  const data = readFixture(name);
  for (const key of requiredKeys) {
    if (!(key in data)) {
      throw new Error(`${name} is missing required key: ${key}`);
    }
  }

  const meta = data.meta;
  if (
    typeof meta === "object" &&
    meta !== null &&
    "serverId" in meta &&
    meta.serverId !== "server_local_001"
  ) {
    throw new Error(`${name} must use server-local fixture IDs`);
  }
}

const event = readFixture("realtime-event.json");
if (!event.messageCreated && !event.roomUpdated && !event.presenceChanged && !event.error) {
  throw new Error("realtime-event.json must include a typed event payload");
}

const int64JsonFields = new Set([
  "createdAtUnixMs",
  "updatedAtUnixMs",
  "editedAtUnixMs",
  "deletedAtUnixMs",
  "changedAtUnixMs",
  "startedAtUnixMs",
  "stoppedAtUnixMs",
  "sizeBytes",
  "sequence",
  "occurredAtUnixMs"
]);

/**
 * @param {unknown} value
 * @param {string[]} path
 */
const assertProtoJsonInt64Fields = (value, path = []) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertProtoJsonInt64Fields(item, [...path, String(index)]));
    return;
  }

  if (typeof value !== "object" || value === null) {
    return;
  }

  for (const [key, childValue] of Object.entries(value)) {
    const childPath = [...path, key];
    if (int64JsonFields.has(key) && typeof childValue !== "string") {
      throw new Error(`${childPath.join(".")} must be encoded as a protobuf JSON string`);
    }
    assertProtoJsonInt64Fields(childValue, childPath);
  }
};

for (const name of Object.keys(fixtures)) {
  assertProtoJsonInt64Fields(readFixture(name), [name]);
}

console.log("Contract fixtures OK.");
