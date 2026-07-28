#!/usr/bin/env bash
# Бутстрап рутового админа на проде. Идемпотентно — повтор безопасен.
#
# Креды читаются из .env.prod на сервере (env_file backend-сервиса):
#   ADMIN_EMAIL, ADMIN_PASSWORD (>=6), ADMIN_NAME (опц.), ADMIN_COMPANY_ID (опц.)
#
# Порядок при первой раскатке:
#   1) make deploy-migrate          ← создаст таблицы + дефолтную компанию
#   2) в .env.prod добавить ADMIN_EMAIL/ADMIN_PASSWORD
#   3) make deploy-create-admin     ← создаст админа (можно потом убрать ADMIN_PASSWORD из .env.prod)
#
# Запускает одноразовый контейнер из того же образа — работающий backend не трогается.
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

info "создаём/повышаем рутового админа (креды из .env.prod на сервере)"
compose "run --rm backend node dist/scripts/create-admin.js"

ok "готово"
