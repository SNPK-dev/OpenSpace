# server-social Specification

## Purpose
TBD - created by archiving change server-direct-messaging-and-friends. Update Purpose after archive.
## Requirements
### Requirement: Permission-controlled discovery

The server SHALL expose member search only when the caller has `member.search`, and SHALL return active identities from the caller's server only.

#### Scenario: Search allowed

- **WHEN** an authorized member searches by username or display name
- **THEN** matching server-local public profiles are returned with pagination and no private email

#### Scenario: Search denied

- **WHEN** the caller lacks `member.search`
- **THEN** the API returns forbidden and the client hides discovery controls

### Requirement: Public server profile

The server SHALL provide a privacy-safe profile to callers with `profile.view`, including roles and relationship state.

#### Scenario: Authorized member views a profile

- **WHEN** a caller with `profile.view` requests a member in the same server
- **THEN** the response contains public identity fields, roles, and relationship state without private email

### Requirement: Server-local friendships

Members with `friend.request` SHALL be able to send, accept, decline, cancel, remove, and block friendship relationships within one server. Mutations SHALL be idempotent where repeating the desired state is safe.

#### Scenario: Friendship lifecycle remains server-local

- **WHEN** an authorized member requests and the peer accepts a friendship
- **THEN** both identities see the accepted relationship and repeating the desired mutation is safe
- **AND** cross-server identity identifiers are rejected

### Requirement: Direct-message entry

Members with `dm.create` SHALL be able to initiate a one-to-one conversation from a public profile or accepted friend entry. Sending remains controlled by `dm.send`.

#### Scenario: Authorized member starts a direct message

- **WHEN** a member with `dm.create` selects a server-local public profile
- **THEN** a one-to-one conversation opens and message submission still requires `dm.send`

### Requirement: Client experience

Web and Windows clients SHALL show a Liquid Glass profile surface, server member search, relationship actions, friends/pending lists, and a route into the existing DM pane with loading, empty, permission, and error states.

#### Scenario: Client renders relationship state

- **WHEN** a supported client loads People or a public profile
- **THEN** it renders the permitted relationship actions and deterministic loading, empty, permission, and error states
