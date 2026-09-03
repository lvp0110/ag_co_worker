#!/usr/bin/env bash
# Состояние прода: systemd unit + health через nginx + доступность upstream.
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

info "systemd status:"
remote "systemctl is-active '$FRONTEND_UNIT' || true"
remote "systemctl status '$FRONTEND_UNIT' --no-pager -l | head -n 40" || true

info "listen port (3008 frontend):"
remote "ss -ltnp | grep ':3008' || true"

# Прокси бесполезен, если сеть до ConstrTodo не работает. Адрес берём из того же
# .env.prod, что читает server.js.
info "upstream (UPSTREAM_URL / AUTH_SERVICE_URL из .env.prod):"
remote '
  set -a; . ./.env.prod; set +a
  URL="${UPSTREAM_URL:-${AUTH_SERVICE_URL:-}}"
  if [ -z "$URL" ]; then
    echo "! ни UPSTREAM_URL, ни AUTH_SERVICE_URL не заданы в .env.prod"
    exit 0
  fi
  echo "  $URL"
  curl -s -o /dev/null -w "  GET /auth/session → HTTP %{http_code}\n" --max-time 10 "${URL%/}/auth/session" \
    || echo "  ! upstream недостижим"
'

if [ -n "$DEPLOY_DOMAIN" ]; then
  info "health https://$DEPLOY_DOMAIN/health"
  curl -fs -w "  HTTP %{http_code}\n" "https://$DEPLOY_DOMAIN/health" || true
fi
