# Clean-host release acceptance

OpenSpace v1 uses Ubuntu 24.04 LTS amd64 as its reference server. A release is not accepted until both jobs in `clean-host-acceptance.yml` pass and their SHA-256-addressed evidence is retained.

The clean-host job runs on a new GitHub-hosted VM and covers host validation, provisioning, public-port policy, TLS for both application and object-storage DNS, bootstrap, chat, WebSocket reconnect, browser-addressable attachment round trip, local voice, backup, restore to an independent Compose project, upgrade from the configured previous stable tag, and rollback. The protected `release-staging` environment must provide `OPENSPACE_STAGING_DEPLOY_COMMAND`; it deploys and verifies the current `GITHUB_SHA` before public DNS/TLS/WSS/port/TURN probes run. Configure `OPENSPACE_PREVIOUS_RELEASE` for scheduled runs. No phase may be skipped.

The `release-staging` environment must define `OPENSPACE_STAGING_HOST`, `OPENSPACE_STAGING_ENV`, and `OPENSPACE_TURN_ONLY_PROBE_COMMAND`. The last value invokes the organization's external two-client probe; it must force relay candidates and fail unless bidirectional media is observed. A TCP/STUN reachability check alone is insufficient.

Allowed public ports are TCP 80, 443, 3478, 5349, 7881; UDP 3478, 5349, 7882, and 50000–50100. PostgreSQL, Redis, MinIO, API, gateway, metrics, and admin ports must remain private.

Evidence uses `openspace.acceptance/v1`, contains only phase status and timing, is sanitized before writing, and is accompanied by a SHA-256 file. Never upload `.env`, backup bundles, tokens, private keys, or raw service logs without redaction.

To validate the harness locally, provide every phase command and run `node scripts/acceptance/clean-host.mjs --dry-run`. A missing command is a gate failure by design.
