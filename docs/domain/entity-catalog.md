# Entity Catalog

This catalog names core domain entities before persistence and API work begins. Every durable entity is server-scoped unless explicitly marked ephemeral.

| Entity | Context | Ownership | Notes |
| --- | --- | --- | --- |
| `Server` | Server Administration | Root | Trust, identity, data custody, permission, and realtime boundary. |
| `ServerSettings` | Server Administration | Server | Durable configuration, retention defaults, feature flags, and local install metadata. |
| `ServerIdentity` | Identity/Auth | Server | Local user, bot, or service identity. Not a global account. |
| `Session` | Identity/Auth | ServerIdentity | Auth session for one server identity. |
| `Invite` | Identity/Auth | Server | Server-local invitation grant and onboarding path. |
| `Role` | Authorization | Server | Assignable permission bundle. |
| `Permission` | Authorization | Server | Stable `resource.verb` capability name. |
| `RoleAssignment` | Authorization | ServerIdentity | Connects one identity to one role within one server. |
| `PermissionOverride` | Authorization | Room | Room-scoped access change for a role or identity. |
| `Category` | Rooms | Server | Optional grouping for rooms. |
| `Room` | Rooms | Server or Category | Text or voice collaboration space. |
| `RoomMembership` | Rooms | Room and ServerIdentity | Membership, visibility, notification, and last-read relationship. |
| `Message` | Messaging | Room or DMThread | Durable message content, edit state, delete state, and ordering metadata. |
| `Attachment` | Files | Message | Durable file metadata and object storage reference. |
| `DMThread` | Direct Messages | Server | Local direct-message thread between server identities. |
| `DMParticipant` | Direct Messages | DMThread and ServerIdentity | Participant membership for a local DM thread. |
| `Presence` | Realtime | ServerIdentity | Ephemeral online, away, typing, and device state. |
| `RealtimeStream` | Realtime | Room or DMThread | Ordered stream for realtime fanout and reconnect cursors. |
| `VoiceSession` | Media | Room | LiveKit-backed voice state and participant controls. |
| `AuditEvent` | Audit/Compliance | Server | Durable administrative, security, and compliance event. |
| `RateLimitSubject` | Audit/Compliance | ServerIdentity or network source | Abuse-control identity for future throttling rules. |

## Ownership Rules

- `server_id` is mandatory for every durable row or document derived from this catalog.
- `ServerIdentity` records cannot be reused across servers.
- `DMThread` participants must belong to the same server.
- `Attachment` metadata is durable; raw bytes live in server-owned object storage.
- `Presence` may be ephemeral, but it cannot disclose identities outside the server.
