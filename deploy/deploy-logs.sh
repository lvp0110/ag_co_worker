#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

TAIL="${TAIL:-200}"
if [ "${FOLLOW:-0}" = "1" ]; then
  compose "logs --tail='$TAIL' -f frontend"
else
  compose "logs --tail='$TAIL' frontend"
fi
