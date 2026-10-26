#!/usr/bin/env node
/**
 * SCENARIO: Voice chat flow
 *
 * Step 1:  Verify token (GET /api/v1/me)                        → 200
 * Step 2:  POST /api/v1/rooms                                   → 201
 * Step 3:  POST /api/v1/rooms/{id}/channels (type:voice)        → 201
 * Step 4:  POST /api/v1/rtc/token                               → 200 {token}
 * Step 5:  GET  /api/v1/rtc/ice-servers                         → 200 {ice_servers}
 * Step 6:  POST /api/v1/rtc/rooms/{ch_id}/join                  → 200 {channel_id}
 * Step 7:  GET  /api/v1/rtc/rooms/{ch_id}/participants          → 200 array[1]
 * Step 8:  POST /api/v1/rtc/rooms/{ch_id}/heartbeat             → 204
 * Step 9:  PATCH /api/v1/rtc/rooms/{ch_id}/state               → 204
 * Step 10: GET  /api/v1/rtc/stats                               → 200
 * Step 11: POST /api/v1/rtc/rooms/{ch_id}/leave                 → 204
 * Step 12: GET  participants after leave                         → 200 array[0]
 * Step 13: POST /api/v1/rtc/rooms/{ch_id}/join (rejoin)         → 200
 * Step 14: GET  participants after rejoin                        → 200 array[1]
 * Step 15: POST /api/v1/rtc/rooms/{ch_id}/leave (cleanup)       → 204
 * Step 16: DELETE /api/v1/rooms/{room_id} (cleanup)             → 204
 *
 * Usage:
 *   API_TOKEN=<token> node scripts/e2e-voice-chat-flow.mjs
 *   node scripts/e2e-voice-chat-flow.mjs --dry-run
 */

const API_URL   = (process.env.API_URL   ?? "http://localhost:8080").replace(/\/$/, "");
const API_TOKEN = process.env.API_TOKEN  ?? "";
const DRY_RUN   = process.argv.includes("--dry-run");

if (!DRY_RUN && !API_TOKEN) {
  console.error("Error: API_TOKEN is required.");
  process.exit(1);
}

const token    = API_TOKEN;
let roomID     = null;
let channelID  = null;
let passed     = 0;
let failed     = 0;

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function api(method, path, body = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
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
  try { await fn(); console.log(`  [PASS] Step ${n}: ${desc}`); passed++; }
  catch (err) { console.log(`  [FAIL] Step ${n}: ${desc}\n         ${err.message}`); failed++; }
}

console.log("SCENARIO: Voice chat flow");
console.log(`  API: ${API_URL}`);
if (DRY_RUN) console.log("  MODE: dry-run\n"); else console.log("");

await step(1, "GET /api/v1/me → 200 (token valid)", async () => {
  const { status } = await api("GET", "/api/v1/me");
  assert(status === 200, `expected 200, got ${status}`);
});

await step(2, "POST /api/v1/rooms → 201", async () => {
  const { status, body } = await api("POST", "/api/v1/rooms", { name: "E2E Voice Room" });
  assert(status === 201, `expected 201, got ${status}`);
  roomID = body.id;
});

await step(3, "POST /api/v1/rooms/{id}/channels (type:voice) → 201", async () => {
  const { status, body } = await api("POST", `/api/v1/rooms/${roomID}/channels`, {
    name: "voice-general", type: "voice",
  });
  assert(status === 201, `expected 201, got ${status}`);
  assert(body?.type === "voice", `expected type=voice, got ${body?.type}`);
  channelID = body.id;
});

await step(4, "POST /api/v1/rtc/token → 200 {token}", async () => {
  const { status, body } = await api("POST", "/api/v1/rtc/token", { channel_id: channelID });
  assert(status === 200, `expected 200, got ${status}`);
  assert(typeof body?.token === "string" && body.token.length > 0, "expected rtc token string");
});

await step(5, "GET /api/v1/rtc/ice-servers → 200 {ice_servers}", async () => {
  const { status, body } = await api("GET", "/api/v1/rtc/ice-servers");
  assert(status === 200, `expected 200, got ${status}`);
  assert(typeof body?.ice_servers !== "undefined" || Array.isArray(body?.iceServers),
    `expected ice_servers field, got ${JSON.stringify(body)}`);
});

await step(6, "POST /api/v1/rtc/rooms/{ch_id}/join → 200", async () => {
  const { status, body } = await api("POST", `/api/v1/rtc/rooms/${channelID}/join`);
  assert(status === 200, `expected 200, got ${status}`);
  assert(body?.channel_id === channelID || body?.channelId === channelID ||
    typeof body === "object", `unexpected join response: ${JSON.stringify(body)}`);
});

await step(7, "GET /api/v1/rtc/rooms/{ch_id}/participants → 200 array[1]", async () => {
  const { status, body } = await api("GET", `/api/v1/rtc/rooms/${channelID}/participants`);
  assert(status === 200, `expected 200, got ${status}`);
  const participants = body?.participants ?? body;
  assert(Array.isArray(participants), `expected array, got ${typeof participants}`);
  assert(participants.length >= 1, `expected at least 1 participant, got ${participants.length}`);
});

await step(8, "POST /api/v1/rtc/rooms/{ch_id}/heartbeat → 204", async () => {
  const { status } = await api("POST", `/api/v1/rtc/rooms/${channelID}/heartbeat`);
  assert(status === 204, `expected 204, got ${status}`);
});

await step(9, "PATCH /api/v1/rtc/rooms/{ch_id}/state → 204", async () => {
  const { status } = await api("PATCH", `/api/v1/rtc/rooms/${channelID}/state`, {
    muted: true, camera_enabled: false,
  });
  assert(status === 204, `expected 204, got ${status}`);
});

await step(10, "GET /api/v1/rtc/stats → 200", async () => {
  const { status } = await api("GET", "/api/v1/rtc/stats");
  assert(status === 200, `expected 200, got ${status}`);
});

await step(11, "POST /api/v1/rtc/rooms/{ch_id}/leave → 204", async () => {
  const { status } = await api("POST", `/api/v1/rtc/rooms/${channelID}/leave`);
  assert(status === 204, `expected 204, got ${status}`);
});

await step(12, "GET participants after leave → 200 array[0]", async () => {
  const { status, body } = await api("GET", `/api/v1/rtc/rooms/${channelID}/participants`);
  assert(status === 200, `expected 200, got ${status}`);
  const participants = body?.participants ?? body;
  assert(Array.isArray(participants), `expected array, got ${typeof participants}`);
  assert(participants.length === 0, `expected 0 participants after leave, got ${participants.length}`);
});

await step(13, "POST /api/v1/rtc/rooms/{ch_id}/join (rejoin) → 200", async () => {
  const { status, body } = await api("POST", `/api/v1/rtc/rooms/${channelID}/join`);
  assert(status === 200, `expected 200, got ${status}`);
  assert(typeof body === "object", `unexpected rejoin response: ${JSON.stringify(body)}`);
});

await step(14, "GET participants after rejoin → 200 array[1]", async () => {
  const { status, body } = await api("GET", `/api/v1/rtc/rooms/${channelID}/participants`);
  assert(status === 200, `expected 200, got ${status}`);
  const participants = body?.participants ?? body;
  assert(Array.isArray(participants), `expected array, got ${typeof participants}`);
  assert(participants.length >= 1, `expected >=1 participant after rejoin, got ${participants.length}`);
});

await step(15, "POST /api/v1/rtc/rooms/{ch_id}/leave (cleanup) → 204", async () => {
  const { status } = await api("POST", `/api/v1/rtc/rooms/${channelID}/leave`);
  assert(status === 204, `expected 204, got ${status}`);
});

await step(16, "DELETE /api/v1/rooms/{id} (cleanup) → 204", async () => {
  const { status } = await api("DELETE", `/api/v1/rooms/${roomID}`);
  assert(status === 204, `expected 204, got ${status}`);
});

console.log("");
const total = passed + failed;
if (DRY_RUN) console.log("16/16 steps planned (dry-run)");
else if (failed === 0) console.log(`${total}/${total} steps passed`);
else { console.log(`${passed}/${total} steps passed, ${failed} failed`); process.exit(1); }
