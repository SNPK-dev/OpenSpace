#!/usr/bin/env node
/**
 * SCENARIO: Files, DMs, and room search flow
 *
 * Step 1:  GET  /api/v1/me                                      → 200 (token valid)
 * Step 2:  POST /api/v1/attachments/upload-url + PUT to MinIO + confirm → 200 {url}
 * Step 3:  POST /api/v1/attachments/nonexistent/confirm          → 404/422
 * Step 4:  POST /api/v1/dm/conversations                        → 200/201 {id}
 * Step 5:  GET  /api/v1/dm/conversations                        → 200 array[>=1]
 * Step 6:  POST /api/v1/dm/conversations/{id}/messages          → 201 {id,content}
 * Step 7:  GET  /api/v1/dm/conversations/{id}/messages          → 200 {messages:[1]}
 * Step 8:  POST /api/v1/dm/conversations/{id}/messages (second) → 201
 * Step 9:  GET  /api/v1/dm/conversations/{id}/messages          → 200 messages.length>=2
 * Step 10: DELETE /api/v1/dm/conversations/{id}/messages/{m_id} → 204
 * Step 11: GET  /api/v1/search/messages?q=e2e                   → 200 {results,has_more}
 * Step 12: GET  /api/v1/search/dm?q=e2e                         → 200 {results,has_more}
 *
 * Usage:
 *   API_TOKEN=<token> node scripts/e2e-files-dm-room-flow.mjs
 *   node scripts/e2e-files-dm-room-flow.mjs --dry-run
 */

const API_URL   = (process.env.API_URL   ?? "http://localhost:8080").replace(/\/$/, "");
const API_TOKEN = process.env.API_TOKEN  ?? "";
const DRY_RUN   = process.argv.includes("--dry-run");

if (!DRY_RUN && !API_TOKEN) {
  console.error("Error: API_TOKEN is required.");
  process.exit(1);
}

const token   = API_TOKEN;
let myID      = null;
let peerID    = null;
let convID    = null;
let dmMsgID   = null;
let passed    = 0;
let failed    = 0;

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

console.log("SCENARIO: Files, DMs, and search flow");
console.log(`  API: ${API_URL}`);
if (DRY_RUN) console.log("  MODE: dry-run\n"); else console.log("");

await step(1, "GET /api/v1/me → 200 (token valid)", async () => {
  const { status, body } = await api("GET", "/api/v1/me");
  assert(status === 200, `expected 200, got ${status}`);
  myID = body?.id;
  assert(typeof myID === "string", "expected id string");
});

let attachmentID = null;

await step(2, "Full attachment flow: upload-url + PUT to MinIO + confirm → {url}", async () => {
  // 1. Get presigned upload URL
  const { status, body } = await api("POST", "/api/v1/attachments/upload-url", {
    filename: "e2e-test.txt",
    content_type: "text/plain",
    size_bytes: 13,
  });
  assert(status === 200, `upload-url: expected 200, got ${status}`);
  assert(typeof body?.attachment_id === "string", `expected attachment_id, got ${JSON.stringify(body)}`);
  assert(typeof body?.upload_url === "string", "expected upload_url");
  attachmentID = body.attachment_id;

  // 2. PUT actual bytes to MinIO presigned URL
  const putRes = await fetch(body.upload_url, {
    method: "PUT",
    headers: { "Content-Type": "text/plain", "Content-Length": "13" },
    body: "e2e test file",
  });
  assert(putRes.ok, `MinIO PUT failed: ${putRes.status} ${putRes.statusText}`);

  // 3. Confirm the upload → server verifies object exists in MinIO and returns download URL
  const { status: cStatus, body: cBody } = await api("POST", `/api/v1/attachments/${attachmentID}/confirm`);
  assert(cStatus === 200, `confirm: expected 200, got ${cStatus} ${JSON.stringify(cBody)}`);
  assert(typeof cBody?.url === "string", `expected download url, got ${JSON.stringify(cBody)}`);
  assert(typeof cBody?.filename === "string", "expected filename in confirm response");
});

await step(3, "POST /api/v1/attachments/{id}/confirm (not uploaded) → 422", async () => {
  // Use a fake attachment ID — should get not_found or upload_not_found
  const { status } = await api("POST", "/api/v1/attachments/nonexistent-id/confirm");
  assert(status === 404 || status === 422, `expected 404/422, got ${status}`);
});

await step(4, "POST /api/v1/dm/conversations → 200/201 {id}", async () => {
  // Create a peer identity via invite + register, then DM them
  const invRes = await api("POST", "/api/v1/invites", { max_uses: 1 });
  assert(invRes.status === 201, `invite create: expected 201, got ${invRes.status}`);
  const inviteCode = invRes.body?.code;
  assert(typeof inviteCode === "string", "expected invite code");

  const peerUsername = `e2e_peer_${Date.now()}`;
  const regRes = await fetch(`${API_URL}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invite_code: inviteCode, username: peerUsername, password: "PeerPass123!" }),
  });
  assert(regRes.status === 201, `register peer: expected 201, got ${regRes.status}`);
  const regData = await regRes.json();
  peerID = regData?.identity?.id ?? regData?.identity_id;
  assert(typeof peerID === "string", "expected peer identity_id");

  const { status, body } = await api("POST", "/api/v1/dm/conversations", {
    recipient_id: peerID,
  });
  assert(status === 200 || status === 201, `expected 200/201, got ${status}`);
  assert(typeof body?.id === "string", `expected conversation id, got ${JSON.stringify(body)}`);
  convID = body.id;
});

await step(5, "GET /api/v1/dm/conversations → 200 array[>=1]", async () => {
  const { status, body } = await api("GET", "/api/v1/dm/conversations");
  assert(status === 200, `expected 200, got ${status}`);
  const convs = body?.conversations ?? body;
  assert(Array.isArray(convs) && convs.length >= 1, `expected >=1 conversation, got ${convs?.length}`);
});

await step(6, "POST /api/v1/dm/conversations/{id}/messages → 201", async () => {
  const { status, body } = await api("POST", `/api/v1/dm/conversations/${convID}/messages`, {
    content: "E2E DM test message",
  });
  assert(status === 201, `expected 201, got ${status}`);
  assert(typeof body?.id === "string", "expected message id");
  dmMsgID = body.id;
});

await step(7, "GET /api/v1/dm/conversations/{id}/messages → 200 messages[>=1]", async () => {
  const { status, body } = await api("GET", `/api/v1/dm/conversations/${convID}/messages`);
  assert(status === 200, `expected 200, got ${status}`);
  assert(body?.messages?.length >= 1, `expected >=1 DM, got ${body?.messages?.length}`);
});

await step(8, "POST second DM → 201", async () => {
  const { status } = await api("POST", `/api/v1/dm/conversations/${convID}/messages`, {
    content: "E2E second DM",
  });
  assert(status === 201, `expected 201, got ${status}`);
});

await step(9, "GET DMs → 200 messages.length>=2", async () => {
  const { status, body } = await api("GET", `/api/v1/dm/conversations/${convID}/messages`);
  assert(status === 200, `expected 200, got ${status}`);
  assert(body?.messages?.length >= 2, `expected >=2 DMs, got ${body?.messages?.length}`);
});

await step(10, "DELETE DM message → 204", async () => {
  const { status } = await api("DELETE", `/api/v1/dm/conversations/${convID}/messages/${dmMsgID}`);
  assert(status === 204, `expected 204, got ${status}`);
});

await step(11, "GET /api/v1/search/messages?q=e2e → 200 {results,has_more}", async () => {
  const { status, body } = await api("GET", "/api/v1/search/messages?q=e2e");
  assert(status === 200, `expected 200, got ${status}`);
  assert(typeof body?.has_more === "boolean", `expected has_more bool, got ${JSON.stringify(body)}`);
  assert(Array.isArray(body?.results), "expected results array");
});

await step(12, "GET /api/v1/search/dm?q=e2e → 200 {results,has_more}", async () => {
  const { status, body } = await api("GET", "/api/v1/search/dm?q=e2e");
  assert(status === 200, `expected 200, got ${status}`);
  assert(typeof body?.has_more === "boolean", `expected has_more bool`);
  assert(Array.isArray(body?.results), "expected results array");
});

console.log("");
const total = passed + failed;
if (DRY_RUN) console.log("12/12 steps planned (dry-run)");
else if (failed === 0) console.log(`${total}/${total} steps passed`);
else { console.log(`${passed}/${total} steps passed, ${failed} failed`); process.exit(1); }
