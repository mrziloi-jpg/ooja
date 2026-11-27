#!/bin/sh
# Refreshes staging with production's data. Data only ever flows DOWN (production -> staging).
#   sh deploy/refresh-staging.sh [--yes]
#
# 1. Dumps production's database and photos (read-only for production).
# 2. Replaces staging's database with that dump, with staging's app stopped.
# 3. Anonymizes all personal data (deploy/anonymize.sql); users listed in staging's ADMIN_PHONES keep theirs.
# 4. Replaces staging's photos, starts staging, flushes its page cache.
# The temporary dump holds real customer data: it lives in a private temp folder and is deleted on exit.
set -eu
# shellcheck source=lib.sh
. "$(dirname -- "$0")/lib.sh"

ASSUME_YES=0
for a in "$@"; do
  case "$a" in
    --yes) ASSUME_YES=1 ;;
    *) die "usage: $0 [--yes]   (the target is always staging)" ;;
  esac
done

# Source: production.
env_resolve prod
PROD_DIR=$ENV_DIR PROD_PROJECT=$PROJECT
# Target: staging. Hard-wired, and checked again so a misconfiguration can never point it at production.
env_resolve staging
[ "$PROJECT" = lumiere-staging ] || die "target project is '$PROJECT', expected lumiere-staging"
if [ "$PROJECT" = "$PROD_PROJECT" ] || [ "$ENV_DIR" = "$PROD_DIR" ]; then
  die "refusing: target is the production project/directory"
fi
[ "$ENV" = staging ] || die "refusing: target environment is not staging"
ADMIN_PHONES=$(env_get "$ENV_DIR/.env" ADMIN_PHONES)

confirm "REPLACE staging's database and photos with an anonymized copy of production ($PROD_PROJECT). Keeps users: ${ADMIN_PHONES:-<none>}"

umask 077
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM

say "dumping production (read-only)"
env_resolve prod
dc exec -T db pg_dump -U lumiere -Fc lumiere > "$TMP/prod.dump"
dc exec -T nginx tar czf - -C /media . > "$TMP/media.tgz"

env_resolve staging
say "stopping staging's app"
dc stop app
say "replacing staging's database"
dc exec -T db psql -U lumiere -d postgres -v ON_ERROR_STOP=1 -q </dev/null \
  -c "DROP DATABASE IF EXISTS lumiere WITH (FORCE)" -c "CREATE DATABASE lumiere OWNER lumiere"
dc exec -T db pg_restore -U lumiere -d lumiere --no-owner --no-privileges --exit-on-error < "$TMP/prod.dump"

say "anonymizing personal data"
# If this fails the transaction rolls back, staging's app stays STOPPED, and nothing personal is served.
dc exec -T db psql -U lumiere -d lumiere -v ON_ERROR_STOP=1 -v admin_phones="$ADMIN_PHONES" -f - < "$ENV_DIR/deploy/anonymize.sql" \
  || die "anonymization FAILED; staging's app is left stopped on purpose. Fix the cause and run again."

say "replacing staging's photos"
dc run --rm --no-deps -T app sh -c 'find /media -mindepth 1 -delete && tar xzf - -C /media' < "$TMP/media.tgz"

say "starting staging"
since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
dc up -d --no-deps app
wait_for_migrations "$since"
flush_cache
say "staging refreshed from production (anonymized)"
