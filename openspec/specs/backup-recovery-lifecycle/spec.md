# Backup Recovery Lifecycle Specification

## Purpose

Define the integrity, safety, retention, upgrade, rollback, and continuous-exercise requirements for recovering all authoritative OpenSpace data.

## Requirements

### Requirement: Recovery bundles cover authoritative user data

A completed backup MUST include PostgreSQL data and all objects from the configured MinIO bucket, plus a versioned manifest with sizes and SHA-256 hashes. Redis transient state MUST be explicitly excluded.

#### Scenario: Owner creates a completed bundle

GIVEN PostgreSQL and MinIO are healthy and the owner has sufficient backup storage

WHEN the owner runs the backup command

THEN one completed bundle contains the database dump, object export, integrity metadata, and no plaintext credentials

#### Scenario: Backup is interrupted

GIVEN backup capture has started

WHEN a database, object-storage, disk, or process failure interrupts it

THEN the bundle remains marked incomplete, is not eligible for restore or retention accounting, and the command exits non-zero

### Requirement: Restore fails before destructive work on invalid input

Restore MUST validate completion, format, safe paths, artifact presence, sizes, and hashes before stopping writers or changing PostgreSQL or MinIO.

#### Scenario: Operator selects a corrupted bundle

GIVEN any recorded artifact hash or size does not match

WHEN an admin invokes restore

THEN restore exits non-zero before modifying the target server and identifies the invalid artifact

#### Scenario: Clean-host recovery succeeds

GIVEN a verified bundle and a clean compatible OpenSpace host

WHEN the operator confirms restore

THEN database rows and object inventory are restored, schema and object verification pass, and application services return healthy

### Requirement: Retention and off-host transfer are safe

Retention MUST operate only inside the configured backup root and only on completed bundle directories. An optional off-host hook MUST receive a completed verified bundle without shell interpolation.

#### Scenario: Retention expires old bundles

GIVEN completed bundles exceed configured daily, weekly, or monthly retention

WHEN retention runs

THEN only eligible completed bundles beneath the backup root are removed and the newest required recovery points remain

#### Scenario: Off-host transfer fails

GIVEN local backup completed but the configured transfer hook fails

WHEN backup finalization runs

THEN the local bundle remains intact, the command reports transfer failure, and monitoring can distinguish local success from off-host failure

### Requirement: Upgrade and rollback are recovery-gated

Production upgrade MUST create and verify a pre-upgrade bundle before applying migrations or replacing services. Rollback MUST use recorded release metadata and MUST fail closed when the matching recovery point is unavailable.

#### Scenario: Pre-upgrade backup fails

GIVEN an owner requests an upgrade

WHEN the required backup or verification fails

THEN no deployment mutation occurs and the current release remains running

#### Scenario: Rollback after failed upgrade

GIVEN an upgrade failed after data or schema mutation and a verified pre-upgrade bundle exists

WHEN the owner runs rollback

THEN the recorded application revision/configuration and authoritative data are restored and post-rollback health verification runs

### Requirement: Recovery is continuously exercised

Repository verification MUST cover manifest validation, corruption rejection, path confinement, incomplete bundles, retention selection, and command fail-closed behavior. CI or staging MUST support a Docker-backed database-and-object recovery drill.

#### Scenario: Contributor weakens recovery validation

GIVEN a change permits missing objects, mismatched hashes, or paths outside the backup root

WHEN the standard recovery tests run

THEN they fail with an actionable invariant violation

#### Scenario: Member reconnects after maintenance

GIVEN a member or guest was disconnected for restore or rollback

WHEN services return healthy

THEN supported clients can reconnect through their normal session rules, while expired transient Redis state is safely recreated
