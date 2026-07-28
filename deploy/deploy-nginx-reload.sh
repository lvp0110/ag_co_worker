#!/usr/bin/env bash
# Проверить nginx-конфиг на сервере и перечитать его.
# Использовать после правки /etc/nginx/sites-available/ag_co_worker.conf.
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

info "nginx -t"
ssh_exec "sudo nginx -t"

info "systemctl reload nginx"
ssh_exec "sudo systemctl reload nginx"

ok "nginx перечитан"
