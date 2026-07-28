#!/usr/bin/env bash
# Первый запуск на чистой машине.
# Предварительные требования (делаются вручную оператором):
#   1. Docker + docker compose plugin установлены.
#   2. `apt install nginx` + certbot + сертификат получен в /etc/letsencrypt/live/<domain>/.
#   3. Конфиг nginx положен и активирован (см. deploy/nginx/ag_co_worker.conf и deploy/README.md).
#   4. На сервере существует пользователь из DEPLOY_HOST с правом на docker и $DEPLOY_DIR.
#   5. Переменные DEPLOY_HOST / DEPLOY_DIR / DEPLOY_DOMAIN заданы в deploy/.env.deploy.
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

REPO_URL="${REPO_URL:-}"
if [ -z "$REPO_URL" ]; then
  REPO_URL="$(git -C "$REPO_ROOT" remote get-url "$DEPLOY_REMOTE" 2>/dev/null || true)"
fi
[ -n "$REPO_URL" ] || fail "Не удалось определить URL репозитория (задайте REPO_URL=... или настройте remote '$DEPLOY_REMOTE')."

info "checkout репо на сервер: $REPO_URL → $DEPLOY_DIR"
ssh_exec "
  set -e
  if [ ! -d '$DEPLOY_DIR/.git' ]; then
    mkdir -p '$(dirname "$DEPLOY_DIR")'
    git clone '$REPO_URL' '$DEPLOY_DIR'
  else
    cd '$DEPLOY_DIR' && git fetch --all
  fi
  cd '$DEPLOY_DIR' && git checkout '$DEPLOY_REV'
"
ok "репо на сервере"

info "проверка предварительных условий на сервере"
remote '
  test -f .env.prod || { echo "✗ '"'"'.env.prod'"'"' нет рядом с docker-compose.prod.yml. Скопируйте deploy/.env.prod.example → .env.prod и заполните."; exit 1; }
  command -v nginx >/dev/null 2>&1 || { echo "✗ nginx не установлен. sudo apt install nginx"; exit 1; }
  ls /etc/nginx/sites-enabled/ag_co_worker.conf >/dev/null 2>&1 || { echo "✗ /etc/nginx/sites-enabled/ag_co_worker.conf не активирован. См. deploy/README.md."; exit 1; }
  sudo nginx -t 2>&1
  command -v docker >/dev/null 2>&1 || { echo "✗ docker не установлен"; exit 1; }
  docker compose version >/dev/null 2>&1 || { echo "✗ docker compose plugin не установлен"; exit 1; }
'
ok "предусловия выполнены"

info "поднимаем postgres + backend"
compose "up -d postgres backend"

info "применяем первые миграции"
compose "run --rm backend npx prisma migrate deploy"

info "поднимаем frontend (для первого запуска ожидаем rsync dist/ уже на хосте — иначе статика пустая)"
remote 'test -d frontend/dist || { echo "! frontend/dist нет. После bootstrap сделайте make deploy-frontend."; mkdir -p frontend/dist; }'
compose "up -d frontend"

if [ -n "$DEPLOY_DOMAIN" ]; then
  info "smoke-check https://$DEPLOY_DOMAIN/health"
  # --fail-with-body чтобы увидеть тело при 5xx, --retry на случай медленного старта.
  curl -fs --retry 5 --retry-delay 2 "https://$DEPLOY_DOMAIN/health" || warn "health не отвечает — смотрите логи nginx и docker"
fi

ok "bootstrap завершён. Дальше: make deploy-frontend (вылить статику)."
