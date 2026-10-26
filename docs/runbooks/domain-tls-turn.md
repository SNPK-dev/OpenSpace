# Runbook: Domain / TLS / TURN Setup

Production requires two public DNS names pointing at the host: `PUBLIC_BASE_URL` for Web/API/realtime traffic and `OBJECT_STORAGE_PUBLIC_ENDPOINT` (hostname only, for example `files.example.com`) for browser uploads and signed downloads. Caddy obtains TLS certificates for both. MinIO stays private on the Compose data network; the API uses `minio:9000` for server operations and the public hostname only to sign browser-addressable URLs. The supplied production Compose config restricts MinIO CORS to `PUBLIC_BASE_URL`.

Pass the file hostname explicitly during non-interactive setup: `node scripts/setup.mjs --non-interactive --domain chat.example.com --object-storage-public-endpoint files.example.com`. If omitted, setup derives `files.<domain>`; create DNS for that exact hostname before deployment.

## Pre-requisites

- VPS with a static public IP
- DNS A record pointing your domain to the VPS IP (TTL ≤ 300 for initial setup)
- Ports open in firewall: 80, 443, 3478/tcp, 3478/udp, 5349/tcp, 5349/udp, 50000–50100/udp
- Docker + Docker Compose v2 installed
- `.env` file on the server with all required variables (copy from `.env.example`)

Required env vars:
```
PUBLIC_BASE_URL=https://chat.example.com
OBJECT_STORAGE_PUBLIC_ENDPOINT=files.example.com
CADDY_EMAIL=ops@example.com
TURN_HOST=<your-server-IP-or-domain>
TURN_REALM=example.com
TURN_SECRET=<random-secret>
TURN_TLS_PORT=5349
LIVEKIT_API_KEY=<key>
LIVEKIT_API_SECRET=<secret>
```

## Initial Setup

```bash
# 1. Render production configs
node scripts/render-prod-configs.mjs .env

# 2. Start the full production stack
docker compose -f docker-compose.prod.yml --env-file .env up -d

# 3. Verify domain and TLS (wait ~60s for Caddy to obtain cert)
node scripts/check-domain.mjs .env

# 4. Verify STUN/TURN connectivity
node scripts/diagnose-turn.mjs .env
```

`check-domain.mjs` checks: DNS resolution, TLS cert validity (≥14 days), `/healthz`,
TURN TCP, TURNS TCP.

`diagnose-turn.mjs` checks: STUN UDP (reports your public IP), TURN TCP, TURNS TCP.

## Verify TLS Certificate

```bash
node scripts/check-domain.mjs .env
```

Expected output:
```
[2] HTTPS certificate
  ✓ TLS cert valid, expires 2026-08-11 (89d)
```

If cert is missing: Caddy requests it automatically on first HTTPS request. It can take
10–60 seconds. Check Caddy logs: `docker compose logs caddy`.

## TURN Secret Rotation

Rotate the TURN secret whenever it may be compromised, or on a scheduled basis (e.g. quarterly):

```bash
node scripts/rotate-turn-secret.mjs .env
```

This script:
1. Generates a new 256-bit random secret
2. Patches `.env` in-place (only `TURN_SECRET` line changes)
3. Re-renders `.generated/prod/coturn/turnserver.conf`
4. Restarts `coturn` and `api` containers

Clients in active voice sessions will be disconnected at ICE credential expiry
(credentials are valid for 24 hours). New sessions will use the new secret immediately.

After rotation, verify:
```bash
node scripts/diagnose-turn.mjs .env
```

## Certificate Renewal

Caddy renews Let's Encrypt certificates automatically (90-day cycle, renewed at 30 days
remaining). However, coturn reads the cert file at startup and does not watch for changes.

After Caddy renews a cert, restart coturn to pick it up:

```bash
docker compose restart coturn
```

To automate this, add a weekly cron job on the server:
```cron
0 3 * * 0 cd /opt/openspace && docker compose restart coturn >> /var/log/openspace-coturn-restart.log 2>&1
```

## Troubleshooting

### DNS not resolving

```bash
dig +short <your-domain>
```

If empty: DNS record is missing or TTL hasn't propagated. Wait and retry.
If wrong IP: update the A record at your DNS provider.

### TLS cert fails / Caddy logs ACME error

1. Confirm port 80 is open (ACME HTTP-01 challenge requires it).
2. Confirm DNS is pointing to this server: `dig +short <domain>` must return this server's IP.
3. Check Caddy logs: `docker compose logs caddy --tail=50`
4. Caddy retries automatically. Do not restart repeatedly — ACME has rate limits.

### TURN UDP blocked

Symptoms: `diagnose-turn.mjs` STUN check times out; browsers fall back to TCP relay.

1. Confirm firewall allows UDP 3478 inbound.
2. Confirm TURN_HOST is set to the server's public IP (not `localhost` or a private IP).
3. Check coturn logs: `docker compose logs coturn --tail=50`
4. On some VPS providers, UDP requires explicit firewall rule (separate from TCP rule).

### TURNS TLS not reachable

1. Confirm firewall allows TCP 5349.
2. Confirm coturn has a valid cert: check that `.generated/prod/coturn/turnserver.conf`
   contains the correct cert paths and the cert files exist in the caddy-data volume.
3. Restart coturn after cert is confirmed: `docker compose restart coturn`

### Clients fail to join voice

1. Run `node scripts/diagnose-turn.mjs .env` and confirm STUN returns a public IP.
2. Confirm `TURN_HOST` in `.env` is the public IP (not internal Docker hostname).
3. Confirm `LIVEKIT_URL` points to the public domain over WSS.
4. Check LiveKit logs: `docker compose logs livekit --tail=50`

### Stack upgrade

```bash
# Pull new images
docker compose -f docker-compose.prod.yml --env-file .env pull

# Re-render configs if env changed
node scripts/render-prod-configs.mjs .env

# Rolling restart
docker compose -f docker-compose.prod.yml --env-file .env up -d
```
