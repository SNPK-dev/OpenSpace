# Maintenance Jobs Specification

## Purpose

Define safe ownership, authorization, idempotency, failure handling, and object-reference rules for production maintenance.

## Requirements

### Requirement: Maintenance jobs have one explicit runtime owner
The production worker MUST own scheduled cleanup for expired sessions and security records, pairing and relay records, abandoned uploads, invalid push tokens, configured message and audit retention, orphaned MinIO objects, and backup retention.

#### Scenario: Owner enables content retention
GIVEN an owner reviewed dry-run counts and configured retention WHEN eligible records are reached THEN only records older than the boundary are deleted in bounded batches with an audit-safe result.

#### Scenario: Admin inspects cleanup state
GIVEN an admin cannot change owner-only destructive policy WHEN status is requested THEN latest run, counts, duration, failures, retries, and dead letters are visible without personal data.

#### Scenario: Moderator, member, or guest attempts cleanup control
GIVEN the caller is not owner/admin WHEN maintenance control is attempted THEN access is denied and job state is unchanged.

### Requirement: Maintenance execution is idempotent and bounded
Every job MUST use an expiring/advisory lease, bounded batch, transaction-safe predicate, retry backoff, and dead-letter behavior. Repeated execution MUST be safe.

#### Scenario: Worker restarts during deletion
GIVEN partial completion WHEN a lease is reacquired THEN completed deletions are harmless and remaining eligible records are processed without deleting live records.

#### Scenario: Dependency fails repeatedly
GIVEN a dependency failure WHEN retry limits are exhausted THEN the run fails, a dead letter is recorded, and future schedules remain possible.

### Requirement: Orphan detection preserves referenced objects
Object cleanup MUST compare candidates with authoritative references and apply a grace period before deletion.

#### Scenario: Upload completes during inventory
GIVEN a newly created object is absent from a reference snapshot WHEN inventory runs THEN grace prevents deletion and a later run re-evaluates it.
