import { mkdirSync, writeFileSync } from "node:fs";
const api = process.env.API_URL ?? "http://localhost:8080";
const credentials = { server_name: "OpenSpace Acceptance", admin_username: "acceptance_owner", admin_email: "acceptance@example.test", admin_password: "AcceptancePass123!" };
const deadline = Date.now() + 120000;
while (true) {
  try {
    const readiness = await fetch(`${api}/readyz`);
    if (readiness.ok) break;
    // Releases predating split liveness/readiness expose only /healthz. This
    // compatibility probe is used solely by the previous-version transition.
    if (readiness.status === 404) {
      const legacyHealth = await fetch(`${api}/healthz`);
      if (legacyHealth.ok) break;
    }
  } catch { /* retry until the bounded deadline */ }
  if (Date.now() > deadline) throw new Error("API readiness timeout");
  await new Promise((r) => setTimeout(r, 2000));
}
let response = await fetch(`${api}/api/v1/bootstrap`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(credentials) });
let body = await response.json();
if (response.status === 409) { response = await fetch(`${api}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: credentials.admin_username, password: credentials.admin_password }) }); body = await response.json(); }
if (!response.ok || typeof body.token !== "string") throw new Error(`bootstrap/login failed: ${response.status}`);
mkdirSync(".acceptance", { recursive: true }); writeFileSync(".acceptance/admin-token", body.token, { mode: 0o600 });
console.log(JSON.stringify({ ok: true, serverId: body.server_id, identityId: body.identity_id }));
