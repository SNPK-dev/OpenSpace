#!/usr/bin/env bash
# OpenSpace Server — Production Deploy Script
#
# Usage (fresh Ubuntu/Debian VPS):
#
#   Option A — запустить из клонированного репозитория:
#     git clone https://github.com/SNPK-dev/OpenSpace.git /opt/openspace
#     cd /opt/openspace
#     sudo bash scripts/deploy.sh --domain chat.example.com --email ops@example.com
#
#   Option B — клонировать автоматически:
#     sudo bash scripts/deploy.sh \
#       --domain chat.example.com --email ops@example.com \
#       --clone-from https://github.com/SNPK-dev/OpenSpace.git
#
# Флаги:
#   --domain      <host>   Домен (обязательно для TLS)
#   --email       <addr>   Email для Let's Encrypt
#   --dir         <path>   Директория установки (по умолчанию: /opt/openspace)
#   --clone-from  <url>    URL git-репозитория — скрипт клонирует его в --dir
#   --non-interactive      Без интерактивных вопросов (требует --domain и --email)
#   --skip-docker          Не устанавливать Docker
#   --skip-node            Не устанавливать Node.js

set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[openspace]${NC} $*"; }
info() { echo -e "${BLUE}[info]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
die()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# ── Argument parsing ──────────────────────────────────────────────────────────
DOMAIN=""
EMAIL=""
INSTALL_DIR="/opt/openspace"
CLONE_FROM=""
NON_INTERACTIVE=false
SKIP_DOCKER=false
SKIP_NODE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --domain)          DOMAIN="$2"; shift 2 ;;
    --email)           EMAIL="$2";  shift 2 ;;
    --dir)             INSTALL_DIR="$2"; shift 2 ;;
    --clone-from)      CLONE_FROM="$2"; shift 2 ;;
    --non-interactive) NON_INTERACTIVE=true; shift ;;
    --skip-docker)     SKIP_DOCKER=true; shift ;;
    --skip-node)       SKIP_NODE=true; shift ;;
    *) die "Неизвестный аргумент: $1" ;;
  esac
done

# ── Root check ────────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  die "Скрипт должен запускаться от root. Попробуйте: sudo bash $0 $*"
fi

# ── OS detection ──────────────────────────────────────────────────────────────
if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID="${ID:-unknown}"
  OS_VERSION="${VERSION_ID:-}"
else
  die "Не удалось определить OS. Файл /etc/os-release не найден."
fi

case $OS_ID in
  ubuntu|debian|linuxmint) PKG_MGR="apt" ;;
  centos|rhel|rocky|almalinux|fedora) PKG_MGR="dnf" ;;
  *) warn "Неподдерживаемая ОС: $OS_ID. Продолжаем — возможно придётся установить зависимости вручную."; PKG_MGR="unknown" ;;
esac

# ── Interactive prompts ───────────────────────────────────────────────────────
if [[ $NON_INTERACTIVE == false ]]; then
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}  OpenSpace — Server Deploy${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  if [[ -z "$DOMAIN" ]]; then
    read -rp "Домен (например, chat.example.com): " DOMAIN
    [[ -z "$DOMAIN" ]] && die "Домен обязателен."
  fi

  if [[ -z "$EMAIL" ]]; then
    read -rp "Email для TLS-сертификата (например, ops@example.com): " EMAIL
    [[ -z "$EMAIL" ]] && die "Email обязателен."
  fi

  read -rp "Директория установки [$INSTALL_DIR]: " INPUT_DIR
  [[ -n "$INPUT_DIR" ]] && INSTALL_DIR="$INPUT_DIR"
fi

[[ -z "$DOMAIN" ]] && die "--domain обязателен в неинтерактивном режиме."
[[ -z "$EMAIL" ]]  && die "--email обязателен в неинтерактивном режиме."

log "Deploy: domain=$DOMAIN  email=$EMAIL  dir=$INSTALL_DIR"
echo ""

# ── Install Docker ────────────────────────────────────────────────────────────
install_docker_apt() {
  log "Устанавливаем Docker через apt..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${OS_ID}/gpg" \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  # shellcheck disable=SC1091
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/${OS_ID} $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | tee /etc/apt/sources.list.d/docker.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
}

install_docker_dnf() {
  log "Устанавливаем Docker через dnf..."
  dnf install -y docker docker-compose-plugin
  systemctl enable --now docker
}

if [[ $SKIP_DOCKER == false ]]; then
  if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
    log "Docker уже установлен: $(docker --version | head -1)"
  else
    case $PKG_MGR in
      apt) install_docker_apt ;;
      dnf) install_docker_dnf ;;
      *) die "Не могу установить Docker автоматически на $OS_ID. Установите вручную: https://docs.docker.com/engine/install/" ;;
    esac
    log "Docker установлен: $(docker --version | head -1)"
  fi
fi

# ── Install Node.js ───────────────────────────────────────────────────────────
install_node() {
  log "Устанавливаем Node.js 22..."
  case $PKG_MGR in
    apt)
      curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
      apt-get install -y -qq nodejs
      ;;
    dnf)
      curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
      dnf install -y nodejs
      ;;
    *)
      die "Не могу установить Node.js автоматически на $OS_ID. Установите Node.js 22.13+ вручную: https://nodejs.org/"
      ;;
  esac
  log "Node.js установлен: $(node --version)"
}

if [[ $SKIP_NODE == false ]]; then
  if command -v node &>/dev/null; then
    NODE_MAJOR=$(node --version | cut -d. -f1 | tr -d 'v')
    NODE_MINOR=$(node --version | cut -d. -f2)
    if [[ $NODE_MAJOR -gt 22 || ( $NODE_MAJOR -eq 22 && $NODE_MINOR -ge 13 ) ]]; then
      log "Node.js уже установлен: $(node --version)"
    else
      warn "Node.js $(node --version) слишком старый (нужен 22.13+). Обновляем..."
      install_node
    fi
  else
    install_node
  fi
fi

# ── Locate or clone OpenSpace source ─────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd 2>/dev/null || echo "")"

# Если передан --clone-from, клонируем репозиторий в INSTALL_DIR
if [[ -n "$CLONE_FROM" ]]; then
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    log "Репозиторий уже клонирован в $INSTALL_DIR, обновляем..."
    git -C "$INSTALL_DIR" pull --ff-only || warn "git pull не удался, продолжаем с текущей версией"
  elif [[ -d "$INSTALL_DIR" && -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]]; then
    # Директория не пуста — клонируем рядом, потом переносим
    TMP_CLONE=$(mktemp -d)
    log "Клонируем $CLONE_FROM в $TMP_CLONE ..."
    git clone "$CLONE_FROM" "$TMP_CLONE/openspace"
    # Переносим всё кроме .env (если он уже есть)
    rsync -a --exclude='.env' "$TMP_CLONE/openspace/" "$INSTALL_DIR/"
    rm -rf "$TMP_CLONE"
  else
    log "Клонируем $CLONE_FROM в $INSTALL_DIR ..."
    git clone "$CLONE_FROM" "$INSTALL_DIR"
  fi
  SRC_DIR="$INSTALL_DIR"

elif [[ -f "$REPO_ROOT/docker-compose.yml" && -f "$REPO_ROOT/.env.example" ]]; then
  SRC_DIR="$REPO_ROOT"
  log "Используем исходники из: $SRC_DIR"

else
  die "Не могу найти файлы OpenSpace (docker-compose.yml / .env.example).
  Запустите скрипт из корня репозитория, или передайте --clone-from <url>:
    sudo bash scripts/deploy.sh --domain $DOMAIN --email $EMAIL \\
      --clone-from https://github.com/SNPK-dev/OpenSpace.git"
fi

# ── Copy or verify source files ───────────────────────────────────────────────
if [[ "$SRC_DIR" != "$INSTALL_DIR" ]]; then
  log "Копируем файлы в $INSTALL_DIR ..."
  mkdir -p "$INSTALL_DIR"
  # Полный набор файлов, нужных для Docker-сборки и работы
  for item in \
    docker-compose.yml docker-compose.prod.yml .env.example \
    infra scripts INSTALL.md \
    apps packages tsconfig.base.json pnpm-workspace.yaml package.json; do
    if [[ -e "$SRC_DIR/$item" ]]; then
      cp -r "$SRC_DIR/$item" "$INSTALL_DIR/"
    fi
  done
fi

# ── Verify required build context exists ─────────────────────────────────────
if [[ ! -d "$INSTALL_DIR/apps" ]]; then
  die "Директория apps/ не найдена в $INSTALL_DIR.

  Docker Compose собирает образы из исходного кода и для этого нужна вся кодовая база.

  Вариант 1 — клонировать репозиторий целиком:
    git clone https://github.com/SNPK-dev/OpenSpace.git /tmp/openspace-src
    cp -r /tmp/openspace-src/apps          $INSTALL_DIR/
    cp -r /tmp/openspace-src/packages      $INSTALL_DIR/
    cp    /tmp/openspace-src/tsconfig.base.json $INSTALL_DIR/
    cp    /tmp/openspace-src/pnpm-workspace.yaml $INSTALL_DIR/
    cp    /tmp/openspace-src/package.json  $INSTALL_DIR/
    sudo bash $INSTALL_DIR/scripts/deploy.sh --domain $DOMAIN --email $EMAIL --dir $INSTALL_DIR

  Вариант 2 — передать --clone-from и скрипт сделает это сам:
    sudo bash scripts/deploy.sh \\
      --domain $DOMAIN --email $EMAIL \\
      --clone-from https://github.com/SNPK-dev/OpenSpace.git"
fi

cd "$INSTALL_DIR"
log "Рабочая директория: $(pwd)"

# ── Run setup ─────────────────────────────────────────────────────────────────
if [[ -f .env ]]; then
  warn ".env уже существует. Пропускаем setup, сохраняем текущую конфигурацию."
  warn "Для перегенерации: node scripts/setup.mjs --force --domain $DOMAIN --admin-email $EMAIL"
else
  log "Запускаем setup..."
  node scripts/setup.mjs \
    --non-interactive \
    --domain "$DOMAIN" \
    --admin-email "$EMAIL"
fi

chmod 600 .env
log ".env защищён (chmod 600)"

# ── Firewall reminder ─────────────────────────────────────────────────────────
echo ""
info "Необходимые открытые порты:"
info "  TCP  80    — HTTP (ACME challenge для Let's Encrypt)"
info "  TCP  443   — HTTPS"
info "  TCP  3478  — TURN"
info "  UDP  3478  — TURN/UDP"
info "  TCP  5349  — TURNS/TLS"
info "  UDP  5349  — TURNS/DTLS"
info "  TCP  7881  — LiveKit TCP relay"
info "  UDP  7882  — LiveKit WebRTC media"
info "  UDP  50000-50100 — TURN relay ports"
echo ""

# ── Start services ────────────────────────────────────────────────────────────
log "Запускаем сервисы..."
docker compose -f docker-compose.prod.yml --env-file .env pull --quiet
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

# ── Wait for health ───────────────────────────────────────────────────────────
log "Ждём запуска API (до 120 секунд)..."
HEALTH_URL="https://${DOMAIN}/healthz"
DEADLINE=$((SECONDS + 120))
STATUS=""
while [[ $SECONDS -lt $DEADLINE ]]; do
  STATUS=$(curl -sk -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || true)
  if [[ "$STATUS" == "200" ]]; then
    log "API работает ✓"
    break
  fi
  sleep 5
done

if [[ "$STATUS" != "200" ]]; then
  warn "Health check не прошёл (статус: $STATUS)."
  warn "Проверьте состояние: docker compose -f docker-compose.prod.yml ps"
  warn "Проверьте логи: docker compose -f docker-compose.prod.yml logs -f"
  exit 1
fi

# ── Setup daily backup cron ───────────────────────────────────────────────────
CRON_JOB="0 3 * * * cd $INSTALL_DIR && node scripts/backup.mjs .env >> /var/log/openspace-backup.log 2>&1"
if ! crontab -l 2>/dev/null | grep -q "openspace-backup"; then
  (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
  log "Ежедневный бэкап зарегистрирован (каждый день в 3:00)"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  OpenSpace успешно развёрнут!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Веб-клиент:   ${BLUE}https://${DOMAIN}${NC}"
echo -e "  Админ-панель: ${BLUE}https://${DOMAIN}/admin${NC}"
echo ""
echo "  Следующие шаги:"
echo "  1. Откройте https://${DOMAIN}/admin и завершите первичную настройку"
echo "  2. Поделитесь ссылкой https://${DOMAIN} с участниками сообщества"
echo "  3. Бэкапы запускаются каждый день в 3:00 — лог: /var/log/openspace-backup.log"
echo ""
echo "  Управление сервисами:"
echo "    docker compose -f $INSTALL_DIR/docker-compose.prod.yml logs -f"
echo ""
