#!/usr/bin/env bash
# Проверить nginx-конфиг на сервере и перечитать его.
# Использовать после правки /etc/nginx/sites-available/ag_co_worker.conf.
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

# ssh_sudo, а не ssh_exec: без NOPASSWD-sudo нужен TTY для запроса пароля.
info "nginx -t && systemctl reload nginx"
ssh_sudo "sudo nginx -t && sudo systemctl reload nginx"

ok "nginx перечитан"
