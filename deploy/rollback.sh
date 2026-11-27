#!/bin/sh
# Starts a previously built image again (no rebuild).
#   sh deploy/rollback.sh prod                         # the image that ran before the last release
#   sh deploy/rollback.sh prod lumiere-app:prod-<sha>  # a specific tag (docker image ls lumiere-app)
#   ... [--yes]
#
# Database migrations are NOT rolled back. They are additive (new tables/columns), so an older app
# version normally runs fine on a newer schema. If a release ever needs its data change undone, restore
# a backup instead (DEPLOY.md, restore).
set -eu
# shellcheck source=lib.sh
. "$(dirname -- "$0")/lib.sh"

ENV_ARG="" TARGET="" ASSUME_YES=0
for a in "$@"; do
  case "$a" in
    --yes) ASSUME_YES=1 ;;
    prod|staging) ENV_ARG=$a ;;
    *) TARGET=$a ;;
  esac
done
[ -n "$ENV_ARG" ] || die "usage: $0 prod|staging [<image tag>] [--yes]"
env_resolve "$ENV_ARG"

CURRENT=$(env_get "$ENV_DIR/.env.release" APP_IMAGE)
[ -n "$TARGET" ] || TARGET=$(env_get "$ENV_DIR/.env.release" PREVIOUS_APP_IMAGE)
[ -n "$TARGET" ] || die "no previous image recorded; pass a tag (docker image ls lumiere-app)"
case "$TARGET" in "lumiere-app:$ENV-"*) ;; *) die "$TARGET is not a $ENV image (expected lumiere-app:$ENV-<sha>)" ;; esac
docker image inspect "$TARGET" >/dev/null 2>&1 || die "image $TARGET does not exist on this server"

confirm "roll back from ${CURRENT:-<unknown>} to $TARGET"
{
  echo "# Written by deploy/rollback.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ). Do not edit by hand."
  echo "APP_IMAGE=$TARGET"
  echo "PREVIOUS_APP_IMAGE=${CURRENT:-}"
  echo "RELEASED_COMMIT=${TARGET#lumiere-app:"$ENV"-}"
} > "$ENV_DIR/.env.release"

since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
dc up -d --no-deps --force-recreate app
wait_for_migrations "$since"
smoke || die "rolled back to $TARGET but the smoke test fails; check  sh deploy/dc.sh $ENV logs app"
flush_cache
say "now running $TARGET on $ENV (was ${CURRENT:-unknown})"
