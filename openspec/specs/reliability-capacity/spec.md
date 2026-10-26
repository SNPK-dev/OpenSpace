# Reliability and Capacity Specification

## Purpose

Require reproducible failure/load evidence before reliability or capacity claims.

## Requirements

### Requirement: Reliability tests reproduce critical failure modes
Release evidence MUST include API/history load, WebSocket fan-out, reconnect storm, soak, PostgreSQL/Redis/MinIO outage, connection exhaustion, disk pressure, restart, slow network, TURN, and large-server profiles.

#### Scenario: Reconnect storm occurs
GIVEN connected clients WHEN the gateway restarts THEN recovery time, failures, queue pressure, API errors, and resource peaks are recorded.

#### Scenario: Redis becomes unavailable
GIVEN active realtime sessions WHEN Redis stops and recovers THEN degradation is measured, processes remain observable, and supported clients reconnect.

### Requirement: Capacity claims require dated evidence
Small and Medium profiles MUST state hardware, revision, dataset, duration, workload, thresholds, and dated results; unknown values MUST remain unpublished.

#### Scenario: Benchmark has not run
GIVEN no valid release result WHEN documentation is generated THEN fields state `not yet measured` and no scalability claim is made.
