#!/usr/bin/env bash
# Применить prisma-миграции на проде отдельным одноразовым контейнером.
# Работающий backend НЕ перезапускается — `docker compose run --rm backend`
# стартует новый контейнер из того же образа, прогоняет миграции и умирает.
#
# Порядок для additive-миграции (zero downtime):
#   1) make deploy-migrate    ← применить миграцию (БД уже в новом состоянии)
#   2) make deploy-backend    ← выкатить новый код, использующий новую схему
#
# Для breaking (rename/drop) — см. deploy/README.md (раздел "expand/contract").
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

REV="${REV:-$DEPLOY_REV}"
info "подтягиваем свежие миграции из git на ревизии $REV"
remote "git fetch '$DEPLOY_REMOTE' && git checkout '$REV' -- backend/prisma/"

info "применяем prisma migrate deploy (idempotent — повтор ок)"
compose "run --rm backend npx prisma migrate deploy"

info "текущее состояние миграций"
compose "run --rm backend npx prisma migrate status" || true

ok "миграции применены"
