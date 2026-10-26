import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const restDir = fileURLToPath(new URL("../fixtures/v1/rest/", import.meta.url));

let pass = 0;
let fail = 0;

/** @param {string} label @param {boolean} condition */
function check(label, condition) {
  if (condition) {
    pass++;
  } else {
    console.error(`  ✗ ${label}`);
    fail++;
  }
}

/** @param {string} name @returns {Record<string, unknown> | null} */
function read(name) {
  const path = join(restDir, name);
  if (!existsSync(path)) {
    console.error(`  ✗ Missing fixture: ${name}`);
    fail++;
    return null;
  }
  return /** @type {Record<string, unknown>} */ (JSON.parse(readFileSync(path, "utf8")));
}

/** @param {unknown} obj @param {...string} keys @returns {boolean} */
function hasKeys(obj, ...keys) {
  if (!obj || typeof obj !== "object") return false;
  return keys.every((k) => k in obj);
}

// auth-login
const login = read("auth-login.json");
if (login) {
  check("auth-login has token (string)", typeof login.token === "string");
  check("auth-login has identity object", login.identity !== null && typeof login.identity === "object");
}

const sessions = read("auth-sessions.json");
if (sessions) {
  check("auth-sessions has sessions array", Array.isArray(sessions.sessions));
  const item = Array.isArray(sessions.sessions) ? sessions.sessions[0] : null;
  check("auth-sessions item has safe lifecycle fields", hasKeys(item, "id", "created_at", "expires_at", "current"));
  check("auth-sessions does not expose token", !JSON.stringify(sessions).includes("token"));
}
const rotate = read("auth-session-rotate.json");
if (rotate) check("auth-session-rotate has token", typeof rotate.token === "string");

// bootstrap-status
const bsStatus = read("bootstrap-status.json");
if (bsStatus) {
  check("bootstrap-status has bootstrapped (bool)", typeof bsStatus.bootstrapped === "boolean");
}

// bootstrap-create
const bsCreate = read("bootstrap-create.json");
if (bsCreate) {
  check("bootstrap-create has server_id", typeof bsCreate.server_id === "string");
  check("bootstrap-create has identity_id", typeof bsCreate.identity_id === "string");
  check("bootstrap-create has token", typeof bsCreate.token === "string");
}

// invite-create
const invite = read("invite-create.json");
if (invite) {
  check("invite-create has code (string)", typeof invite.code === "string");
  check("invite-create has expires_at (string or null)", invite.expires_at === null || typeof invite.expires_at === "string");
}

// identity-profile
const profile = read("identity-profile.json");
if (profile) {
  check("identity-profile has id", typeof profile.id === "string");
  check("identity-profile has username", typeof profile.username === "string");
  check("identity-profile has display_name", typeof profile.display_name === "string");
  check("identity-profile has roles (array)", Array.isArray(profile.roles));
  check("identity-profile has email key", "email" in profile);
}

// room
const room = read("room.json");
if (room) {
  check("room has id", typeof room.id === "string");
  check("room has name", typeof room.name === "string");
  check("room has position (number)", typeof room.position === "number");
  check("room has created_at (string)", typeof room.created_at === "string");
  check("room has description key", "description" in room);
}

// channel
const channel = read("channel.json");
if (channel) {
  check("channel has id", typeof channel.id === "string");
  check("channel has room_id", typeof channel.room_id === "string");
  check("channel has name", typeof channel.name === "string");
  check("channel has type", typeof channel.type === "string");
  check("channel has position (number)", typeof channel.position === "number");
  check("channel has created_at (string)", typeof channel.created_at === "string");
}

// message
const msg = read("message.json");
if (msg) {
  check("message has id", typeof msg.id === "string");
  check("message has channel_id", typeof msg.channel_id === "string");
  check("message has sender object", hasKeys(msg.sender, "id", "username", "display_name"));
  check("message has content", typeof msg.content === "string");
  check("message has created_at", typeof msg.created_at === "string");
  check("message has attachment key", "attachment" in msg);
}

// message-list
const msgList = read("message-list.json");
if (msgList) {
  check("message-list has messages (array)", Array.isArray(msgList.messages));
  check("message-list has has_more (bool)", typeof msgList.has_more === "boolean");
}

// admin-identity
const adminId = read("admin-identity.json");
if (adminId) {
  check("admin-identity has id", typeof adminId.id === "string");
  check("admin-identity has username", typeof adminId.username === "string");
  check("admin-identity has display_name", typeof adminId.display_name === "string");
  check("admin-identity has is_disabled (bool)", typeof adminId.is_disabled === "boolean");
  check("admin-identity has roles (array)", Array.isArray(adminId.roles));
  check("admin-identity has email key", "email" in adminId);
}

// error
const err = read("error.json");
if (err) {
  check("error has error key (string)", typeof err.error === "string");
  check("error has no extra keys", Object.keys(err).length === 1);
}

// error-validation
const errVal = read("error-validation.json");
if (errVal) {
  check("error-validation has error='validation_error'", errVal.error === "validation_error");
  check("error-validation has field (string)", typeof errVal.field === "string");
}

// rate-limit-error
const rl = read("rate-limit-error.json");
if (rl) {
  check("rate-limit-error has error key", typeof rl.error === "string");
}

console.log(`REST fixtures: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
