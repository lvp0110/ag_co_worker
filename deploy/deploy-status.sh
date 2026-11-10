#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

info "состояние frontend-контейнера"
compose "ps frontend"

info "внутренний health-check контейнера"
body="$(compose "exec -T frontend node -e \"fetch('http://127.0.0.1:3008/__front_health').then(async r=>{console.log(await r.text());process.exit(r.ok?0:1)}).catch(()=>process.exit(1))\"")"
printf '  %s\n' "$body"
printf '%s' "$body" | grep -Eq '\{"ok":true\}' || fail "неожиданный внутренний health-response"

if [ -n "$DEPLOY_DOMAIN" ]; then
  info "публичный health-check https://$DEPLOY_DOMAIN/__front_health"
  body="$(curl -fsS --retry 5 --retry-delay 3 --retry-all-errors "https://$DEPLOY_DOMAIN/__front_health")"
  printf '  %s\n' "$body"
  printf '%s' "$body" | grep -Eq '^\{[[:space:]]*"ok"[[:space:]]*:[[:space:]]*true[[:space:]]*\}$' \
    || fail "домен ответил, но это не ag_co_worker"
  ok "публичный frontend отвечает"
fi
