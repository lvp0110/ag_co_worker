#!/usr/bin/env bash
# Логи прод-контейнеров.
#
# Использование:
#   make deploy-logs                       # последние 100 строк обоих сервисов
#   SERVICE=backend make deploy-logs       # только backend
#   TAIL=500 make deploy-logs              # больше строк
#   FOLLOW=1 make deploy-logs              # follow (Ctrl-C для выхода)
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

SERVICE="${SERVICE:-}"
TAIL="${TAIL:-100}"
FOLLOW="${FOLLOW:-0}"

ARGS="logs --tail $TAIL"
[ "$FOLLOW" = "1" ] && ARGS="$ARGS -f"
[ -n "$SERVICE" ] && ARGS="$ARGS $SERVICE"

info "docker compose $ARGS"
if [ "$FOLLOW" = "1" ]; then
  # -f нуждается в tty, иначе ssh не отдаёт поток по Ctrl-C.
  ssh -t "${SSH_OPTS[@]}" "$DEPLOY_HOST" \
    "cd '$DEPLOY_DIR' && docker compose -f '$COMPOSE_FILE' $ARGS"
else
  dc "$ARGS"
fi
