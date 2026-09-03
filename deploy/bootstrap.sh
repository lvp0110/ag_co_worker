#!/usr/bin/env bash
# Первый запуск на чистой машине (без Docker).
# В стеке один сервис — frontend: статика + прокси в ConstrTodo (UPSTREAM_URL).
# Предварительные требования (вручную):
#   1. Node.js ≥ 20 (node + npm в PATH для user deploy).
#   2. nginx + certbot, сертификат в /etc/letsencrypt/live/<domain>/.
#   3. Конфиг nginx активирован (deploy/nginx/ag_co_worker.conf).
#   4. Пользователь DEPLOY_HOST с правом на DEPLOY_DIR и passwordless sudo
#      для systemctl/journalctl по юнитам ag-co-worker-*.
#   5. deploy/.env.deploy заполнен; на сервере .env.prod рядом с репо.
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
  test -f .env.prod || { echo "✗ '"'"'.env.prod'"'"' нет в корне checkout'"'"'а. Скопируйте deploy/.env.prod.example → .env.prod и заполните."; exit 1; }
  command -v node >/dev/null 2>&1 || { echo "✗ node не установлен (нужен ≥20)"; exit 1; }
  command -v npm >/dev/null 2>&1 || { echo "✗ npm не установлен"; exit 1; }
  command -v nginx >/dev/null 2>&1 || { echo "✗ nginx не установлен. sudo apt install nginx"; exit 1; }
  ls /etc/nginx/sites-enabled/ag_co_worker.conf >/dev/null 2>&1 || { echo "✗ /etc/nginx/sites-enabled/ag_co_worker.conf не активирован. См. deploy/README.md."; exit 1; }
  sudo nginx -t 2>&1
  node -v
'
ok "предусловия выполнены"

info "ставим systemd unit"
# Подставляем реальный DEPLOY_DIR в unit-файл (шаблон содержит /srv/ag_co_worker).
ssh_exec "
  set -e
  sed 's|/srv/ag_co_worker|$DEPLOY_DIR|g' '$DEPLOY_DIR/deploy/systemd/ag-co-worker-frontend.service' \
    | sudo tee /etc/systemd/system/$FRONTEND_UNIT.service >/dev/null
  sudo systemctl daemon-reload
"

info "prod-deps frontend (server.js)"
remote "mkdir -p frontend/dist && cd frontend && npm ci --omit=dev"

info "включаем и запускаем сервис"
svc "enable --now $FRONTEND_UNIT"
sleep 3
svc "is-active $FRONTEND_UNIT"

if [ -n "$DEPLOY_DOMAIN" ]; then
  info "smoke-check https://$DEPLOY_DOMAIN/health"
  curl -fs --retry 5 --retry-delay 2 "https://$DEPLOY_DOMAIN/health" \
    || warn "health не отвечает — смотрите nginx и journalctl -u $FRONTEND_UNIT"
fi

ok "bootstrap завершён. Дальше: make deploy-frontend (вылить статику)."
