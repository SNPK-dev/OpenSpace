# Core Domain Model

OpenSpace is a single-tenant self-hosted communication platform. The core domain model keeps that promise by making `Server` the root trust, identity, data custody, permission, and realtime boundary.

The model is intentionally implementation-neutral. It names the durable concepts that later APIs, database schemas, realtime gateways, workers, and clients must share.

## Root Boundary

`Server` is the root aggregate for MVP. Every durable resource is either the server itself or carries `server_id`.

Server-scoped means:

- Identities are local to one server.
- Roles and permissions are granted inside one server.
- Rooms, messages, files, local DMs, realtime streams, media sessions, and audit events belong to one server.
- Direct messages do not cross servers.
- No global account, global directory, or federation identity is required for MVP.

## Aggregate Roots

- `Server`: owns server settings, lifecycle, health, backups, and custody boundaries.
- `ServerIdentity`: represents one person, bot, or service identity on one server.
- `Role`: names assignable permission bundles for one server.
- `Room`: represents a text or voice collaboration space.
- `Message`: durable room or DM message content and moderation state.
- `Attachment`: durable file metadata linked to a message and object storage payload.
- `DMThread`: local direct-message conversation between identities on the same server.
- `RealtimeStream`: ordered event stream for presence, typing, reads, and live state.
- `VoiceSession`: media-control state for a LiveKit-backed voice room.
- `AuditEvent`: durable record of administrative, security, and compliance-relevant actions.

## Bounded Context Summary

The domain vocabulary is organized around Server Administration, Identity/Auth, Authorization, Rooms, Messaging, Files, Direct Messages, Realtime, Media, and Audit/Compliance.

## Relationship Sketch

```text
Server
  ServerSettings
  ServerIdentity
    Session
    Invite
    RoleAssignment
  Role
    Permission
  Category
    Room
      RoomMembership
      PermissionOverride
      Message
        Attachment
      RealtimeStream
      VoiceSession
  DMThread
    DMParticipant
    Message
      Attachment
    RealtimeStream
  Presence
  AuditEvent
  RateLimitSubject
```

## Non-Goals

This domain baseline does not define persistence schemas, migrations, repositories, service handlers, generated API contracts, runtime authorization evaluation, UI flows, federation, or end-to-end encryption.

## Related Docs

- [Entity Catalog](../domain/entity-catalog.md)
- [Bounded Contexts](../domain/bounded-contexts.md)
- [Roles and Permissions](../domain/roles-and-permissions.md)
- [Domain Invariants](../domain/invariants.md)
- [Privacy Data Classes](../domain/privacy-data-classes.md)
