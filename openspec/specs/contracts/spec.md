# contracts Specification

## Purpose
TBD - created by archiving change define-contracts-and-versioning. Update Purpose after archive.
## Requirements
### Requirement: Shared Contract Source

The repository SHALL use `packages/contracts` as the source of truth for shared server/client wire contracts.

#### Scenario: Contributor adds a shared DTO

- **GIVEN** a contributor needs a DTO consumed by server and client code
- **WHEN** the DTO represents API, realtime, or persisted wire contract data
- **THEN** the contributor SHALL define it in `packages/contracts/proto`
- **AND** the contributor SHALL NOT create parallel hand-written DTOs in app packages.

### Requirement: Versioned Protobuf Package

OpenSpace contracts SHALL use protobuf package versioning as the compatibility boundary.

#### Scenario: Contributor evolves `openspace.v1`

- **GIVEN** a contributor changes an existing `openspace.v1` contract
- **WHEN** the change is additive and uses new tag numbers
- **THEN** the change MAY remain in `openspace.v1`
- **AND** removed fields SHALL reserve their previous tag numbers and names.

#### Scenario: Contributor needs a breaking contract change

- **GIVEN** a contributor needs to change field type, field meaning, package name, or existing event semantics
- **WHEN** the change is incompatible with supported clients
- **THEN** the contributor SHALL introduce a new package version instead of mutating `openspace.v1` in place.

### Requirement: Realtime Event Envelope

Realtime gateway payloads SHALL use a typed event envelope that carries ordering and diagnostic metadata.

#### Scenario: Server emits a realtime event

- **GIVEN** a server emits an event for a client stream
- **WHEN** the event is encoded
- **THEN** it SHALL include event ID, server ID, stream ID, sequence, occurred-at timestamp, trace ID, actor identity ID, and a typed payload.

#### Scenario: Client receives an unknown future event

- **GIVEN** a client receives an event produced by a newer server
- **WHEN** the event contains fields unknown to the client
- **THEN** the client SHALL ignore unknown fields according to protobuf compatibility rules.

### Requirement: Contract Validation

The repository SHALL provide validation for proto shape, generation configuration, and compatibility fixtures.

#### Scenario: Contributor runs root verification

- **GIVEN** contract files exist in the repository
- **WHEN** the contributor runs root verification
- **THEN** the verification SHALL check required proto files, Buf config, package scripts, fixtures, and fixture schema shape.

#### Scenario: Contributor runs contract package checks

- **GIVEN** the contract package is available
- **WHEN** the contributor runs the contract package lint, build, test, and typecheck scripts
- **THEN** those scripts SHALL execute real contract checks rather than placeholder echo commands.

