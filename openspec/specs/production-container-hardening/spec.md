# Production Container Hardening

## Purpose

Define the enforced privilege, resource, network, persistence, and validation boundaries for the single-host production container bundle.

## Requirements

### Requirement: First-party containers execute with least privilege

Production API, realtime gateway, web client, and admin web containers MUST execute as non-root users. Their root filesystems MUST be read-only, privilege escalation MUST be disabled, all Linux capabilities MUST be dropped, and required temporary storage MUST be provided through bounded tmpfs mounts.

#### Scenario: Application service starts safely

GIVEN a server owner renders and starts the documented production bundle

WHEN a first-party application container becomes healthy

THEN its effective user is not UID 0, its root filesystem is read-only, it has no added Linux capabilities, and it can write only to explicitly mounted temporary storage

#### Scenario: Required write path is missing

GIVEN a hardened application image attempts to write outside its declared temporary storage

WHEN the write occurs

THEN the operation fails without making the container privileged or silently making its root filesystem writable

### Requirement: Production services have bounded resources

Every production service MUST declare CPU, memory, and process limits. Defaults MUST be usable for a modest single-host deployment and MUST be overrideable by the server owner without editing the Compose file.

#### Scenario: Owner tunes a busy media service

GIVEN the default LiveKit limit is insufficient for the owner's concurrency target

WHEN the owner sets the documented resource-limit environment variables and renders the bundle again

THEN the effective Compose model contains the overridden values while all other hardening controls remain enabled

#### Scenario: A service exhausts its limit

GIVEN a container exceeds its configured resource ceiling

WHEN Docker enforces the limit or restarts the service

THEN other services retain their declared limits and operators can detect the affected service through health and restart status

### Requirement: Data-plane services are network isolated

The production bundle MUST define explicit edge, internal data, and media networks. PostgreSQL, Redis, and MinIO MUST NOT join the edge or media networks. Only services that require host ingress MUST publish ports.

#### Scenario: Member reconnects after deployment

GIVEN a member or guest uses a supported client through the public Caddy endpoint

WHEN HTTP and websocket connections are established or re-established

THEN traffic reaches the appropriate application service on the edge network without exposing PostgreSQL, Redis, or MinIO to the host

#### Scenario: Compromised static container probes the data plane

GIVEN a web-serving container is compromised

WHEN it attempts to address PostgreSQL, Redis, or MinIO by their Compose service names

THEN those services are absent from the container's attached networks

### Requirement: Security state survives Redis restarts

Redis MUST use append-only persistence backed by a named production volume so session and security state is not discarded by an ordinary container replacement or restart.

#### Scenario: Redis container is recreated

GIVEN unexpired session or websocket-security records exist

WHEN Redis is restarted or its container is replaced while retaining the named volume

THEN persisted records are recovered subject to their original expiry semantics

#### Scenario: Redis cannot write its persistent volume

GIVEN the Redis data volume has invalid ownership or insufficient capacity

WHEN Redis starts or appends data

THEN the service fails visibly instead of reporting healthy while silently running without the required persistence

### Requirement: Hardening is continuously validated and honestly documented

Repository verification MUST fail when required first-party controls, per-service resource limits, Redis persistence, published-port restrictions, or network isolation are removed. Documentation MUST identify upstream compatibility exceptions and MUST NOT claim universal non-root execution.

#### Scenario: Contributor weakens the production topology

GIVEN a contributor removes a required control or attaches a data service to the edge network

WHEN the standard repository verification command runs

THEN validation fails with a message identifying the affected service and missing or invalid invariant

#### Scenario: Operator reviews deployment posture

GIVEN a server owner evaluates OpenSpace for production

WHEN they read the deployment documentation

THEN they can distinguish enforced controls, documented exceptions, host responsibilities, and commands for verifying the effective runtime configuration
