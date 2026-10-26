# OpenSpace — Полный пайплайн тестирования

> Этот документ описывает полный процесс проверки проекта: от поднятия инфраструктуры
> до ручного smoke-теста каждого клиента.

---

## Содержание

1. [Переменные окружения](#1-переменные-окружения)
2. [Поднять инфраструктуру](#2-поднять-инфраструктуру)
3. [Bootstrap первого запуска](#3-bootstrap-первого-запуска)
4. [Получить токен](#4-получить-токен)
5. [Автотесты — API e2e скрипты](#5-автотесты--api-e2e-скрипты)
6. [Автотесты — Playwright (Desktop)](#6-автотесты--playwright-desktop)
7. [Автотесты — Playwright (Web Client)](#7-автотесты--playwright-web-client)
8. [Автотесты — Playwright (Admin Web)](#8-автотесты--playwright-admin-web)
9. [Автотесты — Jest (Mobile)](#9-автотесты--jest-mobile)
10. [Полная верификация проекта](#10-полная-верификация-проекта)
11. [Ручной smoke-тест — Web Client](#11-ручной-smoke-тест--web-client)
12. [Ручной smoke-тест — Desktop Windows](#12-ручной-smoke-тест--desktop-windows)
13. [Ручной smoke-тест — Admin Panel](#13-ручной-smoke-тест--admin-panel)
14. [Ручной smoke-тест — Mobile](#14-ручной-smoke-тест--mobile)
15. [Проверка инфраструктуры](#15-проверка-инфраструктуры)
16. [Итоговый чеклист](#16-итоговый-чеклист)

---

## 1. Переменные окружения

### Что нужно знать до запуска тестов

Все тесты требуют **один токен** — токен admin-пользователя, полученный после логина.
Это обычный Bearer-токен из ответа `POST /api/v1/auth/login`.

Один и тот же токен используется под двумя именами переменных в разных частях проекта:

| Имя переменной | Где используется | Описание |
|---|---|---|
| `API_TOKEN` | `scripts/e2e-*.mjs`, `scripts/load-test.mjs` | Токен пользователя с нужными правами (обычно admin) |
| `ADMIN_API_TOKEN` | Playwright (`apps/*/e2e/`) | Токен admin для создания тестовых данных в `global.setup.ts` |
| `API_URL` | Везде (опционально) | Базовый URL API. По умолчанию `http://localhost:8080` |

> **Итого:** получить один токен, экспортировать под двумя именами — и всё работает.

### Переменные `.env` (генерируются автоматически)

Генерируются через `node scripts/setup.mjs`. Для справки:

| Переменная | Дефолт | Описание |
|---|---|---|
| `POSTGRES_DB` | `openspace` | Имя базы данных |
| `POSTGRES_USER` | `openspace` | Пользователь PostgreSQL |
| `POSTGRES_PASSWORD` | `openspace` | Пароль PostgreSQL (setup.mjs генерирует случайный) |
| `DATABASE_URL` | `postgres://openspace:openspace@postgres:5432/openspace` | Строка подключения к БД |
| `REDIS_URL` | `redis://redis:6379` | URL Redis |
| `OBJECT_STORAGE_ACCESS_KEY` | `openspace` | Логин MinIO |
| `OBJECT_STORAGE_SECRET_KEY` | `change-me-openspace` | Пароль MinIO (setup.mjs генерирует случайный) |
| `OBJECT_STORAGE_BUCKET` | `openspace` | Имя бакета |
| `LIVEKIT_URL` | `ws://livekit:7880` | URL LiveKit SFU (внутри Docker-сети) |
| `LIVEKIT_API_KEY` | `devkey` | Ключ для генерации голосовых токенов |
| `LIVEKIT_API_SECRET` | `devsecret` | Секрет LiveKit (setup.mjs генерирует случайный) |
| `TURN_HOST` | `localhost` | Хост TURN-сервера для WebRTC |
| `TURN_PORT` | `3478` | Порт TURN-сервера |
| `TURN_SECRET` | `devturn` | Секрет для HMAC-подписи TURN-кредов (setup.mjs генерирует) |
| `LOG_LEVEL` | `info` | Уровень логов: `debug` / `info` / `warn` / `error` |

---

## 2. Поднять инфраструктуру

### Шаг 2.1 — Сгенерировать конфиги

```bash
node scripts/setup.mjs
```

Вводишь при запросе:
- **Domain:** `localhost` (для локального тестирования)
- **Admin email:** `ops@example.com`

Скрипт создаёт:
- `.env` — все секреты и конфиги
- `.generated/livekit/livekit.yaml` — конфиг LiveKit
- `.generated/coturn/turnserver.conf` — конфиг Coturn

### Шаг 2.2 — Запустить все сервисы

```bash
docker compose --env-file .env up -d
```

### Шаг 2.3 — Убедиться что всё поднялось (подождать ~30 сек)

```bash
docker compose ps
```

Все сервисы должны быть в статусе `healthy` или `running`:

- [ ] `openspace-dev-postgres-1` — healthy
- [ ] `openspace-dev-redis-1` — healthy
- [ ] `openspace-dev-minio-1` — healthy
- [ ] `openspace-dev-livekit-1` — healthy/running
- [ ] `openspace-dev-coturn-1` — running

```bash
# Быстрая проверка API и Gateway
curl http://localhost:8080/healthz   # → {"status":"ok"} или {"status":"not_bootstrapped"}
curl http://localhost:3001/healthz   # → {"status":"ok"}
```

> Если API и Gateway не запущены в Docker (вариант нативного запуска Go):
>
> ```bash
> # Терминал 1 — API
> cd apps/server-api
> DATABASE_URL="postgres://openspace:openspace@localhost:5432/openspace" \
> REDIS_URL="redis://localhost:6379" \
> LIVEKIT_URL="ws://localhost:7880" \
> LIVEKIT_API_KEY="devkey" \
> LIVEKIT_API_SECRET="devsecret" \
> STORAGE_ENDPOINT="localhost:9000" \
> STORAGE_ACCESS_KEY="openspace" \
> STORAGE_SECRET_KEY="change-me-openspace" \
> STORAGE_BUCKET="openspace" \
> STORAGE_USE_SSL="false" \
> TURN_HOST="localhost" TURN_PORT="3478" TURN_SECRET="devturn" \
>   go run ./cmd/server-api/
>
> # Терминал 2 — Realtime Gateway
> cd apps/realtime-gateway
> DATABASE_URL="postgres://openspace:openspace@localhost:5432/openspace" \
> REDIS_URL="redis://localhost:6379" \
>   go run ./cmd/realtime-gateway/
> ```

---

## 3. Bootstrap первого запуска

Выполняется **один раз** на чистом сервере.

### Вариант A — через браузер

Открыть `http://localhost:8080/admin` → заполнить форму:
- Server name: `OpenSpace Dev`
- Admin username: `admin`
- Admin password: `Admin123!`

### Вариант B — через API

```bash
curl -s -X POST http://localhost:8080/api/v1/bootstrap \
  -H "Content-Type: application/json" \
  -d '{
    "server_name": "OpenSpace Dev",
    "admin_username": "admin",
    "admin_password": "Admin123!",
    "admin_display_name": "Admin"
  }'
```

### Вариант C — через e2e-скрипт

```bash
node scripts/e2e-admin-bootstrap-flow.mjs
```

---

## 4. Получить токен

```bash
curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!"}'
```

Ответ:
```json
{"token":"<ВОТ_ЭТОТ_ТОКЕН>","identity":{"username":"admin",...}}
```

Экспортировать в обе переменные (один и тот же токен):

```bash
export API_TOKEN="<токен>"
export ADMIN_API_TOKEN="<токен>"
```

---

## 5. Автотесты — API e2e скрипты

Проверяют каждый эндпоинт API напрямую через HTTP, без браузера.

### 5.1 Полный пайплайн (все фазы)

```bash
API_TOKEN=$API_TOKEN node scripts/e2e-run-all.mjs
```

Выполняет последовательно:

| Фаза | Скрипт | Шагов | Что проверяет |
|---|---|---|---|
| 1 | Bootstrap | — | Пропускается если `API_TOKEN` уже задан |
| 2 | Text chat | 12 | Комнаты, каналы, сообщения, пагинация |
| 3 | Files + DM | 12 | Загрузка файлов, DM-переписка, поиск |
| 4 | Voice | 12 | Join/leave, heartbeat, state (mute/camera), stats |
| 5 | Load | 10 | Конкурентные запросы, 0 ошибок 5xx |

Ожидаемый вывод:
```
▶ Phase 2: Text chat flow        → 12/12 steps passed
▶ Phase 3: Files, DM and search  → 12/12 steps passed
▶ Phase 4: Voice chat flow       → 12/12 steps passed
▶ Phase 5: Load and chaos tests  → 10/10 tests passed
✓ ALL PHASES PASSED
```

### 5.2 Запуск отдельных скриптов

```bash
API_TOKEN=$API_TOKEN node scripts/e2e-text-chat-flow.mjs
API_TOKEN=$API_TOKEN node scripts/e2e-voice-chat-flow.mjs
API_TOKEN=$API_TOKEN node scripts/e2e-files-dm-room-flow.mjs
API_TOKEN=$API_TOKEN node scripts/load-test.mjs
```

### 5.3 Dry-run (без реальных запросов, просто план)

```bash
node scripts/e2e-voice-chat-flow.mjs --dry-run
```

---

## 6. Автотесты — Playwright (Desktop)

Запускаются в Chromium (не Electron), тестируют рендерер через Vite dev server на порту 5176.

```bash
ADMIN_API_TOKEN=$ADMIN_API_TOKEN \
  pnpm --filter desktop-win exec playwright test --reporter=list
```

**22 теста, 3 группы:**

**Auth (7 тестов):**
- [ ] login page renders correctly
- [ ] login with valid credentials shows sidebar
- [ ] login with invalid credentials shows error
- [ ] unauthenticated access redirects to login
- [ ] register page is accessible from login
- [ ] authenticated user sees sidebar and identity
- [ ] logout works and returns to login

**Chat (7 тестов):**
- [ ] sidebar shows the created room
- [ ] clicking room expands channels
- [ ] navigating to channel shows chat pane
- [ ] can send a message via Enter
- [ ] sent message shows correct sender name
- [ ] input clears after send
- [ ] Shift+Enter inserts newline without sending

**Voice (8 тестов):**
- [ ] voice channel shows Join Voice button
- [ ] voice channel header shows channel name
- [ ] joining voice shows leave, mute, cam and share controls
- [ ] audio: microphone active by default; mute/unmute updates server state
- [ ] video: camera off by default; camera on/off updates server state
- [ ] screenshare: off by default; start/stop screen share updates server state
- [ ] leaving voice returns to Join Voice button

Ожидаемый вывод: `22 passed`

---

## 7. Автотесты — Playwright (Web Client)

Тестируют веб-клиент через Vite dev server на порту 5174.

```bash
ADMIN_API_TOKEN=$ADMIN_API_TOKEN \
  pnpm --filter web-client exec playwright test --reporter=list
```

**Auth:**
- [ ] login page renders correctly
- [ ] login with valid credentials redirects to main app
- [ ] login with invalid password shows error
- [ ] login with unknown username shows error
- [ ] register page is accessible from login
- [ ] register page requires invite code
- [ ] register with invalid invite code shows error
- [ ] unauthenticated access to / redirects to login

**Rooms:**
- [ ] sidebar is visible after login
- [ ] created room appears in sidebar
- [ ] expanding room shows its channel
- [ ] clicking a text channel opens chat pane
- [ ] can navigate directly to a channel by URL
- [ ] channel header shows channel name
- [ ] user identity is shown in sidebar after refresh

**Messages:**
- [ ] can type and send a message with Enter key
- [ ] sent message shows correct content
- [ ] sent message shows sender display name
- [ ] can delete own message
- [ ] input clears after sending
- [ ] Shift+Enter adds newline without sending

**DM:**
- [ ] DM conversation appears in sidebar
- [ ] can navigate to DM conversation
- [ ] can send a DM message

**Attachments:**
- [ ] full upload flow via API: presign → PUT → confirm returns URL
- [ ] confirm before upload returns 422 or 404

---

## 8. Автотесты — Playwright (Admin Web)

Тестируют admin-панель на порту 5175.

```bash
ADMIN_API_TOKEN=$ADMIN_API_TOKEN \
  pnpm --filter admin-web exec playwright test --reporter=list
```

**Auth:**
- [ ] shows OpenSpace Admin login heading
- [ ] login with valid admin credentials succeeds
- [ ] login with invalid credentials shows error
- [ ] admin panel is accessible when authenticated

**Identities (управление пользователями):**
- [ ] identities page shows table with users
- [ ] identities table has at least one row
- [ ] each identity row shows username and status badge
- [ ] invites page is accessible
- [ ] can generate a new invite code

---

## 9. Автотесты — Jest (Mobile)

Unit-тесты React Native компонентов с замоканными нативными зависимостями.

```bash
pnpm --filter mobile test
```

**AuthContext (4 теста):**
- [ ] initializes with isLoading=true and isAuthenticated=false
- [ ] sets isAuthenticated=true after successful login
- [ ] throws on login failure
- [ ] clears identity and token on logout
- [ ] sets isAuthenticated=true after successful register

**LoginScreen (6 тестов):**
- [ ] renders title and subtitle
- [ ] renders username and password inputs
- [ ] renders Log In button
- [ ] calls login with entered credentials on button press
- [ ] shows error message on login failure
- [ ] shows loading state during login
- [ ] navigates to Register screen on link press

**RegisterScreen:**
- [ ] renders регистрационная форма
- [ ] валидация полей

---

## 10. Полная верификация проекта

Запускает все валидаторы: lint, typecheck, unit-тесты, контракты, инфра, безопасность, e2e-сценарии, CI.

```bash
pnpm verify
```

Включает проверки:

| Валидатор | Что проверяет |
|---|---|
| `validate-workspace` lint | Go vet, TS линтеры |
| `validate-workspace` typecheck | TypeScript компиляция без ошибок |
| `validate-workspace` test | Go unit-тесты |
| `validate-dev-infra` | Docker Compose, healthcheck'и, порты |
| `validate-prod-infra` | Prod конфиги, TLS, Caddy |
| `validate-contracts` | Protobuf схемы, codegen актуален |
| `validate-domain` | Domain-модели, bounded contexts |
| `validate-openspec-workflow` | Все 41 change archived |
| `validate-obsidian-vault` | Структура документации |
| `validate-backups` | Backup скрипты и процедуры |
| `validate-ratelimits` | Rate limit middleware и конфиги |
| `validate-audit-logs` | Audit log покрытие |
| `validate-bundle` | Сборка бандла |
| `validate-privacy-logs` | PII-редакция в логах |
| `validate-security-hardening` | CORS, session security |
| `validate-rest-contracts` | REST эндпоинты vs спецификации |
| `validate-e2e-scenarios` | E2e скрипты покрывают все шаги |
| `validate-ci` | GitHub Actions конфиги корректны |

Ожидаемый вывод: каждый валидатор заканчивается `N passed, 0 failed`.

---

## 11. Ручной smoke-тест — Web Client

```bash
cd apps/web-client && pnpm dev
# Открыть http://localhost:5174
```

### Аутентификация

- [ ] Открыть `http://localhost:5174` → показывается форма логина
- [ ] Войти с неверным паролем → сообщение об ошибке
- [ ] Войти под `admin` / `Admin123!` → открывается главный экран с sidebar
- [ ] Нажать logout → редирект на `/login`
- [ ] Перейти на `/` без логина → редирект на `/login`

### Регистрация

- [ ] На странице логина нажать "Register" → открывается форма регистрации
- [ ] Заполнить без invite-кода → ошибка валидации
- [ ] Создать invite через admin-панель, ввести код → успешная регистрация
- [ ] Войти под новым пользователем → работает

### Комнаты и каналы

- [ ] В sidebar нажать "Create Room" → комната создаётся и появляется в списке
- [ ] Нажать на комнату → раскрывается список каналов
- [ ] Нажать "+" рядом с текстовым каналом → канал создаётся
- [ ] Нажать "+" рядом с голосовым каналом → канал с иконкой 🔊

### Текстовый чат

- [ ] Открыть текстовый канал → чат-панель с полем ввода
- [ ] Ввести текст + Enter → сообщение отправилось и появилось в списке
- [ ] Shift+Enter → перенос строки, сообщение не отправилось
- [ ] Открыть тот же канал в другой вкладке → новое сообщение появляется в реальном времени (WebSocket)
- [ ] Навести на своё сообщение → кнопка удалить
- [ ] Удалить сообщение → исчезает из ленты

### Загрузка файлов

- [ ] В поле ввода нажать кнопку прикрепления → диалог выбора файла
- [ ] Выбрать изображение → превью / имя файла отображается
- [ ] Отправить → сообщение с вложением появляется
- [ ] Нажать на вложение → файл открывается / скачивается

### Голосовой канал

- [ ] Открыть голосовой канал → кнопка "📞 Join Voice"
- [ ] Нажать Join → появляются кнопки Mute / Deafen / Cam / Share / Leave
- [ ] Нажать "🎤 Mute" → кнопка меняется на "🔇 Unmute", иконка 🔇 у участника
- [ ] Нажать "🔇 Unmute" → кнопка меняется обратно на "🎤 Mute"
- [ ] Нажать "📷 Cam On" → кнопка меняется на "📹 Cam Off"
- [ ] Нажать "📹 Cam Off" → кнопка меняется обратно
- [ ] Нажать "🖥 Share Screen" → запрос захвата экрана → кнопка "🖥 Stop Share"
- [ ] Нажать "🖥 Stop Share" → шаринг остановился
- [ ] Открыть тот же канал в другой вкладке → второй участник виден в списке
- [ ] Нажать "📵 Leave" → вернулся к кнопке "Join Voice"

### DM

- [ ] В sidebar найти раздел DM / нажать на пользователя → открывается диалог
- [ ] Отправить сообщение → появляется в ленте
- [ ] Открыть DM у второго пользователя → сообщение доставлено в реальном времени

### Поиск

- [ ] Использовать поиск → результаты релевантны
- [ ] Поиск по DM → работает

### Присутствие (Presence)

- [ ] Войти под двумя разными пользователями → оба видят онлайн-статус друг друга
- [ ] Закрыть одну вкладку → статус меняется на offline

---

## 12. Ручной smoke-тест — Desktop Windows

```bash
cd apps/desktop-win && pnpm dev
# Открыть http://localhost:5176
```

Выполнить **тот же чеклист**, что и для Web Client (разделы 11.1–11.7).

Дополнительно специфично для Desktop:

- [ ] Окно открывается корректно, нет белых экранов
- [ ] При получении нового сообщения — системное уведомление Windows
- [ ] Приложение не падает при сворачивании/разворачивании
- [ ] Все API-запросы идут через `http://localhost:8080` (без CORS-ошибок в DevTools)

---

## 13. Ручной smoke-тест — Admin Panel

```bash
cd apps/admin-web && pnpm dev
# Открыть http://localhost:5175
```

- [ ] Открыть `http://localhost:5175` → форма логина с заголовком "OpenSpace Admin"
- [ ] Войти с обычным (не admin) аккаунтом → ошибка доступа
- [ ] Войти под `admin` / `Admin123!` → dashboard открылся

**Пользователи:**
- [ ] Открыть раздел Users / Identities → таблица со всеми пользователями
- [ ] Каждая строка показывает username и статус (active/disabled)
- [ ] Нажать "Disable" на пользователе → статус изменился на disabled
- [ ] Попробовать войти под заблокированным пользователем → ошибка
- [ ] Нажать "Enable" → пользователь разблокирован, вход работает

**Приглашения:**
- [ ] Открыть раздел Invites → список существующих инвайтов
- [ ] Нажать "Generate" → новый invite-код сгенерирован
- [ ] Использовать код для регистрации → успешно

**Настройки:**
- [ ] Открыть Settings → форма с параметрами сервера
- [ ] Изменить Server Name → сохранить → изменения применились

**Audit Log:**
- [ ] Открыть Audit Log → лог с историей действий
- [ ] В логе видны: login, logout, регистрация, изменения настроек

**Backup:**
- [ ] Нажать "Create Backup" → операция завершилась успешно
- [ ] В Audit Log или Backup Log появилась запись о бэкапе

---

## 14. Ручной smoke-тест — Mobile

```bash
cd apps/mobile && pnpm start
# Сканировать QR в Expo Go (iOS или Android)
# Или: pnpm android / pnpm ios
```

На экране подключения ввести URL сервера: `http://<IP-твоего-компьютера>:8080`

- [ ] Экран логина открывается
- [ ] Войти под тестовым пользователем → главный экран
- [ ] Список комнат/каналов отображается
- [ ] Открыть текстовый канал → история сообщений
- [ ] Отправить сообщение → появляется в ленте
- [ ] Открыть голосовой канал → кнопка Join
- [ ] Нажать Join → войти в канал
- [ ] Mute/Unmute работает
- [ ] Leave → выход из канала
- [ ] Открыть DM → отправить сообщение

---

## 15. Проверка инфраструктуры

### Health checks всех сервисов

```bash
curl http://localhost:8080/healthz            # API
curl http://localhost:3001/healthz            # Realtime Gateway
curl http://localhost:7880                    # LiveKit
curl http://localhost:9000/minio/health/live  # MinIO
```

Все должны ответить 200.

### RTC статистика

```bash
curl -H "Authorization: Bearer $API_TOKEN" \
  http://localhost:8080/api/v1/rtc/stats
```

Ожидаемый ответ:
```json
{
  "voice_rooms_active": 0,
  "voice_participants_total": 0,
  "counters": {
    "tokens_issued": N,
    "ice_served": N,
    "voice_joins": N,
    ...
  }
}
```

### TURN-сервер (WebRTC NAT traversal)

```bash
node scripts/diagnose-turn.mjs .env
```

### Статус миграций БД

```bash
node scripts/migrate-status.mjs .env
# Все миграции должны быть applied
```

### Бэкап

```bash
node scripts/backup.mjs .env
# Должен завершиться без ошибок
```

Проверить запись в БД:
```bash
docker exec openspace-dev-postgres-1 \
  psql -U openspace -d openspace \
  -c "SELECT * FROM backup_log ORDER BY created_at DESC LIMIT 3;"
```

---

## 16. Итоговый чеклист

Отмечай по порядку. Все пункты должны быть выполнены для production-ready статуса.

### Инфраструктура

- [ ] `docker compose ps` — все сервисы healthy/running
- [ ] `curl http://localhost:8080/healthz` → `{"status":"ok"}`
- [ ] `curl http://localhost:3001/healthz` → `{"status":"ok"}`
- [ ] `node scripts/diagnose-turn.mjs .env` — TURN работает
- [ ] `node scripts/migrate-status.mjs .env` — все миграции applied
- [ ] `node scripts/backup.mjs .env` — бэкап создан успешно

### Автотесты

- [ ] `pnpm verify` — все валидаторы green, 0 failed
- [ ] `API_TOKEN=$API_TOKEN node scripts/e2e-run-all.mjs` — 5/5 фаз, все шаги passed
- [ ] `pnpm --filter desktop-win exec playwright test` — **22/22** passed
- [ ] `pnpm --filter web-client exec playwright test` — все passed
- [ ] `pnpm --filter admin-web exec playwright test` — все passed
- [ ] `pnpm --filter mobile test` — все passed

### Ручное тестирование

- [ ] Web Client smoke-тест (раздел 11) — все пункты пройдены
- [ ] Desktop Windows smoke-тест (раздел 12) — все пункты пройдены
- [ ] Admin Panel smoke-тест (раздел 13) — все пункты пройдены
- [ ] Mobile smoke-тест (раздел 14) — все пункты пройдены

### Функциональность

- [ ] Регистрация через invite-код работает
- [ ] Текстовый чат — отправка, удаление, real-time через WebSocket
- [ ] Загрузка файлов — presign → upload → confirm → скачивание
- [ ] Голосовой канал — join/mute/unmute/camera/screenshare/leave
- [ ] Голос у двух участников — оба видят друг друга в списке
- [ ] DM — создание диалога, отправка, real-time доставка
- [ ] Поиск — результаты по сообщениям и DM
- [ ] Presence — онлайн/оффлайн статус в реальном времени
- [ ] Admin — управление пользователями, invite, audit log, backup

---

## Быстрый старт (все команды подряд)

```bash
# 1. Генерация конфигов
node scripts/setup.mjs

# 2. Запуск инфраструктуры
docker compose --env-file .env up -d

# 3. Подождать ~30 сек, затем bootstrap
curl -s -X POST http://localhost:8080/api/v1/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"server_name":"OpenSpace Dev","admin_username":"admin","admin_password":"Admin123!","admin_display_name":"Admin"}'

# 4. Получить и экспортировать токен
export API_TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!"}' | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))")
export ADMIN_API_TOKEN=$API_TOKEN

# 5. API e2e
node scripts/e2e-run-all.mjs

# 6. Playwright
pnpm --filter desktop-win exec playwright test --reporter=list
pnpm --filter web-client exec playwright test --reporter=list
pnpm --filter admin-web exec playwright test --reporter=list

# 7. Mobile unit-тесты
pnpm --filter mobile test

# 8. Полная верификация
pnpm verify
```
