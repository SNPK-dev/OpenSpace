# Contracts and Versioning

OpenSpace uses protobuf contracts generated through Buf as the shared wire language for server services, web, mobile, desktop, and SDK code.

## Source of Truth

`packages/contracts/proto/openspace/v1` owns shared API and realtime DTOs. App packages may define local view models, but they must not create duplicate wire DTOs for shared server/client payloads.

## Generated Outputs

Buf generates TypeScript and Go outputs into `packages/contracts/gen`. Generated files are reproducible and should not be edited by hand.

## Version Policy

`openspace.v1` is the MVP compatibility boundary.

Allowed:

- Add fields with new tag numbers.
- Add messages.
- Add enum values.
- Add new event payload variants with unused tags.

Forbidden:

- Reuse deleted tag numbers.
- Change field types or meanings.
- Rename packages, messages, or fields casually.
- Remove event payloads emitted by supported servers.

Breaking changes require a new package such as `openspace.v2`.

## Realtime Events

Realtime payloads use `RealtimeEvent`, which includes event ID, server ID, stream ID, monotonic sequence, occurrence timestamp, trace ID, actor identity ID, and a typed payload.

The sequence is monotonic within the named stream. The timestamp is producer time and is not the ordering authority.
