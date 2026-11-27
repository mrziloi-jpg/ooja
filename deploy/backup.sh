#!/bin/sh
# Backs up one environment's database and product photos into <env dir>/backups/ (git-ignored).
#   sh deploy/backup.sh prod
# Nightly for production only (crontab, see DEPLOY.md):
#   15 3 * * * /bin/sh /opt/lumiere/deploy/backup.sh prod >> /opt/lumiere/backups/cron.log 2>&1
# Keeps the 14 newest of each locally. Read-only for the database, so it asks no confirmation.
set -eu
# shellcheck source=lib.sh
. "$(dirname -- "$0")/lib.sh"
[ $# -ge 1 ] || die "usage: $0 prod|staging"
env_resolve "$1"

KEEP=14
DIR="$ENV_DIR/backups"
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p "$DIR"
chmod 700 "$DIR"   # dumps contain customer data
echo "== $(date -u +%Y-%m-%dT%H:%M:%SZ) backup of $ENV (project $PROJECT) into $DIR"

# Database: custom-format dump, written to a temporary name first so a failed run never looks complete.
db="$DIR/lumiere-$STAMP.dump"
dc exec -T db pg_dump -U lumiere -Fc lumiere > "$db.partial"
dc exec -T db pg_restore --list < "$db.partial" > /dev/null || die "dump is unreadable: $db.partial"
mv "$db.partial" "$db"
echo "database: $(basename "$db") ($(du -h "$db" | cut -f1))"

# Product photos: streamed out of the inner nginx container, which mounts the media volume.
media="$DIR/media-$STAMP.tgz"
dc exec -T nginx tar czf - -C /media . > "$media.partial"
mv "$media.partial" "$media"
echo "media:    $(basename "$media") ($(du -h "$media" | cut -f1))"

# Keep the newest $KEEP of each kind. (File names are generated above, so sorting with ls -t is safe.)
# shellcheck disable=SC2012
ls -1t "$DIR"/lumiere-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f --
# shellcheck disable=SC2012
ls -1t "$DIR"/media-*.tgz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f --

# ---- OFF-SERVER COPY ----------------------------------------------------------------------------
# A backup that lives only on this server is lost with the server. The destination is not decided yet.
# When it is: install rclone, configure a remote (rclone config), and set in <env dir>/.env:
#   BACKUP_RCLONE_REMOTE=myremote:lumiere-backups/prod
# This block then copies the new files after every run.
REMOTE=$(env_get "$ENV_DIR/.env" BACKUP_RCLONE_REMOTE)
if [ -n "$REMOTE" ]; then
  command -v rclone >/dev/null || die "BACKUP_RCLONE_REMOTE is set but rclone is not installed"
  rclone copy "$db" "$REMOTE/" && rclone copy "$media" "$REMOTE/"
  echo "off-server copy: $REMOTE"
else
  echo "off-server copy: NOT CONFIGURED (set BACKUP_RCLONE_REMOTE in $ENV_DIR/.env)"
fi
echo "backup ok"
