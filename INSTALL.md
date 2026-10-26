# OpenSpace — Server Deployment Guide

> One command to deploy. One domain to share. One community, fully yours.

---

## Table of Contents

1. [Server Requirements](#1-server-requirements)
2. [DNS Setup](#2-dns-setup)
3. [Firewall Rules](#3-firewall-rules)
4. [Deploy with the Script](#4-deploy-with-the-script)
5. [Bootstrap the Admin Account](#5-bootstrap-the-admin-account)
6. [Verify Everything Works](#6-verify-everything-works)
7. [Connect Clients](#7-connect-clients)
8. [Daily Backups](#8-daily-backups)
9. [Updating OpenSpace](#9-updating-openspace)
10. [Security Hardening](#10-security-hardening)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Server Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB SSD | 50 GB+ SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| Network | 100 Mbps | 1 Gbps |

**Recommended providers:** Hetzner Cloud (CX22), DigitalOcean (2 vCPU), Vultr, Linode.
A CX22 at Hetzner (~4 EUR/month) comfortably handles a 20–50 person community.

### Software (installed automatically by the deploy script)
- Docker 24+ with Compose V2
- Node.js 20+

---

## 2. DNS Setup

Before deploying, point your domain to the server's IP.

**Create an A record** in your DNS provider (Cloudflare, Namecheap, etc.):

```
Type: A
Name: chat          (or @ for root domain)
Value: <your-server-ip>
TTL: 300
```

Example: `chat.example.com → 1.2.3.4`

**Verify DNS propagates** (takes 1–15 minutes):

```bash
dig +short chat.example.com
# Should return your server's IP
```

> **Cloudflare users:** Disable the proxy (orange cloud → grey cloud) for your A record.
> Proxied IPs break TURN/WebRTC. You can re-enable the proxy later if you use split DNS.

---

## 3. Firewall Rules

OpenSpace needs several ports open. Run these on your server:

```bash
# Ubuntu/Debian with ufw
ufw allow 22/tcp      # SSH (keep this!)
ufw allow 80/tcp      # HTTP (Let's Encrypt ACME challenge)
ufw allow 443/tcp     # HTTPS
ufw allow 3478/tcp    # TURN
ufw allow 3478/udp    # TURN/UDP
ufw allow 5349/tcp    # TURNS/TLS
ufw allow 5349/udp    # TURNS/DTLS
ufw allow 7881/tcp    # LiveKit TCP relay
ufw allow 7882/udp    # LiveKit WebRTC media
ufw allow 50000:50100/udp  # TURN relay port range
ufw enable
```

**Hetzner/DigitalOcean/Vultr firewall panel:** Add the same rules via their web UI under "Firewall" or "Networking".

---

## 4. Deploy with the Script

> **Important:** OpenSpace builds Docker images from source on the server.
> The deploy script needs the **full repository** (including `apps/`).
> Use one of the options below — all three work correctly.

### Option A — Clone and deploy in one command (recommended)

```bash
# On your server, as root:
git clone https://github.com/SNPK-dev/OpenSpace.git /opt/openspace
cd /opt/openspace
sudo bash scripts/deploy.sh \
  --domain chat.example.com \
  --email ops@example.com
```

### Option B — Auto-clone via `--clone-from` flag

```bash
# The script clones the repo into --dir automatically:
sudo bash <(curl -fsSL https://raw.githubusercontent.com/SNPK-dev/OpenSpace/master/scripts/deploy.sh) \
  --domain chat.example.com \
  --email ops@example.com \
  --clone-from https://github.com/SNPK-dev/OpenSpace.git
```

### Option C — Manual step-by-step

If you prefer to understand each step:

```bash
cd /opt/openspace

# 1. Generate secrets and write .env
node scripts/setup.mjs --domain chat.example.com --admin-email ops@example.com --object-storage-public-endpoint files.example.com

# 2. Render production infrastructure configs (Caddy, coturn, LiveKit)
#    (setup.mjs does this automatically, but you can re-run manually)
node scripts/render-prod-configs.mjs .env

# 3. Secure the secrets file
chmod 600 .env

# 4. Pull images and start all services
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

### What setup.mjs generates

| Secret | Description |
|--------|-------------|
| `POSTGRES_PASSWORD` | 48-char hex — database password |
| `OBJECT_STORAGE_SECRET_KEY` | 48-char hex — MinIO object storage |
| `OBJECT_STORAGE_PUBLIC_ENDPOINT` | Browser-facing MinIO hostname supplied with `--object-storage-public-endpoint` (defaults to `files.<domain>`) |
| `TURN_SECRET` | 48-char hex — TURN authentication |
| `LIVEKIT_API_KEY` | 24-char hex — LiveKit server key |
| `LIVEKIT_API_SECRET` | 64-char hex — LiveKit server secret |

All secrets are written to `.env`. **Keep this file private.**

### Verify services are running

```bash
docker compose -f docker-compose.prod.yml --env-file .env ps
```

All services should show `Up` or `healthy`. Allow 30–60 seconds for startup.

```bash
# Health check
curl https://chat.example.com/healthz
# → {"status":"ok"} or {"status":"not_bootstrapped"}
```

`not_bootstrapped` is correct if you haven't completed step 5 yet.

---

## 5. Bootstrap the Admin Account

Open your browser and navigate to `https://chat.example.com/admin`.

You will see a one-time bootstrap form. Fill in:

| Field | Description |
|-------|-------------|
| Server name | Your community's name (e.g. "Acme Team") |
| Admin username | Your login username |
| Admin email | Your email |
| Admin password | A strong password |
| Registration policy | How new users join (see below) |

**Registration policies:**

| Policy | Who can join |
|--------|-------------|
| `open` | Anyone with the link |
| `invite_code_only` | People with a valid invite code (recommended) |
| `approval_required` | Join requests need admin approval |
| `closed` | No new registrations |

After completing bootstrap, the admin panel unlocks and you can invite members.

---

## 6. Verify Everything Works

Run through this checklist after bootstrap:

```bash
# 1. API health
curl -s https://chat.example.com/healthz | grep '"status":"ok"'

# 2. Server discovery (for client device registration)
curl -s https://chat.example.com/.well-known/openspace/server | python3 -m json.tool

# 3. TLS certificate issued
echo | openssl s_client -connect chat.example.com:443 -servername chat.example.com 2>/dev/null \
  | openssl x509 -noout -dates

# 4. TURN connectivity (requires turnutils_uclient or diagnose script)
node scripts/diagnose-turn.mjs .env
```

**Expected output for server discovery:**
```json
{
  "server_id": "<uuid>",
  "name": "Your Community",
  "registration_policy": "invite_code_only",
  "features": { "text": true, "voice": true, "files": true, "device_pairing": true },
  "tls_required": true
}
```

---

## 7. Connect Clients

### Web client

Share `https://chat.example.com` with your community. The web client works in any modern browser — no installation required.

**First-time user flow:**
1. Open `https://chat.example.com`
2. Click **Create vault** (first device) or **Transfer vault** (pairing from existing device)
3. Create a local vault (password-encrypted, stored on-device)
4. Click **Add server** → enter `https://chat.example.com`
5. Register or accept an invite

### Windows desktop client

The Windows `.exe` is server-specific — it must be built with your server's URL baked in.

**Build on Windows (from source):**

```powershell
# In the desktop-win app directory
cd apps\desktop-win
npm install
npm run dist
# Output: release\OpenSpace Setup X.X.X.exe
```

The Windows client is **server-agnostic** — no server URL is baked into the build.
After installing, users add their server at runtime via **Add Server** in the app.

Distribute `release\OpenSpace Setup X.X.X.exe` to your community members.

### Mobile (React Native)

See `apps/mobile/README.md` for build instructions. Same pattern — build with your server URL.

---

## 8. Daily Backups

The deploy script registers a daily backup cron at 3 AM. Verify it:

```bash
crontab -l | grep openspace
# → 0 3 * * * cd /opt/openspace && node scripts/backup.mjs .env ...
```

**Manual backup:**
```bash
cd /opt/openspace
node scripts/backup.mjs --env .env --root backups --keep 14
# Creates an integrity-checked directory under backups/
```

The bundle includes the PostgreSQL dump and all MinIO objects. It deliberately excludes `.env` and Redis; store configuration/secrets separately in an encrypted operator vault.

**Restore from backup:**
```bash
node scripts/verify-backup.mjs backups/<bundle>
node scripts/restore.mjs --backup-dir backups/<bundle> --env .env --yes
```

**Offsite backup (recommended):** Copy backups to a separate location.

```bash
# Example: copy to an S3-compatible bucket
aws s3 cp backups/openspace-backup-$(date +%Y-%m-%d).tar.gz s3://your-bucket/openspace/

# Or rsync to another server
rsync -az backups/ backup-user@backup-host:/var/backups/openspace/
```

See `docs/runbooks/backup-restore.md` for full procedures.

---

## 9. Updating OpenSpace

Use `node scripts/upgrade.mjs --target <release> --env .env`; it refuses deployment mutation until a pre-upgrade PostgreSQL+MinIO bundle verifies. Use `node scripts/rollback.mjs --yes` to restore the recorded recovery point. Migration 033 removes recoverable session-token plaintext and cannot be downgraded by application rollback alone.

```bash
cd /opt/openspace-src    # your repo clone
git pull

# Stop running services
docker compose -f docker-compose.prod.yml --env-file /opt/openspace/.env down

# Copy updated files
cp docker-compose.yml docker-compose.prod.yml /opt/openspace/
cp -r infra scripts /opt/openspace/

# Re-render infrastructure configs (in case templates changed)
cd /opt/openspace
node scripts/render-prod-configs.mjs .env

# Pull new images and restart
docker compose -f docker-compose.prod.yml --env-file .env pull
docker compose -f docker-compose.prod.yml --env-file .env up -d

# Migrations apply automatically on API startup
```

**Check migration status:**
```bash
node scripts/migrate-status.mjs .env
```

---

## 10. Security Hardening

OpenSpace ships a restrictive CSP in Caddy and both static nginx containers. Custom integrations must use HTTPS/WSS. If additional image/font/connect origins are required, extend the narrow directive in all three production configurations and rerun `node scripts/validate-client-content-security.mjs`; do not add remote script origins or `unsafe-eval`.

### Essential

```bash
# Protect secrets
chmod 600 /opt/openspace/.env

# SSH: disable password login, use keys only
sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# Rotate TURN secret periodically (every 90 days)
node scripts/rotate-turn-secret.mjs .env
```

### Recommended

```bash
# Install unattended-upgrades for automatic security patches
apt-get install -y unattended-upgrades
dpkg-reconfigure --priority=low unattended-upgrades

# Install fail2ban to block brute-force SSH attempts
apt-get install -y fail2ban
systemctl enable --now fail2ban
```

### Audit logs

```bash
# Tail audit events
docker compose -f docker-compose.prod.yml --env-file .env exec api \
  sh -c 'tail -f /proc/1/fd/1' | grep audit
```

Or via the admin panel: `https://chat.example.com/admin` → Audit.

---

## 11. Troubleshooting

### `lstat /opt/openspace/apps: no such file or directory`

Docker Compose пытается собрать образы из исходников, но директория `apps/` отсутствует — значит на сервер попали только конфигурационные файлы, а не весь репозиторий.

```bash
# Вариант 1 — клонировать и скопировать apps/
git clone https://github.com/SNPK-dev/OpenSpace.git /tmp/openspace-src
cp -r /tmp/openspace-src/apps          /opt/openspace/
cp -r /tmp/openspace-src/packages      /opt/openspace/
cp    /tmp/openspace-src/tsconfig.base.json /opt/openspace/
cp    /tmp/openspace-src/pnpm-workspace.yaml /opt/openspace/
cp    /tmp/openspace-src/package.json  /opt/openspace/
sudo bash /opt/openspace/scripts/deploy.sh --domain <domain> --email <email> --dir /opt/openspace

# Вариант 2 — клонировать сразу с флагом --clone-from
sudo bash /opt/openspace/scripts/deploy.sh \
  --domain <domain> --email <email> \
  --clone-from https://github.com/SNPK-dev/OpenSpace.git
```

### Services not starting

```bash
docker compose -f docker-compose.prod.yml --env-file .env logs -f
# Check each service: logs api / logs postgres / logs caddy
```

### TLS certificate not issued

Caddy obtains the certificate automatically on first request. If it fails:

```bash
# Check DNS resolves correctly
dig +short chat.example.com
# Must return your server IP, not a Cloudflare proxy IP

# Check ports 80 and 443 are reachable
curl http://chat.example.com/healthz  # should redirect to HTTPS
curl https://chat.example.com/healthz

# View Caddy logs
docker compose -f docker-compose.prod.yml --env-file .env logs caddy
```

Common causes:
- DNS not yet propagated (wait 5–15 minutes)
- Port 80/443 blocked by cloud firewall (check the provider's firewall panel)
- Cloudflare proxy enabled (disable it — orange cloud → grey cloud)

### Database connection failed

```bash
docker compose -f docker-compose.prod.yml --env-file .env exec postgres \
  pg_isready -U openspace
```

### Voice/TURN not working

```bash
# Run the built-in TURN diagnostic
node scripts/diagnose-turn.mjs .env
```

Common causes:
- UDP ports 3478, 5349, 50000–50100 not open in firewall
- Server behind NAT without proper public IP configuration
- TURN_SECRET mismatch between `.env` and client

### Migrations not applying

```bash
# Check migration status
node scripts/migrate-status.mjs .env

# Apply manually if needed
docker compose -f docker-compose.prod.yml --env-file .env exec api \
  sh -c 'DATABASE_URL=$DATABASE_URL /app/server-api migrate-only'
```

Or use the standalone migration tool:

```bash
DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" \
  docker run --rm --network openspace_default \
  -e DATABASE_URL openspace-api:latest
```

### Full reset (nuclear option)

```bash
# WARNING: this deletes all data
docker compose -f docker-compose.prod.yml --env-file .env down -v
rm .env
node scripts/setup.mjs --domain chat.example.com --admin-email ops@example.com --object-storage-public-endpoint files.example.com
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

---

## Reference

| File | Purpose |
|------|---------|
| `.env` | All secrets and configuration — keep private |
| `docker-compose.yml` | Base service definitions |
| `docker-compose.prod.yml` | Production overlay (TLS, closed ports) |
| `.generated/prod/` | Rendered Caddy/coturn/LiveKit configs |
| `scripts/setup.mjs` | Interactive setup — generates `.env` |
| `scripts/deploy.sh` | Full VPS deploy script |
| `scripts/backup.mjs` | Backup to local archive |
| `scripts/restore.mjs` | Restore from archive |
| `scripts/diagnose-turn.mjs` | TURN connectivity diagnostics |
| `scripts/rotate-turn-secret.mjs` | Rotate TURN secret without downtime |
| `scripts/migrate-status.mjs` | Show DB migration state |

For further detail: `docs/runbooks/` contains deep-dive runbooks for operations, backup/restore, security incidents, and domain/TLS/TURN setup.

Enable the private observability profile only after setting `GRAFANA_ADMIN_PASSWORD`: `docker compose -f docker-compose.prod.yml --env-file .env --profile observability up -d`. Prometheus and Grafana deliberately publish no host ports; see `docs/runbooks/observability.md`.
# Verified release installation

Stable/RC artifacts must be installed through `scripts/install-release.sh`. It verifies the GitHub Actions keyless signature on `release-manifest.json`, checks the server bundle SHA-256 before extraction, and produces `.release-images.env` containing immutable OCI digests. Pass `.env` and `.release-images.env` to production Compose. Do not deploy stable releases from mutable image tags.

After creating the extracted release's `.env`, deploy without local builds:

```bash
bash scripts/deploy-release.sh .env .release-images.env
```

For an immutable bundle-to-bundle upgrade, keep the previous extracted release and run from the new release directory:

```bash
node scripts/upgrade-release.mjs --previous /opt/openspace/releases/previous --env /etc/openspace/.env --project openspace
```

Rollback metadata includes the verified pre-upgrade PostgreSQL + MinIO bundle. Restore it with `node scripts/rollback-release.mjs --state /etc/openspace/.openspace/releases/artifact-rollback.json`.

This command rejects missing or mutable first-party image references and always uses `--no-build`.
