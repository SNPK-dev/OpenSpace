# Runbook: Operations

Day-to-day operational procedures for a running OpenSpace server.

---

## Health Check

### Quick status

```bash
curl http://localhost:8080/healthz
# → {"status":"ok"} or {"status":"not_bootstrapped"}
```

### Service status

```bash
docker compose ps
```

All services should show `running` (or `healthy` for postgres/redis).

### API logs

```bash
docker compose logs -f api --tail=100
docker compose logs -f realtime-gateway --tail=100
docker compose -f docker-compose.prod.yml --env-file .env logs -f api realtime-gateway --tail=100
```

---

## Common Service Commands

### Restart all services

```bash
docker compose restart
```

### Restart individual service

```bash
docker compose restart api
docker compose restart postgres
docker compose restart redis
docker compose restart minio
docker compose restart caddy
docker compose restart coturn
docker compose restart livekit
```

### Stop everything

```bash
docker compose down
```

### Start everything

```bash
docker compose up -d
# production:
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

### View resource usage

```bash
docker stats
```

---

## Database Operations

### Open a psql shell

```bash
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB
```

### Check migration status

```bash
pnpm db:migrate-status
```

### Take a manual backup

```bash
pnpm db:backup
```

### Check database size

```bash
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT pg_size_pretty(pg_database_size(current_database()))"
```

### Check table sizes

```bash
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
SELECT relname AS table, pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;"
```

---

## Audit Log Queries

### Recent events (via API)

```bash
curl -H "Authorization: Bearer <admin_token>" \
  http://localhost:8080/api/v1/admin/audit?limit=20
```

### Query directly in psql

```bash
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
SELECT created_at, actor_id, action, target_id, meta
FROM audit_log
ORDER BY created_at DESC
LIMIT 20;"
```

### Filter by action

```bash
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
SELECT created_at, actor_id, meta->>'ip' AS ip, meta->>'username' AS username
FROM audit_log
WHERE action = 'auth.login_failed'
ORDER BY created_at DESC
LIMIT 50;"
```

### Count failed logins by IP (last 24h)

```bash
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
SELECT meta->>'ip' AS ip, COUNT(*) AS failures
FROM audit_log
WHERE action = 'auth.login_failed'
  AND created_at > now() - interval '24 hours'
GROUP BY meta->>'ip'
ORDER BY failures DESC;"
```

---

## Redis Operations

Production Redis uses append-only persistence in the `redis-data` named volume.
Treat this volume as security-sensitive operational data: protect it with the
same host access controls and retention policy as other server state. Redis is
still not a substitute for PostgreSQL or object-storage backups.

### Check Redis connectivity

```bash
docker compose exec redis redis-cli ping
# → PONG
```

### Monitor live commands

```bash
docker compose exec redis redis-cli monitor
```

### Check memory usage

```bash
docker compose exec redis redis-cli info memory | grep used_memory_human
```

### Verify append-only persistence

```bash
docker compose -f docker-compose.prod.yml --env-file .env exec redis redis-cli CONFIG GET appendonly
docker volume inspect openspace_redis-data
```

## Production Container Hardening

The production bundle isolates services across `edge`, internal `data`, and
`media` networks. Only Caddy, LiveKit media, and Coturn publish host ports. The
first-party API, gateway, web, and admin containers run as non-root with a
read-only root filesystem, all capabilities dropped, privilege escalation
disabled, and a bounded `/tmp` tmpfs. Caddy is read-only and retains only
`NET_BIND_SERVICE`.

PostgreSQL and MinIO retain their upstream entrypoint and writable data-volume
behavior so fresh-volume initialization remains supported. LiveKit and Coturn
retain upstream runtime-user/write behavior where forcing a UID or read-only
root has not been proven compatible. These are explicit exceptions, not a claim
that every service is non-root.

Inspect the effective controls before rollout:

```bash
node scripts/render-prod-configs.mjs .env
node scripts/validate-prod-topology.mjs docker-compose.prod.yml .env
docker compose -f docker-compose.prod.yml --env-file .env config
docker compose -f docker-compose.prod.yml --env-file .env ps
docker inspect openspace-api-1 --format '{{.Config.User}} readonly={{.HostConfig.ReadonlyRootfs}} caps={{json .HostConfig.CapDrop}}'
```

All services have CPU, memory, and PID ceilings. Override the documented
`*_CPU_LIMIT`, `*_MEMORY_LIMIT`, and `*_PIDS_LIMIT` variables in `.env` when
measurements justify it, then recreate only the affected service. During an
upgrade, retain all named volumes. To roll back, restore the previous Compose
file and image tags without running `down -v`.

### Clear rate limit keys (emergency)

```bash
docker compose exec redis redis-cli --scan --pattern "rl:*" | xargs docker compose exec redis redis-cli del
```

---

## Storage (MinIO)

### Check MinIO health

```bash
curl http://localhost:9000/minio/health/live
# → 200 OK
```

### Browse objects (mc client)

```bash
mc alias set local http://localhost:9000 $MINIO_ACCESS_KEY $MINIO_SECRET_KEY
mc ls local/openspace-uploads
```

### Check disk usage

```bash
mc du local/openspace-uploads
```

---

## Log Level

Change log level without restart (set env var and restart api):

```bash
# In .env:
LOG_LEVEL=debug

docker compose restart api
```

Valid values: `debug`, `info`, `warn`, `error`

---

## Environment Variables

See `.env.example` for all variables. Key operational variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | API log verbosity |
| `RATE_DISABLED` | `false` | Disable all rate limits |
| `SESSION_TTL_DAYS` | `30` | Session expiry in days |

After editing `.env`, restart affected services:
```bash
docker compose up -d --no-deps api
```
