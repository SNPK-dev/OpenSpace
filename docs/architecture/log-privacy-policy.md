# Log Privacy Policy

OpenSpace emits structured JSON logs via Go's `log/slog`. This document defines what is safe to log and what must never appear in application logs.

## Safe to log

| Category | Examples |
|----------|---------|
| Opaque IDs | `server_id`, `identity_id`, `channel_id`, `room_id`, `message_id` |
| Action names | `"auth.login"`, `"invite.create"`, `"server.bootstrap"` |
| HTTP status codes | `200`, `401`, `500` |
| Error types / messages | `"pgx: no rows"`, `"context deadline exceeded"` |
| Counts and sizes | `"db_size_bytes"`, `"count"`, `"duration_ms"` |
| Migration names | `"sql/001_create_servers.sql"` |
| System events | `"voice reaper evicted participant"`, `"shutting down"` |

IDs are opaque UUIDs or random hex strings — they identify records without revealing user-provided content.

## Never log

The following must **never** appear as slog key names or values:

| Forbidden key / value | Reason |
|-----------------------|--------|
| `password` | Credential |
| `token` | Session or API secret |
| `secret` | Any secret value |
| `code` / `code_prefix` / `invite_code` | Invite tokens are 128-bit secrets |
| `email` | PII |
| `username` / `display_name` | PII |
| `content` / `body` | Message or DM content |
| IP addresses | Goes to audit log only, not application log |
| File names from user uploads | Can contain PII |

If you need a short diagnostic hint for a secret value, use `logutil.Redact()` (see below) — **do not** slice the raw value manually.

## logutil.Redact()

```go
import "openspace/server-api/internal/logutil"

// Shows first 4 chars + "***" if len >= 8, else "***"
hint := logutil.Redact(token)
slog.Info("token hint", "hint", hint)
```

Use this only when the hint genuinely aids debugging. For most cases, log only the associated ID (e.g., `identity_id`) instead of any portion of the token.

## LOG_LEVEL configuration

Set via the `LOG_LEVEL` environment variable.

| Value | Slog level | When to use |
|-------|-----------|-------------|
| `debug` | DEBUG | Development / troubleshooting |
| `info` (default) | INFO | Normal production operation |
| `warn` | WARN | Reduce noise, keep warnings |
| `error` | ERROR | Minimal logging, critical only |

Any unrecognised value defaults to `info`.

## Operator guidance

**Log retention:** Retain application logs for 30 days. Logs contain opaque IDs and error messages — not user content — but shorter retention reduces risk.

**GDPR / erasure:** Application logs do not contain names, emails, or message content, so a standard delete-user request does not require log scrubbing. If your deployment adds custom log fields, audit them against this policy first.

**Log shipping:** If shipping logs to an external system (Loki, Elasticsearch, etc.), ensure the destination is access-controlled. Application logs can reveal session activity patterns via identity IDs.

## Enforcement

`scripts/validate-privacy-logs.mjs` scans all Go source files for forbidden key patterns in slog calls. It runs as part of `pnpm verify`. Any violation causes a CI failure.

To add a new log call, check it against the safe-to-log table above before committing.
