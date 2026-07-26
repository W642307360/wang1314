#!/usr/bin/env bash
set -euo pipefail
if [[ "${RENEWED_LINEAGE:-/etc/letsencrypt/live/media.petinmyall.me}" != *"media.petinmyall.me"* ]]; then
  exit 0
fi
set -a
source /srv/fuchong/shared/.env.production
set +a
export TENCENT_CDN_DOMAIN=media.petinmyall.me
export CDN_CERT_LINEAGE="${RENEWED_LINEAGE:-/etc/letsencrypt/live/media.petinmyall.me}"
exec /srv/fuchong/shared/cos-venv/bin/python /srv/fuchong/shared/scripts/configure-cdn-https.py
