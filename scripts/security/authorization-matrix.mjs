import { readFileSync, writeFileSync } from "node:fs";

const source = readFileSync("apps/server-api/internal/server/server.go", "utf8");
const routes = source.split(/\r?\n/)
  .map((line) => {
    const match = line.match(/mux\.Handle(?:Func)?\("(GET|POST|PUT|PATCH|DELETE) ([^" ]+)"/);
    return match ? { method: match[1], path: match[2], registration: line.trim() } : null;
  })
  .filter(Boolean);

function policy({ method, path }) {
  if (["/healthz", "/livez", "/readyz", "/.well-known/openspace/server"].includes(path)) return ["public", "none", "none", "public"];
  if (path === "/metrics") return ["internal", "none", "none", "private-network"];
  if (path.startsWith("/api/auth/device-registration/") || path.startsWith("/api/devices/redeem/") || path.startsWith("/api/relay/transfers")) return ["public-rate-limited", "token/challenge", "record", "server-bound-token"];
  if (path.startsWith("/api/v1/bootstrap") || path === "/api/v1/auth/login" || path === "/api/v1/auth/register") return ["public-rate-limited", "bootstrap/policy", "none", "single-server"];
  if (path.startsWith("/api/devices/")) return ["authenticated", "self-or-admin", "identity/device", "session-server"];
  if (path.startsWith("/api/v1/auth/") || path === "/api/v1/me" || path === "/api/v1/me/permissions") return ["authenticated", "self", "identity/session", "session-server"];
  if (path.startsWith("/api/v1/admin/backup") || path.startsWith("/api/v1/admin/migrations") || path.startsWith("/api/v1/admin/audit") || path.startsWith("/api/v1/admin/maintenance")) return ["authenticated", "owner|admin", "operator", "session-server"];
  if (path.startsWith("/api/v1/admin/")) return ["authenticated", "owner|admin", "server-admin", "session-server"];
  if (path.startsWith("/api/v1/invites")) return ["authenticated", "owner|admin", "server-admin", "session-server"];
  if (path.includes("/messages") && method === "DELETE") return ["authenticated", "owner|admin|moderator|message-owner", "message", "server+channel"];
  if (path.includes("/messages") && method === "POST") return ["authenticated", "owner|admin|moderator|member", "channel-membership", "server+channel"];
  if (path.includes("/messages")) return ["authenticated", "owner|admin|moderator|member|guest", "channel-membership", "server+channel"];
  if (path.startsWith("/api/v1/rooms") && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) return ["authenticated", "owner|admin", "server-admin", "server+parent"];
  if (path.startsWith("/api/v1/rooms")) return ["authenticated", "owner|admin|moderator|member|guest", "server-member", "server+parent"];
  if (path.startsWith("/api/v1/attachments")) return ["authenticated", "owner|admin|moderator|member", "attachment-owner", "server+owner"];
  if (path.startsWith("/api/v1/dm")) return ["authenticated", "owner|admin|moderator|member", "conversation-member", "server+conversation"];
  if (path.startsWith("/api/v1/rtc")) return ["authenticated", "owner|admin|moderator|member|guest", method === "PATCH" ? "self-or-moderator" : "channel-member", "server+channel"];
  if (path.startsWith("/api/v1/search")) return ["authenticated", "owner|admin|moderator|member", "server-member", "session-server"];
  if (path.startsWith("/api/v1/members") || path.startsWith("/api/v1/friends")) return ["authenticated", "role-policy", "self/target", "session-server"];
  if (path === "/api/v1/realtime/ticket" || path.startsWith("/api/v1/presence") || path.startsWith("/api/v1/push/token")) return ["authenticated", "server-member", "self", "session-server"];
  return ["UNCLASSIFIED", "UNCLASSIFIED", "UNCLASSIFIED", "UNCLASSIFIED"];
}

const rows = routes.map((route) => ({ ...route, policy: policy(route) }));
if (rows.length < 50) throw new Error(`route extraction unexpectedly found only ${rows.length} routes`);
const unknown = rows.filter((row) => row.policy.includes("UNCLASSIFIED"));
if (unknown.length) throw new Error(`unclassified routes: ${unknown.map((r) => `${r.method} ${r.path}`).join(", ")}`);
const middlewareMismatch = rows.filter((row) => {
  const protectedRoute = row.policy[0] === "authenticated";
  return protectedRoute !== row.registration.includes("mid.Require(");
});
if (middlewareMismatch.length) throw new Error(`route middleware differs from policy: ${middlewareMismatch.map((r) => `${r.method} ${r.path}`).join(", ")}`);
const header = "| Method | Route | Exposure/auth | Roles/policy | Ownership | Tenant scope |\n|---|---|---|---|---|---|\n";
const body = rows.map((row) => `| ${row.method} | \`${row.path}\` | ${row.policy.join(" | ")} |`).join("\n");
writeFileSync("docs/security/authorization-matrix.md", `# Authorization matrix\n\nGenerated from \`server.go\` by \`scripts/security/authorization-matrix.mjs\`. Manual edits are overwritten. Every protected route is authenticated by the canonical session middleware before handler policy and ownership checks.\n\n${header}${body}\n`);
console.log(`authorization matrix generated: ${rows.length} routes`);
