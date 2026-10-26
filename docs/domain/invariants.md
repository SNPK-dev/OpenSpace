# Domain Invariants

These invariants are hard constraints for future OpenSpace runtime work.

## Server Scope

Every durable resource is scoped to exactly one `Server`. A durable entity must not be addressable through a global account or cross-server namespace in MVP.

## Identity Scope

`ServerIdentity` belongs to one server. Sessions, invites, role assignments, presence, messages, files, DM participation, media participation, and audit actor references use server-local identities.

## Owner Continuity

A server must always have at least one active `owner`. Any future owner transfer, disablement, delete, or role-change workflow must preserve this invariant.

## Local Direct Messages

`DMThread` is local to one server. Every `DMParticipant` must reference a `ServerIdentity` from that same server.

## Room Access

Room membership, room visibility, and permission overrides are server-local. Overrides may change access inside one room but cannot grant authority on another server.

## Message Ordering

Messages have ordering within their containing room or DM thread. Edits and deletes update moderation state without changing the original server boundary.

## File Ownership

`Attachment` metadata is linked to a message and server-owned object storage. Deleting or retaining payload bytes must follow server policy and cannot rely on client-local ownership alone.

## Realtime Sequence

Realtime cursors and sequence numbers are scoped to one server and one target stream. Reconnect logic must not merge streams across rooms, DM threads, or servers.

## Media Control

`VoiceSession` maps durable room intent to LiveKit operational state. Voice moderation controls are server-local and must be auditable when they affect another participant.

## Auditability

Administrative changes to settings, identities, roles, room access, message moderation, file moderation, media moderation, backup operations, and export operations must be representable as `AuditEvent` records.
