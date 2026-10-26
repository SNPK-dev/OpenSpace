# Changelog

All notable changes are recorded here. The format follows Keep a Changelog and versions follow Semantic Versioning.

## [Unreleased]

### Added

- Release-blocking clean-host, recovery, security, supply-chain, observability, and client-quality evidence gates.

### Security

- Refresh digest-pinned Go, Alpine, Node 22 and Nginx runtime/build images after the container vulnerability audit.
- Pin the fixed Brotli runtime package in both Nginx images to address CVE-2026-111497.
- Update Go security scanners for Go 1.27 export-data compatibility and provision Redis for the messaging integration checks in security CI.
- Update affected Go compression, crypto, networking and text dependencies; release builds and CI use Go 1.27.3, with Go 1.26 as the minimum module version.
- Update the supported desktop dependency override to js-yaml 4.3.2.

## [1.0.0-rc.1] - 2026-08-11

### Added

- Self-hosted messaging, rooms, direct messages, file attachments, realtime presence, voice, screen sharing, device pairing, and encrypted local vaults.
- Hardened production Compose topology with PostgreSQL, Redis, MinIO, LiveKit, Coturn, Caddy, API, realtime gateway, Web/Admin clients, and maintenance worker.
- Versioned PostgreSQL and MinIO backup/restore lifecycle, upgrade/rollback tooling, metrics, dashboards, alerts, and reliability drills.
- Web and Windows accessibility baseline, English UTF-8 gate, lazy RTC loading, and bundle budgets.

### Security

- One-time WebSocket tickets, hashed and rotated sessions, strict Origin policy, CSP, Electron sandboxing, production topology validation, authorization matrix, fuzz/race/SAST/dependency/container gates, SBOM, provenance, and signed release contracts.

[Unreleased]: https://github.com/SNPK-dev/OpenSpace/compare/v1.0.0-rc.1...HEAD
[1.0.0-rc.1]: https://github.com/SNPK-dev/OpenSpace/releases/tag/v1.0.0-rc.1
