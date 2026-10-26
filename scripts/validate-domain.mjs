import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const requiredFiles = [
  "docs/architecture/domain-model.md",
  "docs/domain/entity-catalog.md",
  "docs/domain/bounded-contexts.md",
  "docs/domain/roles-and-permissions.md",
  "docs/domain/invariants.md",
  "docs/domain/privacy-data-classes.md",
  "docs/security/privacy-model.md",
  "packages/domain/README.md",
  "packages/domain/package.json",
  "packages/domain/tsconfig.json",
  "packages/domain/src/index.ts",
];

const coreEntities = [
  "Server",
  "ServerSettings",
  "ServerIdentity",
  "Session",
  "Invite",
  "Role",
  "Permission",
  "RoleAssignment",
  "PermissionOverride",
  "Category",
  "Room",
  "RoomMembership",
  "Message",
  "Attachment",
  "DMThread",
  "DMParticipant",
  "Presence",
  "RealtimeStream",
  "VoiceSession",
  "AuditEvent",
  "RateLimitSubject"
];

const seedRoles = ["owner", "admin", "moderator", "member", "guest"];

const permissionNames = [
  "server.manage",
  "server.view_health",
  "server.manage_settings",
  "server.manage_backups",
  "identity.invite",
  "identity.disable",
  "identity.manage_roles",
  "identity.view_audit",
  "role.create",
  "role.update",
  "role.delete",
  "role.assign",
  "room.create",
  "room.update",
  "room.archive",
  "room.view",
  "room.join",
  "room.manage_access",
  "message.send",
  "message.edit_own",
  "message.delete_own",
  "message.delete_any",
  "message.read_history",
  "file.upload",
  "file.download",
  "file.delete_own",
  "file.delete_any",
  "dm.create",
  "dm.send",
  "dm.receive",
  "voice.join",
  "voice.speak",
  "voice.mute_self",
  "voice.deafen_self",
  "voice.mute_others",
  "voice.move_others",
  "audit.view",
  "audit.export"
];

const boundedContexts = [
  "Server Administration",
  "Identity/Auth",
  "Authorization",
  "Rooms",
  "Messaging",
  "Files",
  "Direct Messages",
  "Realtime",
  "Media",
  "Audit/Compliance"
];

const invariants = [
  "Server Scope",
  "Identity Scope",
  "Owner Continuity",
  "Local Direct Messages",
  "Room Access",
  "Message Ordering",
  "File Ownership",
  "Realtime Sequence",
  "Media Control",
  "Auditability"
];

function read(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function assertIncludes(path, values) {
  const content = read(path);
  const missing = values.filter((value) => !content.includes(value));
  if (missing.length > 0) {
    throw new Error(`${path} is missing: ${missing.join(", ")}`);
  }
}

const missingFiles = requiredFiles.filter((path) => !existsSync(resolve(repoRoot, path)));
if (missingFiles.length > 0) {
  console.error(`Missing domain files:\n${missingFiles.join("\n")}`);
  process.exit(1);
}

assertIncludes("docs/domain/entity-catalog.md", coreEntities);
assertIncludes("docs/domain/roles-and-permissions.md", [...seedRoles, ...permissionNames]);
assertIncludes("docs/domain/bounded-contexts.md", boundedContexts);
assertIncludes("docs/domain/invariants.md", invariants);
assertIncludes("docs/architecture/domain-model.md", ["Server", "server_id", "Direct Messages", "VoiceSession", "AuditEvent"]);
assertIncludes("docs/domain/privacy-data-classes.md", [
  "Durable User Content",
  "Ephemeral Realtime State",
  "Media Control State",
  "Administrative Data",
  "not end-to-end encrypted"
]);

const packageJson = JSON.parse(read("packages/domain/package.json"));
const scripts = packageJson.scripts ?? {};
for (const scriptName of ["build", "lint", "test", "typecheck"]) {
  if (!scripts[scriptName] || scripts[scriptName].includes("placeholder")) {
    console.error(`packages/domain/package.json has invalid ${scriptName} script`);
    process.exit(1);
  }
}

const domainSource = read("packages/domain/src/index.ts");
assertIncludes("packages/domain/src/index.ts", [...coreEntities, ...seedRoles, ...permissionNames]);
assertIncludes("packages/domain/src/index.ts", ["isSeedRole", "isPermissionName", "parsePermissionName"]);

const forbiddenRuntimeTokens = ["Prisma", "drizzle", "pg", "redis", "repository", "migration", "fetch(", "insert(", "delete("];
const forbiddenRuntimeHits = forbiddenRuntimeTokens.filter((token) => domainSource.includes(token));
if (forbiddenRuntimeHits.length > 0) {
  console.error(`packages/domain/src/index.ts contains runtime/persistence tokens: ${forbiddenRuntimeHits.join(", ")}`);
  process.exit(1);
}

const obsidianNotes = requiredFiles.filter((path) => path.startsWith(join("docs", "obsidian")) || path.startsWith("docs/obsidian"));
for (const note of obsidianNotes) {
  assertIncludes(note, ["type: domain-doc", "change_id: define-core-domain-model", "tags:"]);
}

console.log("Domain baseline OK.");
