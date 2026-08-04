#!/usr/bin/env bash
# Общие функции для deploy-скриптов. Source'ится в начале каждого скрипта.
#
# Прод — Docker Compose на webtest (51.250.51.86). Сборка идёт НА СЕРВЕРЕ:
# `docker compose build` тянет Node 22 внутрь образа, поэтому старый хостовой
# Node 18 не мешает, и локальный Node для деплоя не нужен вообще.
# leonidl в группе docker → sudo для docker НЕ требуется.

set -euo pipefail

# Логгеры определяем ПЕРВЫМИ — ими пользуются проверки ниже в этом же файле.
info() { echo -e "\033[36m→ $*\033[0m"; }
ok()   { echo -e "\033[32m✓ $*\033[0m"; }
warn() { echo -e "\033[33m! $*\033[0m" >&2; }
fail() { echo -e "\033[31m✗ $*\033[0m" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.deploy"

if [ ! -f "$ENV_FILE" ]; then
  echo "✗ $ENV_FILE не найден." >&2
  echo "  Скопируйте шаблон:  cp deploy/.env.deploy.example deploy/.env.deploy" >&2
  echo "  Заполните DEPLOY_HOST / DEPLOY_DIR / DEPLOY_DOMAIN." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${DEPLOY_HOST:?DEPLOY_HOST не задан в deploy/.env.deploy}"
: "${DEPLOY_DIR:?DEPLOY_DIR не задан в deploy/.env.deploy}"
DEPLOY_DOMAIN="${DEPLOY_DOMAIN:-}"
DEPLOY_REMOTE="${DEPLOY_REMOTE:-origin}"
DEPLOY_REV="${DEPLOY_REV:-origin/main}"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
# Host-порт, на который смотрит nginx (см. docker-compose.prod.yml и
# deploy/nginx/ag_co_worker.conf). У backend host-порта нет вовсе — он живёт
# только в compose-сети, поэтому занятый на хосте 3006 (cad-api) не мешает.
FRONTEND_HOST_PORT="${FRONTEND_HOST_PORT:-3007}"

# Одна shared-сессия ssh вместо многих коннектов — быстрее и меньше шума в authlog.
SSH_OPTS=(-o ControlMaster=auto -o ControlPath="/tmp/.ssh-ag_co_worker-%r@%h:%p" -o ControlPersist=5m)

# Явный приватный ключ (необязательно). Нужен локально, если у DEPLOY_HOST нет
# IdentityFile в ~/.ssh/config. В CI не задаётся: там ключ лежит в дефолтном
# ~/.ssh/id_ed25519 (его пишет workflow из секрета DEPLOY_SSH_KEY).
DEPLOY_SSH_KEY_FILE="${DEPLOY_SSH_KEY_FILE:-}"
if [ -n "$DEPLOY_SSH_KEY_FILE" ]; then
  # eval для раскрытия ~ в пути из .env.deploy.
  eval "DEPLOY_SSH_KEY_FILE=$DEPLOY_SSH_KEY_FILE"
  [ -f "$DEPLOY_SSH_KEY_FILE" ] || fail "DEPLOY_SSH_KEY_FILE=$DEPLOY_SSH_KEY_FILE — файл не найден"
  SSH_OPTS+=(-o IdentitiesOnly=yes -i "$DEPLOY_SSH_KEY_FILE")
fi

ssh_exec() {
  ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" "$@"
}

# Для команд с sudo. Если есть локальный TTY — выделяем его на той стороне (-t),
# иначе sudo не сможет запросить пароль и упадёт с
# «sudo: a terminal is required to read the password».
# В CI (без TTY) -t не добавляем: там sudo обязан быть NOPASSWD.
ssh_sudo() {
  if [ -t 0 ] && [ -t 1 ]; then
    # ControlMaster с -t не дружит — для интерактивной сессии идём напрямую.
    ssh -t ${DEPLOY_SSH_KEY_FILE:+-o IdentitiesOnly=yes -i "$DEPLOY_SSH_KEY_FILE"} \
      "$DEPLOY_HOST" "$@"
  else
    ssh_exec "$@"
  fi
}

# Выполнить команды на сервере В ДИРЕКТОРИИ проекта. Передаётся единой строкой.
remote() {
  local cmd="$*"
  ssh_exec "set -e; cd '$DEPLOY_DIR' && $cmd"
}

# docker compose на сервере.
dc() {
  remote "docker compose -f '$COMPOSE_FILE' $*"
}

# Дождаться, пока фронт начнёт отвечать на host-порту. $1 — число попыток (×2s).
wait_health() {
  local tries="${1:-20}" i
  for ((i = 1; i <= tries; i++)); do
    if remote "curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:$FRONTEND_HOST_PORT/__front_health" 2>/dev/null; then
      ok "frontend отвечает на 127.0.0.1:$FRONTEND_HOST_PORT"
      return 0
    fi
    sleep 2
  done
  warn "frontend не ответил за $((tries * 2))s"
  return 1
}

# Проверить, что backend жив ИЗ frontend-контейнера (backend наружу не смотрит).
check_backend() {
  if dc "exec -T frontend node -e \
    \"fetch('http://backend:3006/health').then(r=>{console.log('backend /health',r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e.message);process.exit(1)})\""; then
    ok "backend /health OK (через compose-сеть)"
    return 0
  fi
  warn "backend /health не отвечает"
  return 1
}

# ─── маркеры выкаченных ревизий ─────────────────────────────────────────────
# Роллаут делает `git checkout <rev> -- <paths>`: файлы обновляются, а HEAD
# остаётся на месте. Поэтому `git log -1` на сервере НЕ показывает выкаченное.
# Каждый сервис пишет свою ревизию в отдельный маркер — backend и frontend
# сознательно могут стоять на разных ревизиях.

# mark_deployed <service> <rev>
mark_deployed() {
  local service="$1" rev="$2"
  remote "printf '%s\t%s\t%s\n' \
    \"\$(git rev-parse --short '$rev')\" \
    \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" \
    \"\$(git log -1 --format=%s '$rev')\" > '.deployed-$service'"
}

show_deployed() {
  local svc line
  for svc in backend frontend; do
    line="$(remote "cat '.deployed-$svc' 2>/dev/null || true" 2>/dev/null || true)"
    if [ -n "$line" ]; then
      printf '  %-9s %s\n' "$svc" "$line"
    else
      printf '  %-9s маркера нет (роллаут этим скриптом ещё не делался)\n' "$svc"
    fi
  done
}
