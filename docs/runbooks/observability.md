# Production observability and SLOs

Enable the private monitoring profile with `docker compose -f docker-compose.prod.yml --env-file .env --profile observability up -d`. Prometheus and Grafana have no published host ports; use an authenticated SSH tunnel or private operator network. Set `GRAFANA_ADMIN_PASSWORD` in the operator secret store.

## Provisional service objectives

These objectives become release evidence only after an RC soak:

| SLI | Objective | Window |
|---|---:|---:|
| API availability | 99.9% | 30 days |
| Message send success excluding 4xx | 99.9% | 30 days |
| Realtime delivery within 2 seconds | 99.5% | 30 days |
| Voice join success within 10 seconds | 99.0% | 30 days |
| Scheduled backup success | 99.0% | 30 days |
| Recovery time | <= 4 hours | each drill |

Stop feature releases when a 30-day error budget is exhausted. Emergency security/reliability fixes and recovery exercises remain allowed.

## Service down

Check `/livez` to distinguish process failure from `/readyz` dependency failure. Inspect PostgreSQL, Redis, and MinIO health before restarting a healthy process.

## Maintenance failure

Query `maintenance_runs` and `maintenance_dead_letters` by job and error category. Do not put payloads or user identifiers in tickets. Repair the dependency, resolve the dead letter, and rerun a dry-run before manual execution.

## Error-budget burn

Identify the affected component and dependency, freeze unrelated rollout, preserve logs/metrics, mitigate, then document duration, user impact, and budget consumed.
