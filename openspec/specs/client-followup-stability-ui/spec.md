# client-followup-stability-ui Specification

## Purpose
TBD - created by archiving change client-followup-stability-ui. Update Purpose after archive.
## Requirements
### Requirement: Durable encrypted Web vault mutations

The Web client MUST resolve server-list mutations only after the encrypted IndexedDB snapshot is committed and can be read back, without a plaintext fallback.

#### Scenario: Owner reloads after adding a server

- **GIVEN** an owner adds a server to an unlocked Web vault
- **WHEN** the page reloads and the owner unlocks the same vault
- **THEN** the server and owner-only server actions are restored

#### Scenario: Durable storage fails

- **GIVEN** an encrypted vault write fails or cannot be read back
- **WHEN** `addServer` is completing
- **THEN** the operation rejects instead of reporting a durable server, and a later successful write can proceed

### Requirement: Accessible permission-aware server action trigger

The server-name area MUST be one pointer- and keyboard-operable trigger whose menu exposes only actions permitted for the active identity.

#### Scenario: Moderator opens server actions

- **GIVEN** a moderator can access a permission-gated server action
- **WHEN** the moderator activates the server-name trigger by pointer or keyboard
- **THEN** the dropdown opens and the allowed action is operable

#### Scenario: Member or guest opens server actions

- **GIVEN** a member or guest has no management permission
- **WHEN** the identity opens server actions
- **THEN** management-only actions are absent while allowed profile or leave actions remain operable

### Requirement: Stable Windows settings actions

Windows Server settings MUST keep Cancel and Save actions in a fixed footer outside category-specific scrolling content.

#### Scenario: Administrator switches settings categories

- **GIVEN** an administrator opens Server settings
- **WHEN** the administrator switches among General, Permissions, and Members
- **THEN** Cancel and Save remain at the same fixed footer position
