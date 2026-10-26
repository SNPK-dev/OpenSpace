# domain Specification

## Purpose
Define the server-scoped core domain vocabulary, invariants, roles, permissions, privacy boundaries, and validation expectations for OpenSpace MVP.

## Requirements
### Requirement: Server Scoped Domain Boundary

OpenSpace SHALL define `Server` as the root trust, identity, data custody, permission, and realtime boundary for MVP.

#### Scenario: Owner flow

GIVEN a self-hosted server with one or more identities
WHEN the owner reviews the domain model
THEN the owner can see that identities, roles, rooms, messages, files, direct messages, realtime state, media sessions, and audit records are scoped to that server.

#### Scenario: Failure and reconnect

GIVEN a realtime client reconnects after losing gateway connectivity
WHEN it requests state for a room or DM thread
THEN the domain vocabulary requires the reconnect to be resolved within the same `server_id` boundary.

### Requirement: Core Entity Catalog

OpenSpace SHALL maintain a documented catalog of core domain entities and their ownership relationships.

#### Scenario: Admin flow

GIVEN an admin needs to reason about future data retention and export behavior
WHEN they inspect the entity catalog
THEN they can identify server-owned entities, identity-owned entities, room-owned entities, DM-owned entities, media entities, and audit entities.

#### Scenario: Failure and reconnect

GIVEN a future implementation introduces a new durable entity
WHEN validation runs
THEN the entity catalog must remain present and aligned with the domain baseline before the change is accepted.

### Requirement: Bounded Context Vocabulary

OpenSpace SHALL document bounded contexts for server administration, identity/auth, authorization, rooms, messaging, files, direct messages, realtime, media, and audit/compliance.

#### Scenario: Moderator flow

GIVEN a moderator action touches rooms, messages, media, and audit
WHEN engineers inspect the bounded context model
THEN each behavior has a named context and does not require a global identity or federation context.

### Requirement: Seed Roles and Permission Vocabulary

OpenSpace SHALL define seed roles for `owner`, `admin`, `moderator`, `member`, and `guest`, plus a permission vocabulary using a stable `resource.verb` shape.

#### Scenario: Owner flow

GIVEN an owner manages access on a server
WHEN roles and permissions are reviewed
THEN the owner role is shown as the non-orphanable control role for server administration.

#### Scenario: Admin flow

GIVEN an admin configures rooms and users
WHEN the permission vocabulary is reviewed
THEN admin-facing permissions include server, identity, role, room, message, file, DM, voice, and audit permissions.

#### Scenario: Moderator flow

GIVEN a moderator manages conversations and live voice
WHEN the permission vocabulary is reviewed
THEN moderation-oriented permissions include deleting any message and muting or moving voice participants.

#### Scenario: Member flow

GIVEN a member participates normally
WHEN the permission vocabulary is reviewed
THEN member-oriented permissions include joining rooms, sending messages, uploading files, creating local DMs, and joining voice.

#### Scenario: Guest flow

GIVEN a guest has restricted access
WHEN the permission vocabulary is reviewed
THEN guest-oriented access can be represented without inventing a separate identity model.

### Requirement: Domain Invariants and Privacy Boundaries

OpenSpace SHALL document hard domain invariants and privacy data classes for MVP.

#### Scenario: Failure and reconnect

GIVEN a client reconnects to realtime after missed events
WHEN it resumes from a sequence cursor
THEN the invariant documentation requires sequence handling to stay scoped to one server and one target stream.

#### Scenario: Owner flow

GIVEN a server owner evaluates privacy posture
WHEN they read the privacy model
THEN they can distinguish server-local data custody from end-to-end encryption or administrator invisibility.

### Requirement: Documentation Validation

OpenSpace SHALL validate the required domain docs, Obsidian notes, package scripts, and package exports during repository verification.

#### Scenario: Failure and reconnect

GIVEN a required domain document or exported vocabulary is removed
WHEN verification runs
THEN validation fails with a specific missing artifact or vocabulary message.
