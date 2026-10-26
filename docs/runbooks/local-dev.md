# Local Dev Runbook

## Prepare Environment

```powershell
Copy-Item .env.example .env
corepack pnpm dev:infra:validate
corepack pnpm dev:infra:config
```

The `.env.example` file is intentionally development-safe. Production installers must generate their own secrets and public URLs. `dev:infra:config` renders local LiveKit and Coturn configs under `.generated/` from the selected env file.

## Start Bundle

```powershell
corepack pnpm dev:infra:up
```

Application services are placeholders until their implementation changes land. The dependency services are wired with healthchecks so follow-on services can depend on a ready database, cache, object store, RTC server, TURN server, and local edge proxy. The startup command also runs `minio-init` so the development object-storage bucket exists before app services need uploads.

## Verify Dependencies

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- MinIO: `localhost:9000`
- MinIO console: `localhost:9001`
- LiveKit: `localhost:7880`
- Coturn: `localhost:3478`
- Caddy healthcheck: `http://localhost/healthz`

## Inspect Logs

```powershell
corepack pnpm dev:infra:logs
```

## Stop Bundle

```powershell
corepack pnpm dev:infra:down
```

## Environment Contract

The local bundle expects these categories of settings:

- Public URLs: `PUBLIC_BASE_URL`, `ADMIN_BASE_URL`, `LIVEKIT_URL`.
- Data stores: `DATABASE_URL`, `REDIS_URL`, `OBJECT_STORAGE_*`.
- RTC and TURN: `LIVEKIT_*`, `TURN_*`.
- Local port overrides: `POSTGRES_PORT`, `REDIS_PORT`, `MINIO_*_PORT`, `LIVEKIT_*_PORT`, `TURN_PORT`, `HTTP_PORT`, `HTTPS_PORT`.

Keep `.env` out of git. Commit changes to `.env.example` only when the expected development contract changes.

## Contract Checks

```powershell
corepack pnpm contracts:lint
corepack pnpm contracts:generate
corepack pnpm contracts:test
corepack pnpm contracts:typecheck
```

Generated contract outputs live under `packages/contracts/gen` and should be regenerated through Buf.
