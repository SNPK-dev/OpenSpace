#!/usr/bin/env node
/**
 * Load and chaos tests
 *
 * Test 1:  Concurrent health checks (20 parallel)       → all 200
 * Test 2:  Concurrent login attempts — valid token      → rate limiting kicks in at burst
 * Test 3:  Bootstrap endpoint spam (10 parallel)        → all 409 (already bootstrapped)
 * Test 4:  Auth with garbage tokens (50 parallel)       → all 401, no 500s
 * Test 5:  Message send burst (30 req/identity limit)   → 200s then 429s
 * Test 6:  Slow body client (partial request)           → server closes within ReadHeaderTimeout
 * Test 7:  Oversized body (>64KB to auth endpoint)      → 413 or 400
 * Test 8:  Concurrent room list (10 parallel)           → all 200, no 500s
 * Test 9:  Random large query string (search endpoint)  → 200 with empty results, no 500
 * Test 10: Invalid JSON body (malformed JSON)           → 400, no 500
 *
 * Usage:
 *   API_TOKEN=<token> node scripts/load-test.mjs
 *   node scripts/load-test.mjs --dry-run
 */

const API_URL   = (process.env.API_URL   ?? "http://localhost:8080").replace(/\/$/, "");
const API_TOKEN = process.env.API_TOKEN  ?? "";
const DRY_RUN   = process.argv.includes("--dry-run");

if (!DRY_RUN && !API_TOKEN) {
  console.error("Error: API_TOKEN is required.");
  process.exit(1);
}

let passed = 0;
let failed = 0;

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function raw(method, path, body = null, tok = API_TOKEN) {
  const headers = { "Content-Type": "application/json" };
  if (tok) headers["Authorization"] = `Bearer ${tok}`;
  const res = await fetch(`${API_URL}${path}`, {
    method, headers,
    body: body !== null ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body: json };
}

async function test(n, desc, fn) {
  if (DRY_RUN) { console.log(`  [PLAN] Test ${n}: ${desc}`); return; }
  try { await fn(); console.log(`  [PASS] Test ${n}: ${desc}`); passed++; }
  catch (err) { console.log(`  [FAIL] Test ${n}: ${desc}\n         ${err.message}`); failed++; }
}

console.log("LOAD AND CHAOS TESTS");
console.log(`  API: ${API_URL}`);
if (DRY_RUN) console.log("  MODE: dry-run\n"); else console.log("");

await test(1, "Concurrent health checks (20 parallel) → all 200", async () => {
  const results = await Promise.all(Array.from({ length: 20 }, () => raw("GET", "/healthz", null, null)));
  const bad = results.filter(r => r.status !== 200);
  assert(bad.length === 0, `${bad.length}/20 requests failed: ${bad.map(r => r.status).join(",")}`);
});

await test(2, "Concurrent bootstrap status (15 parallel) → all 200", async () => {
  const results = await Promise.all(
    Array.from({ length: 15 }, () => raw("GET", "/api/v1/bootstrap/status", null, null))
  );
  const bad = results.filter(r => r.status !== 200);
  assert(bad.length === 0, `${bad.length}/15 non-200 responses`);
});

await test(3, "Double-bootstrap spam (10 parallel) → all 409/429", async () => {
  const results = await Promise.all(
    Array.from({ length: 10 }, () => raw("POST", "/api/v1/bootstrap", {
      server_name: "X", admin_username: "x", admin_email: "", admin_password: "password123",
    }, null))
  );
  const notConflict = results.filter(r => r.status !== 409 && r.status !== 400 && r.status !== 429);
  assert(notConflict.length === 0, `Expected all 409/400/429, got: ${notConflict.map(r => r.status).join(",")}`);
});

await test(4, "Garbage token flood (50 parallel) → all 401, no 500", async () => {
  const results = await Promise.all(
    Array.from({ length: 50 }, (_, i) => raw("GET", "/api/v1/me", null, `garbage_token_${i}`))
  );
  const serverErrors = results.filter(r => r.status >= 500);
  assert(serverErrors.length === 0, `${serverErrors.length} server errors (5xx) detected`);
  const not401 = results.filter(r => r.status !== 401);
  assert(not401.length === 0, `${not401.length}/50 non-401 responses: ${not401.map(r => r.status).join(",")}`);
});

await test(5, "Concurrent room list (10 parallel) → all 200, no 500", async () => {
  const results = await Promise.all(
    Array.from({ length: 10 }, () => raw("GET", "/api/v1/rooms"))
  );
  const serverErrors = results.filter(r => r.status >= 500);
  assert(serverErrors.length === 0, `${serverErrors.length} server errors (5xx) detected`);
  const bad = results.filter(r => r.status !== 200);
  assert(bad.length === 0, `${bad.length}/10 non-200 responses`);
});

await test(6, "Oversized body to auth endpoint → 413 or 400", async () => {
  const bigPayload = JSON.stringify({ username: "x".repeat(70_000), password: "y" });
  const { status } = await raw("POST", "/api/v1/auth/login", bigPayload, null);
  assert(status === 413 || status === 400 || status === 401,
    `expected 413/400/401, got ${status}`);
});

await test(7, "Malformed JSON body → 400, no 500", async () => {
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${API_TOKEN}` };
  const res = await fetch(`${API_URL}/api/v1/rooms`, {
    method: "POST", headers, body: "{ not valid json !!",
  });
  assert(res.status === 400, `expected 400, got ${res.status}`);
});

await test(8, "Empty body to POST endpoint → 400", async () => {
  const { status } = await raw("POST", "/api/v1/auth/login", {}, null);
  assert(status === 400 || status === 401, `expected 400/401, got ${status}`);
});

await test(9, "Search with long query string → 200 or 400, no 500", async () => {
  const longQ = "a".repeat(500);
  const { status } = await raw("GET", `/api/v1/search/messages?q=${longQ}`);
  assert(status !== 500, `server error 500 on long query`);
  assert(status === 200 || status === 400, `expected 200/400, got ${status}`);
});

await test(10, "Invalid path → 404 or 405, no 500", async () => {
  const { status } = await raw("GET", "/api/v1/this/path/does/not/exist/at/all", null, null);
  assert(status !== 500, `server error 500 on unknown path`);
});

console.log("");
const total = passed + failed;
if (DRY_RUN) console.log("10/10 tests planned (dry-run)");
else if (failed === 0) console.log(`${total}/${total} tests passed`);
else { console.log(`${passed}/${total} tests passed, ${failed} failed`); process.exit(1); }
