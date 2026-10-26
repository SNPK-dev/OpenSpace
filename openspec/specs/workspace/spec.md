# workspace Specification

## Purpose
TBD - created by archiving change setup-monorepo-and-workspace. Update Purpose after archive.
## Requirements
### Requirement: Repository foundation layout

The repository SHALL expose first-class top-level areas for applications, shared packages, infrastructure, documentation, and OpenSpec workflow state.

#### Scenario: Contributor inspects the repository root

GIVEN a contributor has checked out the repository
WHEN they inspect the top-level project layout
THEN they SHALL find `apps/`, `packages/`, `infra/`, `docs/`, and `openspec/`.

### Requirement: Application ownership paths

The repository SHALL reserve application paths for server services and client targets.

#### Scenario: Contributor locates application homes

GIVEN a contributor needs to place future application work
WHEN they inspect `apps/`
THEN they SHALL find paths for `server-api`, `realtime-gateway`, `worker`, `admin-web`, `web-client`, `mobile`, and `desktop-win`.

### Requirement: Shared package ownership paths

The repository SHALL reserve shared package paths for contracts, SDK, domain, UI, config, and testing utilities.

#### Scenario: Contributor locates package homes

GIVEN a contributor needs to place future shared package work
WHEN they inspect `packages/`
THEN they SHALL find paths for `contracts`, `sdk`, `domain`, `ui-kit`, `config`, and `testkit`.

### Requirement: Cross-language contracts home

The repository SHALL reserve `packages/contracts` as the cross-language contract home and SHALL NOT establish hand-written duplicate DTO conventions.

#### Scenario: Contributor prepares contract work

GIVEN a future change needs shared server/client data shapes
WHEN the contributor chooses where contract sources belong
THEN `packages/contracts` SHALL be the selected home.

### Requirement: Infrastructure ownership paths

The repository SHALL reserve infrastructure paths for Docker, Caddy, Coturn, LiveKit, PostgreSQL, Redis, and MinIO.

#### Scenario: Contributor locates infrastructure homes

GIVEN a future change needs managed service configuration
WHEN the contributor inspects `infra/`
THEN they SHALL find ownership paths for Docker, Caddy, Coturn, LiveKit, PostgreSQL, Redis, and MinIO.

### Requirement: Baseline workspace validation

The repository SHALL provide baseline commands for build, lint, typecheck, and test that honestly validate the current skeleton scope.

#### Scenario: Contributor runs baseline checks

GIVEN the workspace skeleton exists
WHEN the contributor runs the root build, lint, typecheck, and test commands
THEN each command SHALL complete successfully for the current placeholder package set.

### Requirement: Scope guard

The workspace foundation SHALL NOT introduce runtime chat, auth, admin, media, installer, realtime behavior, production hardening, or full generated contract outputs.

#### Scenario: Reviewer checks the foundation diff

GIVEN the change is reviewed
WHEN the reviewer inspects runtime behavior
THEN they SHALL find only repository structure, baseline validation, placeholder package manifests, configuration examples, seed contracts, and documentation.

