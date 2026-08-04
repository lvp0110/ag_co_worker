#!/usr/bin/env bash
# Роллаут backend (Docker). Frontend-контейнер не трогаем.
#
# Сборка идёт на сервере внутри образа (Node 22), поэтому локальный Node не нужен.
#
# Использование:
#   make deploy-backend                     # ревизия из .env.deploy (origin/main)
#   REV=<commit|tag> make deploy-backend    # откат/выкат конкретной ревизии
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

REV="${REV:-$DEPLOY_REV}"
info "rollout backend на $DEPLOY_HOST: rev=$REV"

# compose-файл берём из той же ревизии — в нём порты и env_file.
remote "git fetch '$DEPLOY_REMOTE' && git checkout '$REV' -- backend/ docker-compose.prod.yml"

info "build + up backend"
dc "up -d --build backend"

info "ждём, пока backend поднимется"
sleep 5
check_backend || true

info "последние 40 строк логов backend:"
dc "logs --tail 40 --no-log-prefix backend" || true

info "статус:"
dc "ps backend"

ok "backend выкачен"
