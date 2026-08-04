#!/usr/bin/env bash
# Роллаут frontend (Docker): vite build происходит НА СЕРВЕРЕ внутри образа.
#
# Отличие от прежней схемы (локальный vite build + rsync dist): локальный Node
# больше не нужен, а хостовой Node 18 (слишком старый для vite 7) не участвует —
# сборка идёт в образе на Node 22.
#
# Использование:
#   make deploy-frontend
#   REV=<commit|tag> make deploy-frontend
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

REV="${REV:-$DEPLOY_REV}"
info "rollout frontend на $DEPLOY_HOST: rev=$REV"

remote "git fetch '$DEPLOY_REMOTE' && git checkout '$REV' -- frontend/ docker-compose.prod.yml"

info "build + up frontend (vite build внутри образа)"
dc "up -d --build frontend"

info "ждём health"
wait_health 30 || warn "frontend не поднялся — смотрите make deploy-logs"

info "последние 40 строк логов frontend:"
dc "logs --tail 40 --no-log-prefix frontend" || true

if [ -n "$DEPLOY_DOMAIN" ]; then
  info "smoke https://$DEPLOY_DOMAIN/"
  curl -fsS -o /dev/null --retry 3 --retry-delay 2 -w "  HTTP %{http_code}\n" "https://$DEPLOY_DOMAIN/" \
    && ok "фронт отвечает через домен" \
    || warn "через домен не отвечает — проверьте nginx server block"
fi

ok "frontend выкачен"
