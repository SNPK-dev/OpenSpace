# Spec: domain-tls capability

Change: domain-tls-turn-automation

## Caddy (HTTPS + ACME)

- Production Caddyfile: HTTPS on 443, ACME via Let's Encrypt, HSTS, HTTP→HTTPS redirect
- Caddy-data volume persists cert across restarts
- coturn mounts caddy-data volume read-only for cert access

## Coturn (TURN + TURNS)

- Dev: plain TURN on 3478, static auth secret, no TLS
- Prod: TURN on 3478 + TURNS TLS on 5349, certs from caddy-data volume
- Auth: HMAC-SHA1 REST API (use-auth-secret), time-limited credentials from api

## LiveKit (external IP mode)

- Dev: internal Docker network, no external IP
- Prod: use_external_ip true, TURNS host advertised to clients

## ICE credential generation (api)

- Endpoint: GET /api/v1/rtc/ice-servers
- Auth required (JoinVoice gate)
- STUN: stun:TURN_HOST:TURN_PORT
- TURN: turn:TURN_HOST:TURN_PORT?transport=udp, turn:TURN_HOST:TURN_PORT?transport=tcp
- TURNS: turns:TURN_HOST:TURN_TLS_PORT?transport=tcp
- Credential: base64(HMAC-SHA1(TURN_SECRET, unix_expiry:identityID))
- Expiry: 24 hours from generation time

## TURN secret rotation

- rotate-turn-secret.mjs: CSPRNG 32-byte hex, atomic .env patch, re-render, restart
- Restarts both coturn and api to keep credentials in sync

## STUN/TURN diagnostics

- diagnose-turn.mjs: raw STUN Binding Request (RFC 5389) over UDP
- Reports: public IP (XOR-MAPPED-ADDRESS), RTT, TURN TCP, TURNS TCP reachability

## Production compose overlay

- docker-compose.prod.yml: .generated/prod/ mounts, dev ports removed, restart: always

## Validation gates

- validate-prod-infra.mjs: checks all prod artifacts, docker-compose.prod.yml,
  rotate-turn-secret.mjs, diagnose-turn.mjs, runbook presence
