# OpenSpace Architecture

OpenSpace is a single-tenant self-hosted communication platform.

The MVP architecture keeps server data local to the server owner, uses server-scoped identities, and avoids global account or federation features.

## Core Services

- `server-api`: business APIs, admin APIs, auth/session, rooms, permissions, messages, files.
- `realtime-gateway`: websocket presence, typing, read state, and RTC coordination events.
- `worker`: real Go maintenance runtime with advisory leases, bounded batches, retry/dead-letter state, dry-run policies, transient expiry, opt-in content retention, and grace-period orphan cleanup.
- `admin-web`: owner/admin control plane.
- `web-client`: user-facing web client.
- `LiveKit`: self-hosted SFU for voice first, later video and screenshare.
- `Coturn`: TURN server for NAT/firewall traversal.

## Data Stores

- PostgreSQL: durable state.
- Redis: ephemeral state and coordination.
- S3-compatible object storage: attachments and file payloads.

## Contracts

Shared wire contracts live in `packages/contracts/proto/openspace/v1` and generate TypeScript and Go outputs through Buf. Runtime packages should consume generated contracts instead of duplicating API or realtime DTOs by hand.

## Domain Model

The core domain model is documented in [Core Domain Model](domain-model.md). It defines `Server` as the trust, identity, data custody, permission, and realtime boundary for MVP, with supporting references for entities, bounded contexts, roles, permissions, invariants, and privacy data classes under `docs/domain`.
