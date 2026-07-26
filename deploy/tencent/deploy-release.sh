#!/usr/bin/env bash
set -Eeuo pipefail

release="${1:?release id required}"
if [[ ! "$release" =~ ^[0-9A-Za-z._-]+$ ]]; then
  echo "invalid release id" >&2
  exit 2
fi

upload_dir=/home/ubuntu/fuchong-upload
release_dir="/srv/fuchong/releases/$release"
previous="$(readlink -f /srv/fuchong/current 2>/dev/null || true)"
switched=0

rollback() {
  if [[ "$switched" -eq 1 && -n "$previous" && -d "$previous" ]]; then
    echo "Deployment failed; restoring $previous" >&2
    ln -sfn "$previous" /srv/fuchong/current
    previous_tag="$(basename "$previous")"
    cd "$previous"
    RELEASE_TAG="$previous_tag" sudo -E docker compose -f deploy/tencent/compose.yaml up -d || true
    sudo cp deploy/tencent/nginx-https.conf /etc/nginx/sites-available/petinmyall.me || true
    sudo nginx -t && sudo systemctl reload nginx || true
  fi
}
trap rollback ERR

sudo mkdir -p /srv/fuchong/releases /srv/fuchong/shared/data /srv/fuchong/shared/uploads /srv/fuchong/shared/backups
sudo chown ubuntu:ubuntu /srv/fuchong /srv/fuchong/releases
sudo chown -R ubuntu:ubuntu /srv/fuchong/shared/data /srv/fuchong/shared/uploads /srv/fuchong/shared/backups
if [[ -e "$release_dir" ]]; then
  echo "release already exists: $release_dir" >&2
  exit 2
fi
mkdir -p "$release_dir"
tar -xzf "$upload_dir/source.tar.gz" -C "$release_dir"

chmod 600 /srv/fuchong/shared/.env.production
sudo systemctl start fuchong-backup.service

echo '[1/5] Building frontend'
sudo docker run --rm -v "$release_dir:/app" -w /app node:24-bookworm-slim sh -lc 'npm ci --no-audit --no-fund && npm run build'

echo '[2/5] Building API image'
cd "$release_dir"
RELEASE_TAG="$release" sudo -E docker compose -f deploy/tencent/compose.yaml build

echo '[3/5] Switching release'
ln -sfn "$release_dir" /srv/fuchong/current
switched=1
sudo cp deploy/tencent/nginx-https.conf /etc/nginx/sites-available/petinmyall.me
sudo nginx -t
sudo systemctl reload nginx
RELEASE_TAG="$release" sudo -E docker compose -f deploy/tencent/compose.yaml up -d

echo '[4/5] Waiting for health'
healthy=0
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3001/api/health | grep -q '"database":true'; then
    healthy=1
    break
  fi
  sleep 2
done
if [[ "$healthy" -ne 1 ]]; then
  sudo docker logs --tail 200 fuchong-api
  false
fi

echo '[5/5] Updating services and COS'
sudo install -d -o root -g root -m 0755 /srv/fuchong/shared/scripts
sudo install -o root -g root -m 0755 deploy/tencent/cos-sync.py /srv/fuchong/shared/scripts/cos-sync.py
sudo install -o root -g root -m 0644 deploy/tencent/fuchong-cos-sync.service /etc/systemd/system/fuchong-cos-sync.service
sudo install -o root -g root -m 0644 deploy/tencent/fuchong-cos-sync.timer /etc/systemd/system/fuchong-cos-sync.timer
sudo systemctl daemon-reload
sudo systemctl enable --now fuchong-cos-sync.timer
sudo systemctl start fuchong-cos-sync.service || echo 'COS sync will retry from its timer' >&2

switched=0
trap - ERR
curl -fsS https://petinmyall.me/api/health
echo
sudo docker ps --filter name=fuchong-api --format '{{.Names}} {{.Status}} {{.Ports}}'
echo "Release $release deployed successfully"
