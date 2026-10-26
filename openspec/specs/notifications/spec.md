# Notifications Capability Spec

**Capability:** push-notification delivery
**Status:** Implemented (notification-delivery-v1)
**Last updated:** 2026-05-13

## Overview

Push notifications are delivered via a webhook fan-out pattern. The server never speaks directly to FCM or APNS; instead it POSTs event batches to an operator-configured webhook URL. A relay service at that URL handles provider-specific dispatch.

## API

### Register device token
```
POST /api/v1/push/token
Authorization: Bearer <token>
Body: { "platform": "ios"|"android"|"web", "token": "<device-token>" }
→ 204 No Content
```

### Unregister device token
```
DELETE /api/v1/push/token
Authorization: Bearer <token>
Body: { "token": "<device-token>" }
→ 204 No Content
```

## Data Model

```sql
CREATE TABLE push_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_id UUID        NOT NULL REFERENCES server_identities(id) ON DELETE CASCADE,
    platform    TEXT        NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    token       TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (identity_id, token)
);
```

## Event Delivery

The `notification.Service` subscribes to `events:{serverID}` on Redis. On `message.created` and `dm.message.created` events, it queries `push_tokens` for the recipient identities (excluding sender, LIMIT 1000) and calls the configured `Dispatcher`.

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `NOTIFICATION_WEBHOOK_URL` | `` (empty) | If set, enables `WebhookDispatcher`; otherwise `NoOpDispatcher` |

## Dispatcher Interface

```go
type Dispatcher interface {
    Dispatch(ctx context.Context, events []Event) error
}
```

Built-in implementations:
- `NoOpDispatcher` — no-op, used in dev/test
- `WebhookDispatcher` — POST JSON batch to configured URL, 5s timeout
