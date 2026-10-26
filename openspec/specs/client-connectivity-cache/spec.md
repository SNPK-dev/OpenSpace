# client-connectivity-cache Specification

## Purpose
TBD - created by archiving change server-connectivity-cache. Update Purpose after archive.
## Requirements
### Requirement: Clients classify known server connectivity

Clients MUST ping known stored servers after local vault unlock and classify each server's runtime connectivity separately from membership state.

#### Scenario: Server online

- **GIVEN** a stored server has a reachable metadata endpoint
- **WHEN** the client pings the server
- **THEN** the server rail shows the server as online with a green dot

#### Scenario: Server degraded

- **GIVEN** a stored server responds to the metadata request with an HTTP error
- **WHEN** the client pings the server
- **THEN** the server rail shows a warning indicator for that server

#### Scenario: Server offline

- **GIVEN** a stored server is powered off or unreachable
- **WHEN** the client ping fails due to network failure or timeout
- **THEN** the server rail shows an offline gray dot for that server

### Requirement: Clients preserve recent conversation access while offline

Clients MUST cache recent navigation and conversation data per server and use that cache when the selected server is unavailable.

#### Scenario: Open cached channel while offline

- **GIVEN** a user previously loaded a channel and its recent messages
- **AND** the server is currently offline
- **WHEN** the user opens the channel
- **THEN** the client shows cached recent messages
- **AND** older-history loading is disabled until the server is reachable

#### Scenario: Open cached DM while offline

- **GIVEN** a user previously loaded a DM conversation and recent messages
- **AND** the server is currently offline
- **WHEN** the user opens the DM
- **THEN** the client shows cached recent messages and peer metadata

#### Scenario: Cache isolation by server

- **GIVEN** the user has multiple stored servers
- **WHEN** recent data is cached
- **THEN** cache keys are scoped by `server_id`
- **AND** data from one server is never shown under another server

