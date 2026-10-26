export const boundedContexts = [
  "server-administration",
  "identity-auth",
  "authorization",
  "rooms",
  "messaging",
  "files",
  "direct-messages",
  "realtime",
  "media",
  "audit-compliance"
] as const;

export type BoundedContext = (typeof boundedContexts)[number];

export const coreEntities = [
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
] as const;

export type CoreEntity = (typeof coreEntities)[number];

export const seedRoles = ["owner", "admin", "moderator", "member", "guest"] as const;

export type SeedRole = (typeof seedRoles)[number];

export const permissionNames = [
  "server.manage",
  "server.view_health",
  "server.manage_settings",
  "server.manage_backups",
  "identity.invite",
  "identity.disable",
  "identity.manage_roles",
  "identity.view_audit",
  "member.search",
  "profile.view",
  "friend.request",
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
] as const;

export type PermissionName = (typeof permissionNames)[number];

export const domainInvariants = [
  "server-scope",
  "identity-scope",
  "owner-continuity",
  "local-direct-messages",
  "room-access",
  "message-ordering",
  "file-ownership",
  "realtime-sequence",
  "media-control",
  "auditability"
] as const;

export type DomainInvariant = (typeof domainInvariants)[number];

export function isSeedRole(value: string): value is SeedRole {
  return (seedRoles as readonly string[]).includes(value);
}

export function isPermissionName(value: string): value is PermissionName {
  return (permissionNames as readonly string[]).includes(value);
}

export function parsePermissionName(value: PermissionName): { resource: string; verb: string } {
  const [resource, verb] = value.split(".");
  if (!resource || !verb) {
    throw new Error(`Invalid permission name: ${value}`);
  }

  return { resource, verb };
}
