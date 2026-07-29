#!/usr/bin/env bash
# Роллаут frontend: локальный vite build → rsync dist на сервер.
# Процесс frontend НЕ перезапускается — express.static читает новые файлы
# при следующем запросе (zero downtime для статики).
#
# Когда меняется server.js / зависимости прокси — REBUILD=1:
#   git checkout frontend/ + npm ci --omit=dev + systemctl restart frontend.
#
# Использование:
#   make deploy-frontend
#   REBUILD=1 make deploy-frontend
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

REBUILD="${REBUILD:-0}"

info "vite build (локально)"
cd "$REPO_ROOT/frontend"
# VITE_API_URL="" → в проде apiClient.js бьёт по относительному /api/*
# (nginx → frontend server.js → backend).
VITE_API_URL="" npm run build
cd "$REPO_ROOT"

info "rsync frontend/dist → $DEPLOY_HOST:$DEPLOY_DIR/frontend/dist/"
rsync -az --delete \
  -e "ssh ${SSH_OPTS[*]}" \
  "$REPO_ROOT/frontend/dist/" \
  "$DEPLOY_HOST:$DEPLOY_DIR/frontend/dist/"

if [ "$REBUILD" = "1" ]; then
  info "REBUILD=1 → обновляем server.js + prod deps, restart $FRONTEND_UNIT"
  remote "git fetch '$DEPLOY_REMOTE' && git checkout '$DEPLOY_REV' -- frontend/"
  remote "cd frontend && npm ci --omit=dev"
  svc "restart $FRONTEND_UNIT"
  sleep 3
  svc "is-active $FRONTEND_UNIT" || warn "$FRONTEND_UNIT не active"
fi

if [ -n "$DEPLOY_DOMAIN" ]; then
  info "smoke https://$DEPLOY_DOMAIN/"
  curl -fso /dev/null --retry 3 "https://$DEPLOY_DOMAIN/" && ok "фронт отвечает" || warn "фронт не отвечает"
fi

ok "frontend выкачен"
