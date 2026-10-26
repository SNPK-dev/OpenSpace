#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}`);
    fail++;
  }
}

function readFixture(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function goSource(path) {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

// For struct-based fields: verify json:"<field>" tag exists in Go source
function hasJsonTag(source, field) {
  return source.includes(`json:"${field}"`);
}

// For inline map literals: verify the string key exists in Go source
function hasStringKey(source, key) {
  return source.includes(`"${key}"`);
}

console.log("validate-rest-contracts");

// ── auth-login ────────────────────────────────────────────────────────────────
const authSrc = goSource("apps/server-api/internal/auth/handler.go");
const authServiceSrc = goSource("apps/server-api/internal/auth/service.go");
const authLogin = readFixture("packages/contracts/fixtures/v1/rest/auth-login.json");
if (authLogin) {
  check("auth-login: 'token' key exists in fixture", "token" in authLogin);
  check("auth-login: 'identity' key exists in fixture", "identity" in authLogin);
  check("auth-login: Go handler uses literal key 'token'", hasStringKey(authSrc, "token"));
  check("auth-login: Go handler uses literal key 'identity'", hasStringKey(authSrc, "identity"));
}

const authSessions = readFixture("packages/contracts/fixtures/v1/rest/auth-sessions.json");
if (authSessions) {
  check("auth-sessions: sessions array exists", Array.isArray(authSessions.sessions));
  check("auth-sessions: Go model exposes safe fields", ["id", "created_at", "expires_at", "current"].every((field) => hasJsonTag(authServiceSrc, field)));
  check("auth-sessions: fixture does not expose credentials", !JSON.stringify(authSessions).includes("token"));
}
const authRotate = readFixture("packages/contracts/fixtures/v1/rest/auth-session-rotate.json");
if (authRotate) check("auth-session-rotate: token key exists", typeof authRotate.token === "string" && hasStringKey(authSrc, "token"));

// ── bootstrap-status ─────────────────────────────────────────────────────────
const bsSrc = goSource("apps/server-api/internal/bootstrap/handler.go");
const bsStatus = readFixture("packages/contracts/fixtures/v1/rest/bootstrap-status.json");
if (bsStatus) {
  check("bootstrap-status: 'bootstrapped' key exists in fixture", "bootstrapped" in bsStatus);
  check("bootstrap-status: Go handler has json tag 'bootstrapped'", hasJsonTag(bsSrc, "bootstrapped"));
}

// ── bootstrap-create ─────────────────────────────────────────────────────────
const bsCreate = readFixture("packages/contracts/fixtures/v1/rest/bootstrap-create.json");
if (bsCreate) {
  check("bootstrap-create: 'server_id' key in fixture", "server_id" in bsCreate);
  check("bootstrap-create: 'identity_id' key in fixture", "identity_id" in bsCreate);
  check("bootstrap-create: 'token' key in fixture", "token" in bsCreate);
  check("bootstrap-create: Go handler uses literal key 'server_id'", hasStringKey(bsSrc, "server_id"));
  check("bootstrap-create: Go handler uses literal key 'identity_id'", hasStringKey(bsSrc, "identity_id"));
}

// ── invite-create ─────────────────────────────────────────────────────────────
const inviteSrc = goSource("apps/server-api/internal/invite/service.go");
const invite = readFixture("packages/contracts/fixtures/v1/rest/invite-create.json");
if (invite) {
  check("invite-create: 'code' key in fixture", "code" in invite);
  check("invite-create: 'expires_at' key in fixture", "expires_at" in invite);
  check("invite-create: Go service has json tag 'code'", hasJsonTag(inviteSrc, "code"));
  check("invite-create: Go service has json tag 'expires_at'", hasJsonTag(inviteSrc, "expires_at"));
}

// ── identity-profile ─────────────────────────────────────────────────────────
const identSrc = goSource("apps/server-api/internal/identity/service.go");
const profile = readFixture("packages/contracts/fixtures/v1/rest/identity-profile.json");
if (profile) {
  for (const field of ["id", "username", "display_name", "email", "roles"]) {
    check(`identity-profile: '${field}' in fixture and Go source`, (field in profile) && hasJsonTag(identSrc, field));
  }
}

// ── room ─────────────────────────────────────────────────────────────────────
const roomSrc = goSource("apps/server-api/internal/room/service.go");
const room = readFixture("packages/contracts/fixtures/v1/rest/room.json");
if (room) {
  for (const field of ["id", "name", "description", "position", "created_at"]) {
    check(`room: '${field}' in fixture and Go source`, (field in room) && hasJsonTag(roomSrc, field));
  }
}

// ── channel ──────────────────────────────────────────────────────────────────
const chanSrc = goSource("apps/server-api/internal/channel/service.go");
const channel = readFixture("packages/contracts/fixtures/v1/rest/channel.json");
if (channel) {
  for (const field of ["id", "room_id", "name", "type", "position", "created_at"]) {
    check(`channel: '${field}' in fixture and Go source`, (field in channel) && hasJsonTag(chanSrc, field));
  }
}

// ── message ──────────────────────────────────────────────────────────────────
const msgSrc = goSource("apps/server-api/internal/message/service.go");
const msg = readFixture("packages/contracts/fixtures/v1/rest/message.json");
if (msg) {
  for (const field of ["id", "channel_id", "sender", "content", "created_at"]) {
    check(`message: '${field}' in fixture and Go source`, (field in msg) && hasJsonTag(msgSrc, field));
  }
  check("message: 'attachment' key in fixture", "attachment" in msg);
  check("message: Go source has json tag 'attachment'", hasJsonTag(msgSrc, "attachment,omitempty") || hasJsonTag(msgSrc, "attachment"));
}

// ── message-list ─────────────────────────────────────────────────────────────
const msgList = readFixture("packages/contracts/fixtures/v1/rest/message-list.json");
if (msgList) {
  check("message-list: 'messages' in fixture and Go source", ("messages" in msgList) && hasJsonTag(msgSrc, "messages"));
  check("message-list: 'has_more' in fixture and Go source", ("has_more" in msgList) && hasJsonTag(msgSrc, "has_more"));
}

// ── admin-identity ────────────────────────────────────────────────────────────
const adminSrc = goSource("apps/server-api/internal/admin/service.go");
const adminId = readFixture("packages/contracts/fixtures/v1/rest/admin-identity.json");
if (adminId) {
  for (const field of ["id", "username", "display_name", "email", "is_disabled", "roles"]) {
    check(`admin-identity: '${field}' in fixture and Go source`, (field in adminId) && hasJsonTag(adminSrc, field));
  }
}

// ── error ─────────────────────────────────────────────────────────────────────
const responseSrc = goSource("apps/server-api/internal/httputil/response.go");
const errFix = readFixture("packages/contracts/fixtures/v1/rest/error.json");
if (errFix) {
  check("error: 'error' key in fixture", "error" in errFix);
  check("error: Go httputil uses 'error' key in WriteError", hasStringKey(responseSrc, "error"));
}

// ── error-validation ──────────────────────────────────────────────────────────
const errVal = readFixture("packages/contracts/fixtures/v1/rest/error-validation.json");
if (errVal) {
  check("error-validation: has error='validation_error'", errVal.error === "validation_error");
  check("error-validation: 'field' key in fixture", "field" in errVal);
  check("error-validation: Go httputil uses 'field' key", hasStringKey(responseSrc, "field"));
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
