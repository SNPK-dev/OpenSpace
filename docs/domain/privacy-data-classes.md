# Privacy Data Classes

OpenSpace MVP gives server-local custody. It does not claim administrator invisibility or end-to-end encryption by default.

## Durable User Content

Messages, attachments, profile data, room membership, local DM content, and file metadata are stored on the server owner's infrastructure.

## Ephemeral Realtime State

Presence, typing, live read state, and reconnect cursors may be short-lived, but they remain server-scoped and must not disclose identities outside the server.

## Media Control State

Voice participation, mute/deafen state, LiveKit room mapping, and moderation controls are operational media data. Media is not recorded by default in MVP.

## Administrative Data

Settings, roles, permissions, invites, sessions, audit events, exports, backups, and health metadata are visible to appropriately authorized administrators.

## Non-Guarantees

- MVP text and DM messaging is not end-to-end encrypted.
- Server administrators control the infrastructure.
- Server-local custody is not anonymity.
- Cross-server identity privacy is out of scope because federation is out of scope.
