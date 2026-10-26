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

function fileContains(path, ...patterns) {
  if (!existsSync(path)) return false;
  const content = readFileSync(path, "utf8");
  return patterns.every((p) => content.includes(p));
}

function fileNotContains(path, pattern) {
  if (!existsSync(path)) return true;
  return !readFileSync(path, "utf8").includes(pattern);
}

console.log("validate-security-hardening");

const serverFile   = "apps/server-api/internal/server/server.go";
const headersFile  = "apps/server-api/internal/httputil/headers.go";
const authMidFile  = "apps/server-api/internal/auth/middleware.go";
const sessionTokenFile = "apps/server-api/internal/sessiontoken/token.go";
const attachFile   = "apps/server-api/internal/attachment/service.go";

// HTTP server hardening
check("server has ReadHeaderTimeout",   fileContains(serverFile, "ReadHeaderTimeout"));
check("server has MaxHeaderBytes",      fileContains(serverFile, "MaxHeaderBytes"));

// Security headers
check("SecureHeaders function defined", fileContains(headersFile, "SecureHeaders"));
check("headers.go sets nosniff",        fileContains(headersFile, "nosniff"));
check("headers.go sets X-Frame-Options", fileContains(headersFile, "X-Frame-Options"));

// Session token pre-validation
check("auth middleware delegates canonical token validation", fileContains(authMidFile, "sessiontoken.Valid"));
check("session token helper fixes 256-bit encoded length", fileContains(sessionTokenFile, "EncodedLength = 64"));
check("session token helper hashes credentials", fileContains(sessionTokenFile, "sha256.Sum256"));

// Attachment object key sanitization
check("attachment object key uses 2-segment path (no user filename)",
  fileContains(attachFile, `"attachments/%s/%s"`) &&
  fileNotContains(attachFile, `"attachments/%s/%s/%s"`));

console.log("");
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
