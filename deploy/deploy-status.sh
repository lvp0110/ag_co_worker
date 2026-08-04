#!/usr/bin/env bash
# Состояние прод-стека: контейнеры + health изнутри и через nginx.
#
# Используется как smoke-тест в CI, поэтому ПАДАЕТ (exit 1), если наше
# приложение не отвечает. Иначе деплой «зеленел» бы даже когда на сервере
# ничего не поднято.
#
# Проверка по домену — предупреждение, а не ошибка: пока не активирован
# nginx server block, домен уходит в чужой catch-all и отдаёт 200 с посторонней
# страницей, то есть на него нельзя опираться как на признак живости.
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

FAILED=0

info "compose ps:"
dc "ps" || { warn "docker compose ps не выполнился (репо на сервере есть? был ли bootstrap?)"; FAILED=1; }

info "ревизия на сервере:"
remote "git log -1 --format='%h %s (%ci)'" || warn "не удалось прочитать ревизию"

# ss на хосте — намеренно ssh_exec, а не remote: проверка порта не должна
# зависеть от существования $DEPLOY_DIR.
info "host-порт фронта ($FRONTEND_HOST_PORT):"
ssh_exec "ss -ltn | grep ':$FRONTEND_HOST_PORT ' || echo 'НЕ слушается'" || true

info "frontend /__front_health (127.0.0.1:$FRONTEND_HOST_PORT):"
if ssh_exec "curl -fsS --max-time 10 -w ' HTTP %{http_code}\n' http://127.0.0.1:$FRONTEND_HOST_PORT/__front_health"; then
  ok "frontend жив"
else
  warn "frontend НЕ отвечает"
  FAILED=1
fi

check_backend || FAILED=1

if [ -n "$DEPLOY_DOMAIN" ]; then
  info "health через домен: https://$DEPLOY_DOMAIN/health"
  # Ждём JSON от нашего backend. HTML означает чужой catch-all server block.
  BODY="$(curl -fsS --max-time 15 "https://$DEPLOY_DOMAIN/health" 2>/dev/null || true)"
  if printf '%s' "$BODY" | grep -q '"ok"'; then
    ok "домен отдаёт наш /health"
  elif [ -z "$BODY" ]; then
    warn "домен не ответил"
  else
    warn "домен отвечает НЕ нашим приложением (похоже, nginx server block не активирован)"
    printf '  первые 80 символов: %s\n' "$(printf '%s' "$BODY" | head -c 80 | tr -d '\n')"
  fi
fi

if [ "$FAILED" != "0" ]; then
  fail "прод-стек не в порядке (см. предупреждения выше; логи — make deploy-logs)"
fi
ok "прод-стек в порядке"
