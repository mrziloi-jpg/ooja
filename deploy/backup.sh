#!/bin/sh
# Nightly database backup. Add to the server's crontab:
#   15 3 * * * /opt/lumiere/deploy/backup.sh >> /var/log/lumiere-backup.log 2>&1
# Then copy ./backups to object storage at a different provider (e.g. with rclone) so a lost server doesn't lose orders.
set -eu
cd "$(dirname "$0")/.."
STAMP=$(date +%Y%m%d-%H%M)
docker compose exec -T db pg_dump -U lumiere -Fc lumiere > "backups/lumiere-$STAMP.dump"
# Keep 14 daily backups locally.
ls -1t backups/lumiere-*.dump | tail -n +15 | xargs -r rm --
echo "backup ok: lumiere-$STAMP.dump"
