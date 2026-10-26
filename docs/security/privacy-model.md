# Privacy Model

OpenSpace provides server-local data ownership, not absolute anonymity and not E2EE by default in MVP.

## Guarantees

- Identities are scoped to a specific server.
- Server data is stored on the server owner's infrastructure.
- Media is not recorded by default.
- Centralized global accounts are not required for MVP.

## Non-Guarantees

- Server administrators can control the infrastructure.
- Text messages, profiles, and DM data are stored on the server.
- MVP messaging is not end-to-end encrypted.

## Data Classes

OpenSpace domain docs classify data as durable user content, ephemeral realtime state, media control state, and administrative data. See [Privacy Data Classes](../domain/privacy-data-classes.md) for the domain-level vocabulary used by future storage, retention, export, and deletion work.
