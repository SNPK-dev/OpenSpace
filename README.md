# OpenSpace

OpenSpace is a self-hosted communication platform where one server equals one independent community.

> **Release status: 1.0.0-rc.1.** The implementation is release-candidate capable, but stable publication remains blocked on retained clean-host, independent security review, signed distribution, RC soak, and human acceptance evidence. See the [release checklist](docs/release-checklist.md).

Recovery lifecycle commands: `pnpm db:backup`, `pnpm backup:verify -- <bundle>`, `pnpm backup:drill`, `pnpm server:upgrade`, and `pnpm server:rollback`. See [backup and recovery](docs/runbooks/backup-restore.md).

Operational validation commands: `pnpm maintenance:drill`, `pnpm reliability:validate`, and `pnpm reliability:run -- <profile>`. Destructive profiles require an isolated release environment.

Public project policies: [license](LICENSE), [security reporting](SECURITY.md), [contributing](CONTRIBUTING.md), [code of conduct](CODE_OF_CONDUCT.md), [support](SUPPORT.md), [compatibility](docs/support-matrix.md), [known limitations](docs/known-limitations.md), [changelog](CHANGELOG.md), and [release checklist](docs/release-checklist.md).

The product model is intentionally single-tenant:

- no global account is required for MVP;
- identities are scoped to each server;
- data is stored on the server owner's infrastructure;
- one install bundle manages multiple services rather than forcing everything into one process.

## Repository Layout

```text
apps/       Product applications and service entrypoints
packages/   Shared contracts, SDK, domain, UI, config, and testkit packages
infra/      Local and production deployment assets
docs/       Architecture, modules, runbooks, QA, security, and ADRs
openspec/   Accepted product requirements
```

## Local Setup

Requirements:

- Docker Desktop
- Node.js 20+
- pnpm 10+
- Windows, for building the desktop client

Install workspace dependencies:

```powershell
pnpm.cmd install --frozen-lockfile
```

## Quick Commands

All common tasks are one pnpm command. Requires Docker Desktop running.

| Command | What it does |
|---|---|
| `pnpm.cmd dev:up` | Первый запуск: рендерит конфиги и поднимает весь стек с нуля |
| `pnpm.cmd dev:rebuild` | Пересобирает и перезапускает api, realtime-gateway, web-client, admin-web |
| `pnpm.cmd dev:rebuild:api` | Пересобирает только backend (api + realtime-gateway) |
| `pnpm.cmd dev:rebuild:web` | Пересобирает только frontend (web-client + admin-web) |
| `pnpm.cmd dev:restart` | Перезапускает без пересборки (быстро, если код не менялся) |
| `pnpm.cmd dev:ps` | Статус всех контейнеров |
| `pnpm.cmd dev:health` | Проверяет три health-endpoint и печатает "All healthy" |
| `pnpm.cmd dev:logs` | Стримит логи api + gateway + web-client |
| `pnpm.cmd dev:logs:api` | Логи только api |
| `pnpm.cmd dev:logs:gw` | Логи только realtime-gateway |
| `pnpm.cmd dev:logs:web` | Логи только web-client + admin-web |
| `pnpm.cmd dev:down` | Останавливает весь стек |
| `pnpm.cmd desktop:dev` | Запускает Electron в dev-режиме (hot-reload) |
| `pnpm.cmd desktop:build` | Собирает renderer + main process |
| `pnpm.cmd desktop:dist` | Собирает `.exe` инсталлятор |
| `pnpm.cmd web:dev` | Web-client в dev-режиме → `http://127.0.0.1:5174/` |
| `pnpm.cmd admin:dev` | Admin-web в dev-режиме → `http://127.0.0.1:5175/` |

### Типовые сценарии

**Первый запуск (с нуля):**
```powershell
pnpm.cmd install --frozen-lockfile
cp .env.example .env   # заполнить переменные
pnpm.cmd dev:up
pnpm.cmd dev:health
```

**После изменений в Go/backend:**
```powershell
pnpm.cmd dev:rebuild:api
pnpm.cmd dev:health
```

**После изменений в React/frontend:**
```powershell
pnpm.cmd dev:rebuild:web
```

**Быстрая проверка состояния:**
```powershell
pnpm.cmd dev:ps
pnpm.cmd dev:health
```

**Полная пересборка всего стека:**
```powershell
pnpm.cmd dev:rebuild
```

---

## Full Docker Stack

Generate local infrastructure configs and start the whole stack:

```powershell
pnpm.cmd dev:up
```

Useful local URLs:

- Web client: `http://localhost/`
- Admin web: `http://localhost/admin/`
- API health: `http://localhost:8080/healthz`
- Realtime health: `http://localhost:3001/healthz`
- LiveKit: `ws://localhost:7880`

Quick health check (all three endpoints at once):

```powershell
pnpm.cmd dev:health
```

Stop the stack:

```powershell
pnpm.cmd dev:down
```

## Server Only

Start shared infrastructure first:

```powershell
pnpm.cmd dev:infra:up
```

Build and run only the backend services:

```powershell
pnpm.cmd dev:rebuild:api
pnpm.cmd dev:health
```

## Web Clients

Run the main web client in dev mode:

```powershell
pnpm.cmd web:dev
```

Open `http://127.0.0.1:5174/`.

Run the admin web client in dev mode:

```powershell
pnpm.cmd admin:dev
```

Open `http://127.0.0.1:5175/`.

Both dev servers proxy API requests to `http://localhost:8080`; the web client also proxies websocket traffic to `ws://localhost:3001`.

Realtime connections use 30-second, single-use Redis tickets carried in the WebSocket subprotocol header. Browser origins must be listed in `WS_ALLOWED_ORIGINS`; native clients may connect without an `Origin` header. Never expose the long-lived session token in a WebSocket URL.

Application sessions are opaque 256-bit bearer values. PostgreSQL stores only their SHA-256 digests. Authenticated users can list their own sessions with `GET /api/v1/auth/sessions`, rotate the current credential with `POST /api/v1/auth/session/rotate`, and revoke an owned session with `DELETE /api/v1/auth/sessions/{id}`.

Production web/admin responses enforce CSP: bundled scripts only, secure HTTPS/WSS multi-server connections, no objects or framing. Packaged Electron additionally runs a sandboxed renderer, disables production DevTools, validates navigation/IPC/media-permission callers, and opens only HTTP(S) external links in the system browser.

## Windows Desktop Client

Typecheck the Windows client:

```powershell
pnpm.cmd --filter @openspace/desktop-win typecheck
```

Build the renderer/main process:

```powershell
pnpm.cmd desktop:build
```

Build the installer into the default output folder:

```powershell
pnpm.cmd desktop:dist
```

Output:

- `apps/desktop-win/release/OpenSpace Setup 0.0.0.exe`
- `apps/desktop-win/release/win-unpacked/OpenSpace.exe`

If an older local build is running and Windows locks `apps/desktop-win/release/win-unpacked/resources/app.asar`, close OpenSpace first or build into a separate local folder:

```powershell
pnpm.cmd desktop:build
pnpm.cmd --filter @openspace/desktop-win exec electron-builder --win --config.directories.output=release-latest
```

Alternate output:

- `apps/desktop-win/release-latest/OpenSpace Setup 0.0.0.exe`
- `apps/desktop-win/release-latest/win-unpacked/OpenSpace.exe`

Release folders are ignored by git and should not be committed.
