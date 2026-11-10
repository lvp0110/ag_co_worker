#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

REV="${REV:-$DEPLOY_REV}"
info "rollout ag_co_worker на $DEPLOY_HOST: rev=$REV"

remote "git fetch '$DEPLOY_REMOTE' && git checkout --detach '$REV'"

info "сохраняем предыдущий image для rollback"
remote "docker image inspect ag_co_worker-frontend:latest >/dev/null 2>&1 && docker tag ag_co_worker-frontend:latest ag_co_worker-frontend:prev || true"

info "собираем новый frontend image"
compose "build frontend"

info "перезапускаем frontend"
compose "up -d --no-deps --force-recreate frontend"

info "ждём container health"
healthy=0
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  container_state="$(remote "docker inspect --format='{{.State.Health.Status}}' ag_co_worker-frontend 2>/dev/null || true")"
  if [ "$container_state" = "healthy" ]; then
    healthy=1
    break
  fi
  echo "  попытка $attempt/12: ${container_state:-container unavailable}"
  sleep 5
done

if [ "$healthy" -ne 1 ]; then
  warn "health-check не прошёл; возвращаем предыдущий image"
  compose "logs --tail=100 frontend" || true
  if remote "docker image inspect ag_co_worker-frontend:prev >/dev/null 2>&1"; then
    remote "docker tag ag_co_worker-frontend:prev ag_co_worker-frontend:latest"
    compose "up -d --no-deps --force-recreate --no-build frontend"
    fail "новый frontend не прошёл health-check; выполнен rollback"
  fi
  fail "новый frontend не прошёл health-check; предыдущий image отсутствует"
fi

compose "ps frontend"
ok "ag_co_worker выкачен"
