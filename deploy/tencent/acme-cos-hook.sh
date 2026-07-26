#!/usr/bin/env bash
set -euo pipefail
set -a
source /srv/fuchong/shared/.env.production
set +a
exec /srv/fuchong/shared/cos-venv/bin/python /srv/fuchong/shared/scripts/acme-cos-hook.py "$@"
