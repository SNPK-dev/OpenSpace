#!/usr/bin/env node
/**
 * SCENARIO: Admin bootstrap flow
 *
 * Step 1:  GET  /healthz                           → 200 bootstrapped=false
 * Step 2:  GET  /api/v1/bootstrap/status           → 200 {bootstrapped:false}
 * Step 3:  POST /api/v1/bootstrap (invalid)        → 400 validation_error
 * Step 4:  POST /api/v1/bootstrap (valid)          → 201 {server_id,identity_id,token}
 * Step 5:  GET  /api/v1/bootstrap/status           → 200 {bootstrapped:true}
 * Step 6:  GET  /healthz                           → 200 bootstrapped=true
 * Step 7:  GET  /api/v1/me                         → 200 {id,username,roles}
 * Step 8:  GET  /api/v1/admin/identities           → 200 array[1]
 * Step 9:  POST /api/v1/auth/login                 → 200 {token,identity}
 * Step 10: POST /api/v1/bootstrap (repeat)         → 409 already_bootstrapped
 * Step 11: GET  /api/v1/admin/identities (no auth) → 401 unauthorized
 * Step 12: GET  /api/v1/admin/identities (bad tok) → 401 unauthorized
 * Step 13: GET  /api/v1/admin/backup               → 200 (backup list smoke test)
 *
 * Usage:
 *   node scripts/e2e-admin-bootstrap-flow.mjs
 *   API_URL=http://api:8080 node scripts/e2e-admin-bootstrap-flow.mjs
 *   node scripts/e2e-admin-bootstrap-flow.mjs --dry-run
 */
import { randomBytes } from "node:crypto";

const API_URL = (process.env.API_URL ?? "http://localhost:8080").replace(/\/$/, "");
const DRY_RUN = process.argv.includes("--dry-run");

const adminUsername = `e2e_admin_${randomBytes(4).toString("hex")}`;
const adminPassword = randomBytes(8).toString("hex");
let adminToken = null;
let adminIdentityID = null;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(method, path, body = null, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON body */ }
  return { status: res.status, body: json };
}

async function step(n, description, fn) {
  if (DRY_RUN) {
    console.log(`  [PLAN] Step ${n}: ${description}`);
    return;
  }
  try {
    await fn();
    console.log(`  [PASS] Step ${n}: ${description}`);
    passed++;
  } catch (err) {
    console.log(`  [FAIL] Step ${n}: ${description}`);
    console.log(`         ${err.message}`);
    failed++;
  }
}

console.log("SCENARIO: Admin bootstrap flow");
console.log(`  API: ${API_URL}`);
if (DRY_RUN) console.log("  MODE: dry-run (no HTTP calls)\n");
else console.log("");

// Step 1: Health check — server up, not yet bootstrapped
await step(1, "GET /healthz → 200 bootstrapped=false", async () => {
  const { status, body } = await api("GET", "/healthz");
  assert(status === 200, `expected 200, got ${status}`);
  assert(body?.status === "ok", `expected status=ok, got ${JSON.stringify(body?.status)}`);
  assert(body?.bootstrapped === false, `expected bootstrapped=false, got ${body?.bootstrapped}`);
});

// Step 2: Bootstrap status endpoint — not bootstrapped
await step(2, "GET /api/v1/bootstrap/status → 200 {bootstrapped:false}", async () => {
  const { status, body } = await api("GET", "/api/v1/bootstrap/status");
  assert(status === 200, `expected 200, got ${status}`);
  assert(body?.bootstrapped === false, `expected bootstrapped=false, got ${body?.bootstrapped}`);
});

// Step 3: Bootstrap with invalid payload (empty server_name) → 400
await step(3, "POST /api/v1/bootstrap (invalid) → 400 validation_error", async () => {
  const { status, body } = await api("POST", "/api/v1/bootstrap", {
    server_name: "",
    admin_username: adminUsername,
    admin_email: "",
    admin_password: adminPassword,
  });
  assert(status === 400, `expected 400, got ${status}`);
  assert(typeof body?.error === "string", `expected error string, got ${JSON.stringify(body)}`);
});

// Step 4: Successful bootstrap
await step(4, "POST /api/v1/bootstrap (valid) → 201 {server_id,identity_id,token}", async () => {
  const { status, body } = await api("POST", "/api/v1/bootstrap", {
    server_name: "E2E Server",
    admin_username: adminUsername,
    admin_email: "",
    admin_password: adminPassword,
  });
  assert(status === 201, `expected 201, got ${status}`);
  assert(typeof body?.server_id === "string" && body.server_id.length > 0,
    `expected server_id string, got ${JSON.stringify(body?.server_id)}`);
  assert(typeof body?.identity_id === "string" && body.identity_id.length > 0,
    `expected identity_id string, got ${JSON.stringify(body?.identity_id)}`);
  assert(typeof body?.token === "string" && body.token.length === 64,
    `expected 64-char token, got length ${body?.token?.length}`);
  adminToken = body.token;
  adminIdentityID = body.identity_id;
});

// Step 5: Bootstrap status — now bootstrapped
await step(5, "GET /api/v1/bootstrap/status → 200 {bootstrapped:true}", async () => {
  const { status, body } = await api("GET", "/api/v1/bootstrap/status");
  assert(status === 200, `expected 200, got ${status}`);
  assert(body?.bootstrapped === true, `expected bootstrapped=true, got ${body?.bootstrapped}`);
});

// Step 6: Health check — now bootstrapped
await step(6, "GET /healthz → 200 bootstrapped=true", async () => {
  const { status, body } = await api("GET", "/healthz");
  assert(status === 200, `expected 200, got ${status}`);
  assert(body?.bootstrapped === true, `expected bootstrapped=true, got ${body?.bootstrapped}`);
});

// Step 7: Get own profile with admin token
await step(7, "GET /api/v1/me → 200 {id,username,roles:[owner]}", async () => {
  const { status, body } = await api("GET", "/api/v1/me", null, adminToken);
  assert(status === 200, `expected 200, got ${status}`);
  assert(body?.id === adminIdentityID, `expected id=${adminIdentityID}, got ${body?.id}`);
  assert(Array.isArray(body?.roles), `expected roles array, got ${JSON.stringify(body?.roles)}`);
  assert(body.roles.includes("owner"), `expected roles to include 'owner', got ${JSON.stringify(body.roles)}`);
});

// Step 8: List identities — exactly one
await step(8, "GET /api/v1/admin/identities → 200 array[1]", async () => {
  const { status, body } = await api("GET", "/api/v1/admin/identities", null, adminToken);
  assert(status === 200, `expected 200, got ${status}`);
  assert(Array.isArray(body), `expected array, got ${typeof body}`);
  assert(body.length === 1, `expected 1 identity, got ${body.length}`);
  assert(body[0].id === adminIdentityID, `expected first identity id=${adminIdentityID}`);
});

// Step 9: Login with admin credentials
await step(9, "POST /api/v1/auth/login → 200 {token,identity}", async () => {
  const { status, body } = await api("POST", "/api/v1/auth/login", {
    username: adminUsername,
    password: adminPassword,
  });
  assert(status === 200, `expected 200, got ${status}`);
  assert(typeof body?.token === "string" && body.token.length === 64,
    `expected 64-char token, got ${body?.token?.length}`);
  const identityId = body?.identity?.id ?? body?.identity_id;
  assert(identityId === adminIdentityID,
    `expected identity id=${adminIdentityID}, got ${identityId}`);
});

// Step 10: Second bootstrap attempt → 409
await step(10, "POST /api/v1/bootstrap (repeat) → 409 already_bootstrapped", async () => {
  const { status, body } = await api("POST", "/api/v1/bootstrap", {
    server_name: "E2E Server",
    admin_username: adminUsername,
    admin_email: "",
    admin_password: adminPassword,
  });
  assert(status === 409, `expected 409, got ${status}`);
  assert(body?.error === "already_bootstrapped",
    `expected error=already_bootstrapped, got ${JSON.stringify(body?.error)}`);
});

// Step 11: Admin endpoint without auth → 401
await step(11, "GET /api/v1/admin/identities (no auth) → 401", async () => {
  const { status, body } = await api("GET", "/api/v1/admin/identities");
  assert(status === 401, `expected 401, got ${status}`);
  assert(body?.error === "unauthorized",
    `expected error=unauthorized, got ${JSON.stringify(body?.error)}`);
});

// Step 12: Admin endpoint with malformed token → 401
await step(12, "GET /api/v1/admin/identities (bad token) → 401", async () => {
  const { status, body } = await api("GET", "/api/v1/admin/identities", null, "notavalidtoken");
  assert(status === 401, `expected 401, got ${status}`);
  assert(body?.error === "unauthorized",
    `expected error=unauthorized, got ${JSON.stringify(body?.error)}`);
});

// Step 13: Backup list smoke test — endpoint reachable and returns valid structure
await step(13, "GET /api/v1/admin/backup → 200 (backup list)", async () => {
  const { status, body } = await api("GET", "/api/v1/admin/backup", null, adminToken);
  assert(status === 200, `expected 200, got ${status}`);
  assert(
    Array.isArray(body) || (typeof body === "object" && body !== null),
    `expected array or object, got ${JSON.stringify(body)}`
  );
});

console.log("");
const total = passed + failed;
if (DRY_RUN) {
  console.log("13/13 steps planned (dry-run)");
} else if (failed === 0) {
  console.log(`${total}/${total} steps passed`);
} else {
  console.log(`${passed}/${total} steps passed, ${failed} failed`);
  process.exit(1);
}
