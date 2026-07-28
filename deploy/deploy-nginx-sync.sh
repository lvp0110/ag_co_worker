#!/usr/bin/env bash
# Синхронизировать nginx server block с шаблоном из репо.
#
# Что делает:
#   1) подставляет $DEPLOY_DOMAIN на место <domain> в deploy/nginx/ag_co_worker.conf
#   2) rsync результата в staging-путь на сервере ($DEPLOY_DIR/deploy/nginx/)
#   3) sudo cp staging → /etc/nginx/sites-available/ag_co_worker.conf
#   4) sudo ln -sf в sites-enabled (idempotent — повтор ок)
#   5) sudo nginx -t (валидация)
#
# Reload вызывается ОТДЕЛЬНО — deploy-nginx-reload.sh. Это разделение даёт
# возможность сначала прогнать nginx -t, увидеть ошибку и НЕ применять reload.
#
# Требования на сервере: deploy-юзер должен иметь NOPASSWD-sudo на:
#   /usr/bin/cp, /usr/bin/ln, /usr/sbin/nginx, /usr/bin/systemctl reload nginx
# (последние два уже нужны для deploy-nginx-reload.sh).
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

: "${DEPLOY_DOMAIN:?DEPLOY_DOMAIN не задан в deploy/.env.deploy (нужен для подстановки <domain> в nginx-конфиг)}"

# strip trailing whitespace/CR — частый источник «No such file» при копипасте в GH-секрет.
DEPLOY_DOMAIN="$(printf '%s' "$DEPLOY_DOMAIN" | tr -d '[:space:]')"
# DEPLOY_CERT_DIR — абсолютный путь к директории с fullchain.pem / privkey.pem.
# Примеры:
#   certbot, имя cert'а = домену:        /etc/letsencrypt/live/ag.example.com   (default)
#   certbot, wildcard в корневом домене: /etc/letsencrypt/live/constrtodo.ru
#   cert вне certbot:                    /home/leonidl/certs
DEPLOY_CERT_DIR="$(printf '%s' "${DEPLOY_CERT_DIR:-/etc/letsencrypt/live/$DEPLOY_DOMAIN}" | tr -d '[:space:]')"

LOCAL_TEMPLATE="$REPO_ROOT/deploy/nginx/ag_co_worker.conf"
LOCAL_RENDERED="$(mktemp -t ag_co_worker.nginx.XXXXXX.conf)"
REMOTE_STAGE_DIR="$DEPLOY_DIR/deploy/nginx"
REMOTE_STAGE_FILE="$REMOTE_STAGE_DIR/ag_co_worker.rendered.conf"
SYSTEM_CONF="/etc/nginx/sites-available/ag_co_worker.conf"
SYSTEM_LINK="/etc/nginx/sites-enabled/ag_co_worker.conf"

trap 'rm -f "$LOCAL_RENDERED"' EXIT

info "рендерю шаблон: <domain>=$DEPLOY_DOMAIN, <cert_dir>=$DEPLOY_CERT_DIR"
sed -e "s|<domain>|$DEPLOY_DOMAIN|g" \
    -e "s|<cert_dir>|$DEPLOY_CERT_DIR|g" \
    "$LOCAL_TEMPLATE" > "$LOCAL_RENDERED"

# Sanity-check: после подстановки в файле не осталось плейсхолдеров.
if grep -Eq '<domain>|<cert_dir>' "$LOCAL_RENDERED"; then
  fail "в рендере остались неподставленные плейсхолдеры"
fi

# Покажем подставленные ssl_certificate-пути — самая частая причина падения nginx -t.
info "ssl_certificate в рендере:"
grep -E "ssl_certificate" "$LOCAL_RENDERED" || warn "ssl_certificate в шаблоне не найден"

# Сабстрочный sanity-check: в результате не осталось плейсхолдеров.
if grep -q '<domain>' "$LOCAL_RENDERED"; then
  fail "после подстановки в шаблоне всё ещё остался <domain> — sed промахнулся"
fi

info "rsync $LOCAL_RENDERED → $DEPLOY_HOST:$REMOTE_STAGE_FILE"
ssh_exec "mkdir -p '$REMOTE_STAGE_DIR'"
rsync -az -e "ssh ${SSH_OPTS[*]}" "$LOCAL_RENDERED" "$DEPLOY_HOST:$REMOTE_STAGE_FILE"

info "копирую staging → $SYSTEM_CONF и валидирую nginx -t"
ssh_exec "sudo cp '$REMOTE_STAGE_FILE' '$SYSTEM_CONF' && \
  sudo ln -sf '$SYSTEM_CONF' '$SYSTEM_LINK' && \
  sudo nginx -t"

ok "nginx config обновлён и валиден; reload — отдельным шагом (deploy-nginx-reload.sh)"
