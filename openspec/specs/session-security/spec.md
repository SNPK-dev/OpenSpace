# session-security Specification

## Purpose
TBD - created by archiving change session-security-hardening. Update Purpose after archive.
## Requirements
### Requirement: Irrecoverable session storage

The server SHALL persist only SHA-256 digests of uniformly random 256-bit session tokens and SHALL authenticate all bearer requests by digest lookup.

#### Scenario: Existing owner session survives upgrade

- **GIVEN** an owner has a valid plaintext-backed session before migration
- **WHEN** migration 033 and the new server version are deployed
- **THEN** the existing bearer still authenticates through its migrated digest
- **AND** PostgreSQL no longer retains its plaintext token

#### Scenario: New session creation for every role and device path

- **GIVEN** an owner, admin, moderator, member, or guest obtains a session through any supported issuer
- **WHEN** the session row is persisted
- **THEN** only its digest is stored and the raw bearer is returned exactly once

### Requirement: Self-service session inventory and revocation

An authenticated identity SHALL be able to list and revoke only its own sessions without receiving token values or digests.

#### Scenario: Member lists sessions

- **GIVEN** an authenticated member has multiple active sessions
- **WHEN** the member lists sessions
- **THEN** the response contains opaque IDs, timestamps, and the current-session marker only

#### Scenario: Moderator revokes another own session

- **GIVEN** an authenticated moderator selects another session belonging to the same identity
- **WHEN** it revokes that session
- **THEN** subsequent requests using that bearer are unauthorized

#### Scenario: Guest attempts cross-identity revocation

- **GIVEN** an authenticated guest knows a session ID owned by another identity
- **WHEN** it requests revocation
- **THEN** the server reveals no ownership information and leaves that session active

### Requirement: Atomic current-session rotation

An authenticated identity SHALL be able to replace the current session bearer atomically while preserving its expiry and invalidating the prior bearer.

#### Scenario: Admin rotates current session

- **GIVEN** an authenticated admin session
- **WHEN** it requests rotation
- **THEN** the response returns a newly generated bearer
- **AND** the old bearer immediately fails authentication
- **AND** reconnecting API and realtime clients can use the new bearer

#### Scenario: Concurrent rotation or revoked session

- **GIVEN** the current session is revoked or another rotation wins first
- **WHEN** rotation tries to update the stale session
- **THEN** the operation fails unauthorized without creating an extra session
