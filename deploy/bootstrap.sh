#!/usr/bin/env bash
# Первый запуск на сервере (Docker Compose).
#
# Предварительные требования на сервере (делаются один раз, вручную, под root):
#   1. Docker + compose plugin, а deploy-пользователь — в группе docker.
#      На webtest уже так: leonidl входит в docker, docker 27.4 / compose v2.31.
#   2. nginx с активированным конфигом deploy/nginx/ag_co_worker.conf
#      (см. deploy/README.md — «nginx server block»). Нужен sudo, поэтому
#      этот шаг НЕ автоматизирован.
#   3. TLS-сертификат. На webtest это общий wildcard *.constrtodo.ru в
#      /home/leonidl/certs — certbot не нужен.
#   4. $DEPLOY_DIR/.env.prod (из deploy/.env.prod.example, chmod 600).
#      Скрипт его не создаёт и не перезаписывает — он под контролем оператора.
#
# Использование:
#   make deploy-bootstrap                  # ревизия из .env.deploy
#   REV=origin/<branch> make deploy-bootstrap   # проверить ветку до мержа
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

REV="${REV:-$DEPLOY_REV}"

REPO_URL="${REPO_URL:-}"
if [ -z "$REPO_URL" ]; then
  REPO_URL="$(git -C "$REPO_ROOT" remote get-url "$DEPLOY_REMOTE" 2>/dev/null || true)"
fi
[ -n "$REPO_URL" ] || fail "Не удалось определить URL репозитория (задайте REPO_URL=... или настройте remote '$DEPLOY_REMOTE')."

info "checkout репо на сервер: $REPO_URL → $DEPLOY_DIR"
ssh_exec "
  set -e
  if [ ! -d '$DEPLOY_DIR/.git' ]; then
    mkdir -p '$(dirname "$DEPLOY_DIR")'
    git clone '$REPO_URL' '$DEPLOY_DIR'
  else
    cd '$DEPLOY_DIR' && git fetch --all
  fi
  cd '$DEPLOY_DIR' && git checkout '$REV'
"
ok "репо на сервере"

info "проверка предусловий на сервере"
remote '
  test -f .env.prod || {
    echo "✗ .env.prod нет в корне checkout'"'"'а."
    echo "  На сервере: cp deploy/.env.prod.example .env.prod && chmod 600 .env.prod"
    echo "  Затем заполнить AUTH_SERVICE_URL / CALC_SERVICE_URL / ONEC_SERVICE_URL."
    exit 1
  }
  command -v docker >/dev/null 2>&1 || { echo "✗ docker не установлен"; exit 1; }
  docker compose version >/dev/null 2>&1 || { echo "✗ docker compose plugin не установлен"; exit 1; }
  docker info >/dev/null 2>&1 || { echo "✗ нет доступа к docker без sudo — добавьте пользователя в группу docker"; exit 1; }
  command -v nginx >/dev/null 2>&1 || { echo "✗ nginx не установлен"; exit 1; }
  docker --version; docker compose version
'
ok "предусловия выполнены"

# nginx-конфиг ставится отдельно (нужен sudo). Не падаем, но громко предупреждаем:
# без него домен будет уходить в чужой catch-all server block.
if remote "test -e /etc/nginx/sites-enabled/ag_co_worker.conf"; then
  ok "nginx server block активирован"
else
  warn "/etc/nginx/sites-enabled/ag_co_worker.conf НЕ активирован."
  warn "Домен будет попадать в чужой catch-all. См. deploy/README.md → «nginx server block»."
fi

info "сборка и запуск контейнеров (Node 22 внутри образов)"
dc "up -d --build"

# bootstrap двигает HEAD целиком, но маркеры инициализируем сразу — чтобы
# deploy-status.sh с первого запуска показывал ревизии, а не «маркера нет».
mark_deployed backend "$REV"
mark_deployed frontend "$REV"

info "ждём health"
wait_health 30 || true
check_backend || true

info "статус:"
dc "ps"

if [ -n "$DEPLOY_DOMAIN" ]; then
  info "smoke https://$DEPLOY_DOMAIN/health"
  curl -fsS --retry 5 --retry-delay 2 -o /dev/null -w "  HTTP %{http_code}\n" "https://$DEPLOY_DOMAIN/health" \
    || warn "через домен не отвечает — проверьте nginx server block и логи (make deploy-logs)"
fi

ok "bootstrap завершён"
