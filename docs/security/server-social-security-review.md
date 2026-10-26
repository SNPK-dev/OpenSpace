# Server social security review

Date: 2026-08-08

## Threat model

Reviewed authenticated attackers who alter member, server, friendship, conversation, and message UUIDs; callers without configured role permissions; users from a different server; non-participants in a DM; blocked users; disabled identities; and repeated or directionally invalid friendship actions.

## Findings fixed

1. Social queries referenced `disabled_at` instead of the canonical `is_disabled` flag. This would fail at runtime. Queries now use `is_disabled = FALSE`.
2. A repeated friend request could downgrade an accepted friendship to pending. Conflict handling is now a no-op for existing relationships.
3. `accept`, `decline`, and `cancel` did not all enforce request direction. Each transition now checks requester/addressee ownership and the expected current status.
4. Blocking did not stop messages in an existing DM. DM creation and sending now reject either-direction blocks.
5. Member search had no endpoint-specific throttle. It now uses the existing per-identity limiter.
6. DM creation could target disabled identities. Disabled recipients are now rejected.

## Data exposure boundary

An authenticated caller with `profile.view` may intentionally receive the public server profile required by the feature: server-local identity ID, username, display name, avatar, roles, and relationship state. Email, password hash, sessions, device credentials, auth method, and other administrative fields are not selected or serialized. A caller without `profile.view` receives 403. A forged identity ID from another server receives 404.

## Adversarial coverage

- HTTP handler denial without `profile.view`.
- HTTP forged cross-server member UUID returns 404.
- Cross-server profile lookup, search, and friend request denial.
- Public-profile JSON private-field leak check.
- Friendship direction forgery and accepted-state downgrade prevention.
- Cross-server DM target denial.
- Non-participant and cross-server conversation UUID denial.
- Blocked DM send denial.
- Disabled DM recipient denial.

The integration suite runs against a fresh PostgreSQL 16 database after applying every migration through `032_server_friendships.sql`.

## External dependency scanners

Repository security and privacy validators passed. `pnpm audit` and `govulncheck` could not contact their advisory registries because DNS resolution for npmjs.org and proxy.golang.org was unavailable; no clean dependency-vulnerability result is claimed for those two external scans.
