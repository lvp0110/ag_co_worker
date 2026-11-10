#!/usr/bin/env bash
# Первый запуск frontend на prodfront. Gateway и ConstrTodo не изменяются.
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

REV="${REV:-$DEPLOY_REV}"
REPO_URL="${REPO_URL:-}"
if [ -z "$REPO_URL" ]; then
  REPO_URL="$(git -C "$REPO_ROOT" remote get-url "$DEPLOY_REMOTE" 2>/dev/null || true)"
fi
[ -n "$REPO_URL" ] || fail "Не удалось определить URL репозитория."

info "checkout репозитория: $REPO_URL → $DEPLOY_HOST:$DEPLOY_DIR"
ssh_exec "
  set -e
  if [ ! -d '$DEPLOY_DIR/.git' ]; then
    mkdir -p '$(dirname "$DEPLOY_DIR")'
    git clone '$REPO_URL' '$DEPLOY_DIR'
  fi
  cd '$DEPLOY_DIR'
  git fetch '$DEPLOY_REMOTE'
  git checkout --detach '$REV'
"
ok "репозиторий готов: $REV"

info "проверка production-конфигурации"
remote '
  command -v docker >/dev/null 2>&1 || { echo "✗ docker не установлен"; exit 1; }
  docker compose version >/dev/null 2>&1 || { echo "✗ docker compose plugin не установлен"; exit 1; }
  docker info >/dev/null 2>&1 || { echo "✗ нет доступа к Docker без sudo"; exit 1; }

  if [ ! -f .env.prod ]; then
    cp deploy/.env.prod.example .env.prod
    chmod 600 .env.prod
    echo "✗ Создан шаблон .env.prod. Заполните его на prodfront и повторите make deploy-bootstrap."
    exit 1
  fi

  docker compose --env-file .env.prod -f docker-compose.prod.yml config --quiet
'
ok "production-конфигурация корректна"

bash "$SCRIPT_DIR/deploy-frontend.sh"
ok "bootstrap frontend завершён"
