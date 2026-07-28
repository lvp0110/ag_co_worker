#!/usr/bin/env bash
# Роллаут backend-контейнера на сервер. postgres и frontend не трогаем.
#
# Использование:
#   make deploy-backend                     # выкатывает ветку из .env.deploy (origin/main)
#   REV=<commit|tag> make deploy-backend    # откат/выкат конкретной ревизии
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

REV="${REV:-$DEPLOY_REV}"
info "rollout backend на $DEPLOY_HOST: rev=$REV"

remote "git fetch '$DEPLOY_REMOTE' && git checkout '$REV' -- backend/ docker-compose.prod.yml"

info "rebuild backend-образа"
compose "build backend"

info "перезапуск только backend (--no-deps — postgres и frontend не трогаем)"
compose "up -d --no-deps backend"

info "ждём пока healthcheck стабилизируется (~15s)"
sleep 15
compose "ps backend"

info "последние 50 строк лога backend:"
compose "logs --tail=50 backend"

if [ -n "$DEPLOY_DOMAIN" ]; then
  info "проверка /health через nginx"
  curl -fs --retry 3 "https://$DEPLOY_DOMAIN/health" && echo || warn "/health не отвечает"
fi

ok "backend выкачен"
