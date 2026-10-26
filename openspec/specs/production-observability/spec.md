# Production Observability Specification

## Purpose

Define private, bounded, privacy-safe health, metrics, SLO, dashboard, and alert behavior.

## Requirements

### Requirement: Liveness and readiness are distinct
API, realtime gateway, and worker MUST expose process liveness separately from bounded readiness checks of required dependencies.

#### Scenario: PostgreSQL is unavailable
GIVEN a live process and unavailable PostgreSQL WHEN probed THEN liveness succeeds and readiness fails with a dependency-safe reason.

#### Scenario: Dependency reconnects
GIVEN failed readiness WHEN the dependency recovers THEN readiness recovers without process restart and clients can reconnect normally.

### Requirement: Runtime behavior is measurable without personal data
Prometheus metrics MUST cover API, WebSocket, RTC, dependencies, recovery, cleanup, and process health without content, tokens, object names, or unbounded identity labels.

#### Scenario: Operator diagnoses errors
GIVEN private monitoring access WHEN errors rise THEN bounded panels distinguish traffic, latency, status class, dependency, and realtime health.

#### Scenario: Non-operator requests metrics
GIVEN a public client WHEN metrics is requested through Caddy THEN it is not routed.

### Requirement: Stable release has explicit SLOs and alerts
The repository MUST define measurable SLOs and error budgets for API, messaging, realtime, voice, backup, and recovery with recording and alert rules.

#### Scenario: Error budget burns rapidly
GIVEN a fast burn WHEN rules evaluate THEN an actionable alert identifies the SLO and runbook.
