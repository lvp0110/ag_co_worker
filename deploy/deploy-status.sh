#!/usr/bin/env bash
# Состояние прод-стека: контейнеры + здоровье приложения через nginx.
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

info "docker compose ps:"
compose "ps"

info "версии образов:"
compose "images"

if [ -n "$DEPLOY_DOMAIN" ]; then
  info "health https://$DEPLOY_DOMAIN/health"
  curl -fs -w "  HTTP %{http_code}\n" "https://$DEPLOY_DOMAIN/health" || true
fi
