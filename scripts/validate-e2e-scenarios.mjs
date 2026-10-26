#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) { console.log(`  ✓ ${label}`); pass++; }
  else { console.log(`  ✗ ${label}`); fail++; }
}

function fileContains(path, ...patterns) {
  if (!existsSync(path)) return false;
  const content = readFileSync(path, "utf8");
  return patterns.every((p) => content.includes(p));
}

console.log("validate-e2e-scenarios");

// ── e2e-admin-bootstrap-flow ──────────────────────────────────────────────────
const bootstrap = "scripts/e2e-admin-bootstrap-flow.mjs";
check("e2e-admin-bootstrap-flow.mjs exists", existsSync(bootstrap));
for (let i = 1; i <= 12; i++) check(`bootstrap Step ${i} present`, fileContains(bootstrap, `Step ${i}`));
check("bootstrap: covers /healthz",                    fileContains(bootstrap, "/healthz"));
check("bootstrap: covers /api/v1/bootstrap/status",    fileContains(bootstrap, "/api/v1/bootstrap/status"));
check("bootstrap: covers /api/v1/bootstrap",           fileContains(bootstrap, "/api/v1/bootstrap"));
check("bootstrap: covers /api/v1/me",                  fileContains(bootstrap, "/api/v1/me"));
check("bootstrap: covers /api/v1/admin/identities",    fileContains(bootstrap, "/api/v1/admin/identities"));
check("bootstrap: covers /api/v1/auth/login",          fileContains(bootstrap, "/api/v1/auth/login"));
check("bootstrap: uses API_URL",                       fileContains(bootstrap, "API_URL"));
check("bootstrap: handles process.exit",               fileContains(bootstrap, "process.exit"));
check("bootstrap: supports --dry-run",                 fileContains(bootstrap, "--dry-run"));

// ── e2e-text-chat-flow ────────────────────────────────────────────────────────
const textChat = "scripts/e2e-text-chat-flow.mjs";
check("e2e-text-chat-flow.mjs exists", existsSync(textChat));
for (let i = 1; i <= 12; i++) check(`text-chat Step ${i} present`, fileContains(textChat, `Step ${i}`));
check("text-chat: covers /api/v1/rooms",               fileContains(textChat, "/api/v1/rooms"));
check("text-chat: covers /channels",                   fileContains(textChat, "/channels"));
check("text-chat: covers /messages",                   fileContains(textChat, "/messages"));
check("text-chat: supports --dry-run",                 fileContains(textChat, "--dry-run"));

// ── e2e-voice-chat-flow ───────────────────────────────────────────────────────
const voice = "scripts/e2e-voice-chat-flow.mjs";
check("e2e-voice-chat-flow.mjs exists", existsSync(voice));
for (let i = 1; i <= 12; i++) check(`voice-chat Step ${i} present`, fileContains(voice, `Step ${i}`));
check("voice: covers /api/v1/rtc/token",              fileContains(voice, "/api/v1/rtc/token"));
check("voice: covers /api/v1/rtc/ice-servers",        fileContains(voice, "/api/v1/rtc/ice-servers"));
check("voice: covers /join",                           fileContains(voice, "/join"));
check("voice: covers /leave",                          fileContains(voice, "/leave"));
check("voice: supports --dry-run",                     fileContains(voice, "--dry-run"));

// ── e2e-files-dm-room-flow ────────────────────────────────────────────────────
const filesDm = "scripts/e2e-files-dm-room-flow.mjs";
check("e2e-files-dm-room-flow.mjs exists", existsSync(filesDm));
for (let i = 1; i <= 12; i++) check(`files-dm Step ${i} present`, fileContains(filesDm, `Step ${i}`));
check("files-dm: covers /attachments/upload-url",      fileContains(filesDm, "/attachments/upload-url"));
check("files-dm: covers /dm/conversations",            fileContains(filesDm, "/dm/conversations"));
check("files-dm: covers /search/messages",             fileContains(filesDm, "/search/messages"));
check("files-dm: covers /search/dm",                   fileContains(filesDm, "/search/dm"));
check("files-dm: supports --dry-run",                  fileContains(filesDm, "--dry-run"));

// ── load-test ─────────────────────────────────────────────────────────────────
const load = "scripts/load-test.mjs";
check("load-test.mjs exists",                          existsSync(load));
for (let i = 1; i <= 10; i++) check(`load Test ${i} present`, fileContains(load, `Test ${i}`));
check("load-test: covers concurrent requests",         fileContains(load, "Promise.all"));
check("load-test: checks for 5xx errors",              fileContains(load, "500"));
check("load-test: supports --dry-run",                 fileContains(load, "--dry-run"));

console.log("");
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
