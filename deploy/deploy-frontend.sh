#!/usr/bin/env bash
# Роллаут frontend: локальный vite build → rsync dist на сервер.
# Контейнер frontend НЕ перезапускается — он читает dist/ через bind-mount,
# express.static отдаёт новые файлы при следующем запросе. Zero downtime.
#
# Когда меняется server.js или package.prod.json — передайте REBUILD=1, тогда
# скрипт дополнительно rebuild'ит frontend-контейнер.
#
# Использование:
#   make deploy-frontend
#   REBUILD=1 make deploy-frontend
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

REBUILD="${REBUILD:-0}"

info "vite build (локально)"
cd "$REPO_ROOT/frontend"
# VITE_API_URL="" → в проде apiClient.js будет бить по относительному /api/*,
# который обработает host nginx → frontend-container → proxy на backend.
VITE_API_URL="" npm run build
cd "$REPO_ROOT"

info "rsync frontend/dist → $DEPLOY_HOST:$DEPLOY_DIR/frontend/dist/"
# --delete чтобы старые хешированные бандлы не копились вечно.
rsync -az --delete \
  -e "ssh ${SSH_OPTS[*]}" \
  "$REPO_ROOT/frontend/dist/" \
  "$DEPLOY_HOST:$DEPLOY_DIR/frontend/dist/"

if [ "$REBUILD" = "1" ]; then
  info "REBUILD=1 → пересобираем frontend-контейнер"
  # Сначала обновить server.js / package.prod.json / Dockerfile из git
  remote "git fetch '$DEPLOY_REMOTE' && git checkout '$DEPLOY_REV' -- frontend/ docker-compose.prod.yml"
  compose "build frontend"
  compose "up -d --no-deps frontend"
fi

if [ -n "$DEPLOY_DOMAIN" ]; then
  info "smoke https://$DEPLOY_DOMAIN/"
  curl -fso /dev/null --retry 3 "https://$DEPLOY_DOMAIN/" && ok "фронт отвечает" || warn "фронт не отвечает"
fi

ok "frontend выкачен"
