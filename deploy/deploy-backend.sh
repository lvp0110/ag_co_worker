#!/usr/bin/env bash
# Роллаут backend на сервер (systemd). Frontend не трогаем.
#
# Использование:
#   make deploy-backend                     # выкатывает ветку из .env.deploy (origin/main)
#   REV=<commit|tag> make deploy-backend    # откат/выкат конкретной ревизии
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

REV="${REV:-$DEPLOY_REV}"
info "rollout backend на $DEPLOY_HOST: rev=$REV"

remote "git fetch '$DEPLOY_REMOTE' && git checkout '$REV' -- backend/"

info "npm ci + build backend"
remote "cd backend && npm ci && npm run build"

info "restart $BACKEND_UNIT"
svc "restart $BACKEND_UNIT"

info "ждём health (~5s)"
sleep 5
svc "is-active $BACKEND_UNIT" || warn "$BACKEND_UNIT не active"
remote "curl -fsS -o /dev/null http://127.0.0.1:3006/health && echo 'backend /health OK'" \
  || warn "backend /health не отвечает"

info "последние 40 строк journal:"
remote "sudo journalctl -u '$BACKEND_UNIT' -n 40 --no-pager" || true

ok "backend выкачен"
