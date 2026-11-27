#!/bin/sh
# Releases a git commit to one environment.
#   sh deploy/release.sh staging [<commit>] [--yes]     # default commit: origin/main
#   sh deploy/release.sh prod    <commit>   [--yes]
#   ... --skip-smoke   first deploy only: the catalog is empty until seeded, so catalog pages 404.
#                      Seed, restart the app, then run  sh deploy/smoke.sh <env>.
#
# Steps: check out <commit> in the environment's directory, build lumiere-app:<env>-<sha> with that
# environment's SITE_URL and REGISTRY, start it, wait for "migrations applied", smoke-test every page
# through the edge, flush the page cache. Recommended flow: release to staging, test, then release the
# SAME commit to production. Roll back with deploy/rollback.sh.
set -eu

# git checkout below may rewrite this very file, and sh reads scripts as it goes: run from a copy.
if [ -z "${LUMIERE_RELEASE_COPY:-}" ]; then
  tmp=$(mktemp -d)
  cp "$(dirname -- "$0")/release.sh" "$(dirname -- "$0")/lib.sh" "$tmp/"
  LUMIERE_RELEASE_COPY="$tmp" exec sh "$tmp/release.sh" "$@"
fi
trap 'rm -rf "$LUMIERE_RELEASE_COPY"' EXIT
# shellcheck source=lib.sh
. "$(dirname -- "$0")/lib.sh"

ENV_ARG="" COMMIT="origin/main" ASSUME_YES=0 SKIP_SMOKE=0
for a in "$@"; do
  case "$a" in
    --yes) ASSUME_YES=1 ;;
    --skip-smoke) SKIP_SMOKE=1 ;;
    prod|staging) if [ -z "$ENV_ARG" ]; then ENV_ARG=$a; else COMMIT=$a; fi ;;
    *) COMMIT=$a ;;
  esac
done
[ -n "$ENV_ARG" ] || die "usage: $0 prod|staging [<commit>] [--yes] [--skip-smoke]"
env_resolve "$ENV_ARG"
cd "$ENV_DIR"

# Local edits on the server would be silently overwritten or mixed into the build.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status --short --untracked-files=no
  die "$ENV_DIR has uncommitted changes to tracked files; commit them upstream or discard them first"
fi

say "fetching from $(git remote get-url origin)"
git fetch --quiet origin
SHA=$(git rev-parse --verify --short=12 "$COMMIT^{commit}") || die "unknown commit '$COMMIT'"
IMAGE="lumiere-app:$ENV-$SHA"
SITE_URL=$(env_get "$ENV_DIR/.env" SITE_URL)
REGISTRY=$(env_get "$ENV_DIR/.env" REGISTRY)
[ -n "$SITE_URL" ] || die "SITE_URL is not set in $ENV_DIR/.env"
case "$SITE_URL" in https://*) ;; *) die "SITE_URL must be the public https:// URL (got $SITE_URL)" ;; esac
PREVIOUS=$(env_get "$ENV_DIR/.env.release" APP_IMAGE)

if [ "$ENV" = prod ] && [ "$(env_get "$ENV_DIR/.env" PAYMENT_PROVIDER)" = mock ]; then
  echo "   note: production .env still has PAYMENT_PROVIDER=mock (fine before launch, NOT after)"
fi
confirm "release commit $SHA ($(git log -1 --format=%s "$SHA")) as $IMAGE, SITE_URL=$SITE_URL, REGISTRY=${REGISTRY:-<none>}"

git checkout --quiet --detach "$SHA"
say "building $IMAGE"
APP_IMAGE="$IMAGE" dc build app

# Pin the new image; remember the previous one for rollback.sh.
{
  echo "# Written by deploy/release.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ). Do not edit by hand."
  echo "APP_IMAGE=$IMAGE"
  echo "PREVIOUS_APP_IMAGE=${PREVIOUS:-}"
  echo "RELEASED_COMMIT=$SHA"
} > "$ENV_DIR/.env.release"

say "starting $IMAGE"
dc up -d db nginx
since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
dc up -d --no-deps --force-recreate app
wait_for_migrations "$since"

if [ "$SKIP_SMOKE" = 1 ]; then
  say "smoke test SKIPPED (--skip-smoke): run  sh deploy/smoke.sh $ENV  once the catalog is seeded"
elif ! smoke; then
  echo ""
  echo "Release $SHA is running but FAILED the smoke test."
  [ -n "${PREVIOUS:-}" ] && echo "Roll back with:  sh deploy/rollback.sh $ENV $PREVIOUS"
  exit 1
fi
flush_cache

# Keep the 5 newest images of this environment (plus the previous one) so the disk doesn't fill up.
docker image ls --format '{{.Repository}}:{{.Tag}}' --filter "reference=lumiere-app:$ENV-*" | tail -n +6 | while read -r old; do
  [ "$old" = "$IMAGE" ] || [ "$old" = "${PREVIOUS:-}" ] || docker image rm "$old" >/dev/null 2>&1 || true
done

say "released $SHA to $ENV as $IMAGE (previous: ${PREVIOUS:-none})"
