# Support policy

## Current release status

The current version is `1.0.0-rc.1`. It is a release candidate, not a stable production recommendation. Stable publication is blocked until the release evidence described in [the checklist](docs/release-checklist.md) is complete.

## Supported surface

- Server: the official production Compose topology on supported 64-bit Linux hosts.
- Clients: current stable Chromium-family browsers and signed 64-bit Windows builds.
- Preview: macOS and mobile; no stable compatibility, accessibility, update, or security-support promise.
- Upgrades: sequential supported releases using the documented pre-upgrade backup, upgrade, verification, and rollback flow.

The supported-client accessibility, locale, performance budgets, and required human evidence are defined in [the V1 client quality policy](docs/client-v1-quality.md).

The latest stable release and, when feasible, the immediately preceding minor release receive security fixes. RC support is best-effort. Community support has no guaranteed response time.

For bugs, use the issue forms and remove credentials and private data. For vulnerabilities, use [SECURITY.md](SECURITY.md). Operators should include exact versions, deployment topology, sanitized logs, reproduction steps, expected/actual behavior, and recovery attempts.
