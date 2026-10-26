# realtime-auth Specification

## Purpose
TBD - created by archiving change websocket-security-hardening. Update Purpose after archive.
## Requirements
### Requirement: Single-use realtime tickets

The system SHALL exchange an authenticated bearer session for a cryptographically random realtime ticket that expires within 30 seconds, stores only a SHA-256 keyed Redis record, contains only identity and server routing claims, and can be consumed exactly once.

#### Scenario: Authenticated client connects

- **GIVEN** an authenticated owner, admin, moderator, member, or guest client
- **WHEN** it requests a realtime ticket and completes a WebSocket handshake
- **THEN** the connection succeeds without placing its bearer session or ticket in the request URL

#### Scenario: Ticket replay or expiry

- **GIVEN** a ticket has already been consumed or has expired
- **WHEN** another handshake presents it
- **THEN** the gateway rejects the request without upgrading

#### Scenario: Ticket service unavailable

- **GIVEN** Redis is unavailable
- **WHEN** a client requests or presents a realtime ticket
- **THEN** the system fails closed without falling back to bearer authentication at the gateway

### Requirement: WebSocket Origin enforcement

The gateway SHALL validate every non-empty WebSocket Origin against the normalized `WS_ALLOWED_ORIGINS` allowlist before consuming a ticket. It MAY accept an absent Origin for native clients.

#### Scenario: Hostile browser origin

- **GIVEN** a valid unused ticket and a browser Origin outside the allowlist
- **WHEN** the gateway receives the handshake
- **THEN** it rejects the Origin before consuming the ticket
- **AND** an allowed-origin handshake may still consume that ticket

#### Scenario: Native client without Origin

- **GIVEN** a valid unused ticket from a native client that omits Origin
- **WHEN** the gateway receives the handshake
- **THEN** Origin validation permits authentication to continue

### Requirement: Credential-free WebSocket URLs

Clients SHALL request a fresh ticket for every connection attempt and present `openspace.v1` plus `ticket.<hex>` in `Sec-WebSocket-Protocol`. The gateway SHALL reject URL query credentials.

#### Scenario: Client reconnect

- **GIVEN** a client loses its realtime connection
- **WHEN** the reconnect delay elapses
- **THEN** it requests a newly issued ticket before opening another WebSocket

#### Scenario: Legacy URL credential

- **GIVEN** a request uses `?token=` or `?ticket=`
- **WHEN** it reaches the WebSocket endpoint
- **THEN** the gateway rejects it without consuming a subprotocol ticket
