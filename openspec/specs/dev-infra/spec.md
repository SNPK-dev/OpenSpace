# dev-infra Specification

## Purpose
TBD - created by archiving change bootstrap-dev-infra. Update Purpose after archive.
## Requirements
### Requirement: Local Development Infrastructure Contract

The repository SHALL provide a local development infrastructure bundle with stable service names, ports, environment variables, and validation commands for OpenSpace contributors.

#### Scenario: Contributor validates the infrastructure shape without Docker

- **WHEN** a contributor runs the repository's local infrastructure validation command
- **THEN** the command verifies that the expected Compose file, environment example, Caddy config, Coturn config, and LiveKit config exist
- **AND** the command verifies that required environment keys are present in `.env.example`
- **AND** the command verifies that required Compose services and healthcheck anchors are present

#### Scenario: Contributor prepares local environment variables

- **WHEN** a contributor copies `.env.example` to `.env`
- **THEN** the file contains local defaults for public URLs, PostgreSQL, Redis, MinIO, LiveKit, Coturn, Caddy, logging, retention, and upload limits
- **AND** the defaults are suitable only for development

#### Scenario: Contributor starts dependency services

- **WHEN** a contributor starts the development infrastructure bundle
- **THEN** PostgreSQL, Redis, MinIO, LiveKit, Coturn, and Caddy are available on documented localhost ports
- **AND** dependency services expose healthchecks for future application services
- **AND** the object-storage bucket exists before application workers rely on it

#### Scenario: Placeholder applications wait for dependencies

- **WHEN** placeholder API, realtime gateway, or worker services are started in the local bundle
- **THEN** they wait for their declared infrastructure dependencies to become healthy before starting

