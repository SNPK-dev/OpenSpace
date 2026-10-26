# server-api

Go HTTP server — the main API service for OpenSpace.

## Stack

- Go 1.22+
- PostgreSQL via pgx v5
- Standard library HTTP server (net/http ServeMux)
- Embedded SQL migrations

## Build

```bash
# Docker (recommended)
docker build -t openspace-server-api .

# Local (requires Go 1.22+)
go mod download
go build ./cmd/server-api
```

## Run

```bash
# Via docker-compose (recommended)
docker compose up api

# Local
DATABASE_URL=postgres://openspace:openspace@localhost:5432/openspace ./server-api
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | required | PostgreSQL connection string |
| `SERVER_PORT` | `8080` | HTTP listen port |
| `LOG_LEVEL` | `info` | Log level: `debug` or `info` |
| `SESSION_TTL_DAYS` | `30` | Session token expiry in days |

## Bootstrap Flow

On a fresh server:

```bash
# 1. Check status
curl http://localhost:8080/api/v1/bootstrap/status
# → {"bootstrapped":false}

# 2. Create first admin
curl -X POST http://localhost:8080/api/v1/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"server_name":"My Server","admin_username":"admin","admin_email":"admin@example.com","admin_password":"changeme123"}'
# → {"server_id":"...","identity_id":"...","token":"..."}
```

**Security note:** The bootstrap endpoint is unauthenticated by design — it only accepts
the first request and returns 409 thereafter. Configure TLS (via Caddy) before exposing
the server to the internet.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/healthz` | Health check + bootstrap status |
| `GET` | `/api/v1/bootstrap/status` | Bootstrap status |
| `POST` | `/api/v1/bootstrap` | Create server + first admin |

## Migrations

SQL migrations run automatically on startup from `internal/migrate/sql/`.
Applied migrations are tracked in the `schema_migrations` table.

## go.sum

`go.sum` is generated during `docker build` (via `go mod download`).
If developing locally with Go installed, run `go mod tidy` after cloning to generate it.
