#!/usr/bin/env bash
# Общие функции для deploy-скриптов. Source'ится в начале каждого скрипта.

set -euo pipefail

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

# Единственный сервис проекта: статика + прокси в ConstrTodo.
FRONTEND_UNIT="${FRONTEND_UNIT:-ag-co-worker-frontend}"

# Используем одну shared-сессию ssh вместо многоразовых коннектов — быстрее и
# меньше шума в authlog.
SSH_OPTS=(-o ControlMaster=auto -o ControlPath="/tmp/.ssh-ag_co_worker-%r@%h:%p" -o ControlPersist=5m)

ssh_exec() {
  ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" "$@"
}

# Выполнить команды на сервере В ДИРЕКТОРИИ проекта. Передаётся единой строкой.
remote() {
  local cmd="$*"
  ssh_exec "set -e; cd '$DEPLOY_DIR' && $cmd"
}

# systemd helpers (нужен sudo без пароля для systemctl этих юнитов).
svc() {
  remote "sudo systemctl $*"
}

info() { echo -e "\033[36m→ $*\033[0m"; }
ok()   { echo -e "\033[32m✓ $*\033[0m"; }
warn() { echo -e "\033[33m! $*\033[0m" >&2; }
fail() { echo -e "\033[31m✗ $*\033[0m" >&2; exit 1; }
