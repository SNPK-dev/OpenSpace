#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";

let pass = 0;
let fail = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}${detail ? `: ${detail}` : ""}`);
    fail++;
  }
}

function fileContains(path, ...patterns) {
  if (!existsSync(path)) return false;
  const content = readFileSync(path, "utf8");
  return patterns.every((p) => content.includes(p));
}

console.log("validate-ratelimits");

check(
  "internal/ratelimit/limiter.go exists",
  existsSync("apps/server-api/internal/ratelimit/limiter.go")
);
check(
  "limiter.go contains Incr (Redis INCR)",
  fileContains("apps/server-api/internal/ratelimit/limiter.go", "Incr")
);
check(
  "limiter.go contains fail-open on Redis error",
  fileContains("apps/server-api/internal/ratelimit/limiter.go", "return true")
);
check(
  "internal/ratelimit/middleware.go exists",
  existsSync("apps/server-api/internal/ratelimit/middleware.go")
);
check(
  "middleware.go contains IPLimit",
  fileContains("apps/server-api/internal/ratelimit/middleware.go", "IPLimit")
);
check(
  "middleware.go contains IdentityLimit",
  fileContains("apps/server-api/internal/ratelimit/middleware.go", "IdentityLimit")
);
check(
  "middleware.go returns 429 Too Many Requests",
  fileContains("apps/server-api/internal/ratelimit/middleware.go", "TooManyRequests")
);
check(
  "config.go contains RateDisabled",
  fileContains("apps/server-api/internal/config/config.go", "RateDisabled")
);
check(
  "config.go reads RATE_DISABLED env var",
  fileContains("apps/server-api/internal/config/config.go", "RATE_DISABLED")
);
check(
  "server.go imports ratelimit package",
  fileContains("apps/server-api/internal/server/server.go", "ratelimit")
);
check(
  "server.go applies IPLimit to auth:login",
  fileContains("apps/server-api/internal/server/server.go", "auth:login")
);
check(
  "server.go applies IdentityLimit to msg:send",
  fileContains("apps/server-api/internal/server/server.go", "msg:send")
);
check(
  "main.go constructs ratelimit.New",
  fileContains("apps/server-api/cmd/server-api/main.go", "ratelimit.New")
);

console.log("");
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
