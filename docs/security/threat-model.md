# OpenSpace v1 threat model

## Scope and assets

The v1 boundary is one self-hosted server, Web client, and signed Windows client. Assets are identity/session credentials, messages and attachments, voice metadata, server configuration, backups, signing provenance, and operator control. PostgreSQL, Redis, MinIO, LiveKit, and worker networks are internal trust zones; the host and release pipeline are privileged zones.

## Adversaries and controls

| Threat | Primary controls | Required evidence |
|---|---|---|
| Credential theft/replay | hashed rotating sessions, expiry/revoke, one-use WS tickets, TLS | revoked/disabled integration tests and parser fuzzing |
| IDOR/cross-server disclosure | canonical session server ID, server-scoped SQL predicates, ownership checks | route matrix and cross-server object tests |
| Privilege escalation | centralized permission policy, owner continuity, admin audit | five-role matrix tests |
| WebSocket origin/replay bypass | strict normalized allowlist, one-time hashed tickets | Origin/protocol fuzz, replay tests |
| Malicious attachment | bounded size/type metadata, generated object keys, owner/server scope | ownership and object isolation tests; malware scanning remains operator policy |
| SSRF/webhook abuse | configured operator-only endpoints, URL policy | SAST and configuration review |
| Dependency/build compromise | locked dependencies, immutable digests, SBOM, provenance, signatures | supply-chain release evidence |
| Backup disclosure/corruption | restrictive permissions, checksums, completion markers, off-host controls | recovery drill and manifest validation |
| Redis compromise | unpublished isolated data network; external TLS+ACL | topology and config tests |
| Host/operator compromise | least-privilege containers, read-only roots, audit/incident runbooks | deployment review; host security is an operator responsibility |

## Residual risks

OpenSpace is not E2EE: a server or host administrator can access plaintext data. Metadata is server-visible. TURN and LiveKit are trusted media processors. Social engineering, endpoint malware, and compromised operator credentials require organizational controls beyond the application.

Threat-model changes are required for new public endpoints, authentication methods, external integrations, storage paths, or supported client platforms.
