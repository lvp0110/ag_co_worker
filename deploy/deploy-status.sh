#!/usr/bin/env bash
# Состояние прод-стека: systemd units + health через nginx.
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

info "systemd status:"
remote "systemctl is-active '$BACKEND_UNIT' '$FRONTEND_UNIT' || true"
remote "systemctl status '$BACKEND_UNIT' '$FRONTEND_UNIT' --no-pager -l | head -n 40" || true

info "listen ports (3006 backend, 3008 frontend):"
remote "ss -ltnp | grep -E ':3006|:3008' || true"

if [ -n "$DEPLOY_DOMAIN" ]; then
  info "health https://$DEPLOY_DOMAIN/health"
  curl -fs -w "  HTTP %{http_code}\n" "https://$DEPLOY_DOMAIN/health" || true
fi
