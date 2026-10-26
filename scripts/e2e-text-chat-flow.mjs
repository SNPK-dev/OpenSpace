#!/usr/bin/env node
/**
 * SCENARIO: Text chat flow
 *
 * Step 1:  POST /api/v1/auth/login (user A)                     → 200 {token,identity_id}
 * Step 2:  POST /api/v1/rooms                                   → 201 {id,name}
 * Step 3:  GET  /api/v1/rooms                                   → 200 array includes room
 * Step 4:  GET  /api/v1/rooms/{room_id}                         → 200 {id,name}
 * Step 5:  POST /api/v1/rooms/{room_id}/channels (type:text)    → 201 {id,room_id,type}
 * Step 6:  GET  /api/v1/rooms/{room_id}/channels                → 200 array[1]
 * Step 7:  POST /api/v1/rooms/{room_id}/channels/{ch_id}/messages → 201 {id,channel_id,content}
 * Step 8:  GET  /api/v1/rooms/{room_id}/channels/{ch_id}/messages → 200 {messages:[1],has_more:false}
 * Step 9:  POST second message                                  → 201
 * Step 10: GET  messages?limit=1                                → 200 {messages:[1],has_more:true}
 * Step 11: DELETE first message                                 → 204
 * Step 12: GET  messages after delete                           → 200 messages[1] (second remains)
 * Step 13: POST /api/v1/auth/logout                             → 204 (session invalidated)
 * Step 14: DELETE /api/v1/rooms/{room_id} (cleanup, new token) → 204
 *
 * Usage:
 *   API_TOKEN=<token> node scripts/e2e-text-chat-flow.mjs
 *   API_URL=http://api:8080 API_TOKEN=<token> node scripts/e2e-text-chat-flow.mjs
 *   node scripts/e2e-text-chat-flow.mjs --dry-run
 */

const API_URL   = (process.env.API_URL   ?? "http://localhost:8080").replace(/\/$/, "");
const API_TOKEN = process.env.API_TOKEN  ?? "";
const DRY_RUN   = process.argv.includes("--dry-run");

if (!DRY_RUN && !API_TOKEN) {
  console.error("Error: API_TOKEN is required. Run pnpm e2e:bootstrap first to obtain a token.");
  process.exit(1);
}

let token      = API_TOKEN;
let roomID     = null;
let channelID  = null;
let msgID1     = null;

let passed = 0;
let failed = 0;

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function api(method, path, body = null, tok = token) {
  const headers = { "Content-Type": "application/json" };
  if (tok) headers["Authorization"] = `Bearer ${tok}`;
  const res = await fetch(`${API_URL}${path}`, {
    method, headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body: json };
}

async function step(n, desc, fn) {
  if (DRY_RUN) { console.log(`  [PLAN] Step ${n}: ${desc}`); return; }
  try {
    await fn();
    console.log(`  [PASS] Step ${n}: ${desc}`);
    passed++;
  } catch (err) {
    console.log(`  [FAIL] Step ${n}: ${desc}`);
    console.log(`         ${err.message}`);
    failed++;
  }
}

console.log("SCENARIO: Text chat flow");
console.log(`  API: ${API_URL}`);
if (DRY_RUN) console.log("  MODE: dry-run\n"); else console.log("");

// Step 1: Login with env credentials (requires API_USERNAME + API_PASSWORD)
await step(1, "POST /api/v1/auth/login → 200", async () => {
  const username = process.env.API_USERNAME;
  const password = process.env.API_PASSWORD;
  if (!username || !password) {
    // Already have API_TOKEN, skip login — token is already set
    assert(token.length === 64, "API_TOKEN must be a 64-char hex token");
    return;
  }
  const { status, body } = await api("POST", "/api/v1/auth/login", { username, password }, null);
  assert(status === 200, `expected 200, got ${status}`);
  assert(typeof body?.token === "string", "expected token string");
  token = body.token;
});

// Step 2: Create room
await step(2, "POST /api/v1/rooms → 201 {id,name}", async () => {
  const { status, body } = await api("POST", "/api/v1/rooms", { name: "E2E Text Room" });
  assert(status === 201, `expected 201, got ${status}`);
  assert(typeof body?.id === "string", `expected id string, got ${JSON.stringify(body)}`);
  assert(body?.name === "E2E Text Room", `expected name "E2E Text Room", got ${body?.name}`);
  roomID = body.id;
});

// Step 3: List rooms — includes new room
await step(3, "GET /api/v1/rooms → 200 array includes room", async () => {
  const { status, body } = await api("GET", "/api/v1/rooms");
  assert(status === 200, `expected 200, got ${status}`);
  const rooms = body?.rooms ?? body;
  assert(Array.isArray(rooms), `expected array, got ${typeof rooms}`);
  assert(rooms.some(r => r.id === roomID), `room ${roomID} not found in list`);
});

// Step 4: Get room by ID
await step(4, "GET /api/v1/rooms/{id} → 200 {id,name}", async () => {
  const { status, body } = await api("GET", `/api/v1/rooms/${roomID}`);
  assert(status === 200, `expected 200, got ${status}`);
  assert(body?.id === roomID, `expected id=${roomID}, got ${body?.id}`);
  assert(typeof body?.name === "string", "expected name string");
});

// Step 5: Create text channel
await step(5, "POST /api/v1/rooms/{id}/channels (type:text) → 201", async () => {
  const { status, body } = await api("POST", `/api/v1/rooms/${roomID}/channels`, {
    name: "general", type: "text",
  });
  assert(status === 201, `expected 201, got ${status}`);
  assert(body?.type === "text", `expected type=text, got ${body?.type}`);
  assert(body?.room_id === roomID, `expected room_id=${roomID}`);
  channelID = body.id;
});

// Step 6: List channels — one channel
await step(6, "GET /api/v1/rooms/{id}/channels → 200 array[1]", async () => {
  const { status, body } = await api("GET", `/api/v1/rooms/${roomID}/channels`);
  assert(status === 200, `expected 200, got ${status}`);
  const channels = body?.channels ?? body;
  assert(Array.isArray(channels), `expected channels array, got ${typeof channels}`);
  assert(channels.some((channel) => channel.id === channelID), `created channel ${channelID} not found`);
});

// Step 7: Send first message
await step(7, "POST messages → 201 {id,channel_id,content}", async () => {
  const { status, body } = await api("POST",
    `/api/v1/rooms/${roomID}/channels/${channelID}/messages`,
    { content: "Hello, E2E!" });
  assert(status === 201, `expected 201, got ${status}`);
  assert(body?.channel_id === channelID, `expected channel_id=${channelID}`);
  assert(body?.content === "Hello, E2E!", `expected content match`);
  msgID1 = body.id;
});

// Step 8: List messages — 1 message, has_more false
await step(8, "GET messages → 200 {messages:[1],has_more:false}", async () => {
  const { status, body } = await api("GET",
    `/api/v1/rooms/${roomID}/channels/${channelID}/messages`);
  assert(status === 200, `expected 200, got ${status}`);
  assert(Array.isArray(body?.messages) && body.messages.length === 1,
    `expected 1 message, got ${body?.messages?.length}`);
  assert(body?.has_more === false, `expected has_more=false, got ${body?.has_more}`);
});

// Step 9: Send second message
await step(9, "POST second message → 201", async () => {
  const { status, body } = await api("POST",
    `/api/v1/rooms/${roomID}/channels/${channelID}/messages`,
    { content: "Second message" });
  assert(status === 201, `expected 201, got ${status}`);
  assert(typeof body?.id === "string", "expected id string");
});

// Step 10: List with limit=1 — has_more=true
await step(10, "GET messages?limit=1 → 200 {messages:[1],has_more:true}", async () => {
  const { status, body } = await api("GET",
    `/api/v1/rooms/${roomID}/channels/${channelID}/messages?limit=1`);
  assert(status === 200, `expected 200, got ${status}`);
  assert(body?.messages?.length === 1, `expected 1 message, got ${body?.messages?.length}`);
  assert(body?.has_more === true, `expected has_more=true, got ${body?.has_more}`);
});

// Step 11: Delete first message
await step(11, "DELETE message → 204", async () => {
  const { status } = await api("DELETE",
    `/api/v1/rooms/${roomID}/channels/${channelID}/messages/${msgID1}`);
  assert(status === 204, `expected 204, got ${status}`);
});

// Step 12: List after delete — second message still present
await step(12, "GET messages after delete → 200 messages[1]", async () => {
  const { status, body } = await api("GET",
    `/api/v1/rooms/${roomID}/channels/${channelID}/messages`);
  assert(status === 200, `expected 200, got ${status}`);
  assert(Array.isArray(body?.messages) && body.messages.length === 1,
    `expected 1 message remaining, got ${body?.messages?.length}`);
  assert(!body.messages.find(m => m.id === msgID1), "deleted message still present");
});

// Step 13: Delete room while the session is still valid (cascade cleanup)
await step(13, "DELETE /api/v1/rooms/{id} → 204", async () => {
  const { status } = await api("DELETE", `/api/v1/rooms/${roomID}`);
  assert(status === 204, `expected 204, got ${status}`);
});

// Step 14: Logout — session invalidated
await step(14, "POST /api/v1/auth/logout → 204 + token invalid", async () => {
  const { status } = await api("POST", "/api/v1/auth/logout");
  assert(status === 204, `expected 204, got ${status}`);
  // Verify old token is now invalid
  const { status: meStatus } = await api("GET", "/api/v1/me");
  assert(meStatus === 401, `expected 401 after logout, got ${meStatus}`);
});

console.log("");
const total = passed + failed;
if (DRY_RUN) console.log("14/14 steps planned (dry-run)");
else if (failed === 0) console.log(`${total}/${total} steps passed`);
else { console.log(`${passed}/${total} steps passed, ${failed} failed`); process.exit(1); }
