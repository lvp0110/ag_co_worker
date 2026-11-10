#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.deploy"

if [ ! -f "$ENV_FILE" ]; then
  echo "✗ $ENV_FILE не найден." >&2
  echo "  Скопируйте: cp deploy/.env.deploy.example deploy/.env.deploy" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${DEPLOY_HOST:?DEPLOY_HOST не задан в deploy/.env.deploy}"
: "${DEPLOY_DIR:?DEPLOY_DIR не задан в deploy/.env.deploy}"
DEPLOY_DOMAIN="${DEPLOY_DOMAIN:-}"
DEPLOY_JUMP_HOST="${DEPLOY_JUMP_HOST:-}"
DEPLOY_REMOTE="${DEPLOY_REMOTE:-origin}"
DEPLOY_REV="${DEPLOY_REV:-origin/main}"

SSH_OPTS=(
  -o BatchMode=yes
  -o ConnectTimeout=15
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=6
  -o ControlMaster=auto
  -o ControlPath="/tmp/.ssh-ag-co-worker-%r@%h:%p"
  -o ControlPersist=5m
)

if [ -n "$DEPLOY_JUMP_HOST" ]; then
  SSH_OPTS+=(-J "$DEPLOY_JUMP_HOST")
fi

ssh_exec() {
  ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" "$@"
}

remote() {
  local cmd="$*"
  ssh_exec "set -e; cd '$DEPLOY_DIR' && $cmd"
}

compose() {
  remote "docker compose --env-file .env.prod -f docker-compose.prod.yml $*"
}

info() { printf '\033[36m→ %s\033[0m\n' "$*"; }
ok() { printf '\033[32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*" >&2; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
