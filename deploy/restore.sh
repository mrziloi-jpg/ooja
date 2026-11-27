#!/bin/sh
# Restores a database dump made by backup.sh, ALWAYS into a scratch database first.
#
#   sh deploy/restore.sh prod backups/lumiere-20261127-0315.dump
#       Restores into the scratch database "lumiere_restore" (the live "lumiere" is untouched) and prints
#       row counts so you can check the dump. Inspect it with:
#         sh deploy/dc.sh prod exec db psql -U lumiere -d lumiere_restore
#
#   sh deploy/restore.sh prod backups/lumiere-20261127-0315.dump --promote [--yes]
#       Does the scratch restore, then swaps it in: stops the app, renames the live database to
#       lumiere_before_restore_<time> (kept, not deleted), renames lumiere_restore to lumiere, starts the
#       app and smoke-tests. To undo, rename the databases back the same way.
#
# Photos are restored separately (DEPLOY.md, restore).
set -eu
# shellcheck source=lib.sh
. "$(dirname -- "$0")/lib.sh"

ENV_ARG="" DUMP="" PROMOTE=0 ASSUME_YES=0
for a in "$@"; do
  case "$a" in
    --promote) PROMOTE=1 ;;
    --yes) ASSUME_YES=1 ;;
    prod|staging) ENV_ARG=$a ;;
    *) DUMP=$a ;;
  esac
done
[ -n "$ENV_ARG" ] && [ -n "$DUMP" ] || die "usage: $0 prod|staging <dump file> [--promote] [--yes]"
env_resolve "$ENV_ARG"
[ -f "$DUMP" ] || die "no such file: $DUMP"
# </dev/null: "compose exec" forwards stdin, which would otherwise swallow input meant for the confirmation.
psql_admin() { dc exec -T db psql -U lumiere -d postgres -v ON_ERROR_STOP=1 -q "$@" </dev/null; }

say "checking the dump"
dc exec -T db pg_restore --list < "$DUMP" > /dev/null || die "$DUMP is not a readable pg_dump custom-format file"

say "restoring $DUMP into scratch database lumiere_restore on $ENV (live database untouched)"
psql_admin -c "DROP DATABASE IF EXISTS lumiere_restore WITH (FORCE)" -c "CREATE DATABASE lumiere_restore OWNER lumiere"
dc exec -T db pg_restore -U lumiere -d lumiere_restore --no-owner --no-privileges --exit-on-error < "$DUMP"

echo "--- row counts in lumiere_restore (compare with the live site):"
dc exec -T db psql -U lumiere -d lumiere_restore </dev/null -c "
  SELECT 'products' AS t, count(*) FROM products UNION ALL SELECT 'orders', count(*) FROM orders
  UNION ALL SELECT 'users', count(*) FROM users UNION ALL SELECT 'reviews', count(*) FROM reviews;"
dc exec -T db psql -U lumiere -d lumiere_restore -tA </dev/null -c "SELECT 'latest order: ' || coalesce(max(created_at)::text, 'none') FROM orders"

if [ "$PROMOTE" != 1 ]; then
  say "scratch restore done. Nothing live was changed. Add --promote to swap it in."
  exit 0
fi

OLD="lumiere_before_restore_$(date +%Y%m%d_%H%M%S)"
# Check everything that can fail BEFORE the app is stopped.
if [ -n "$(psql_admin -tA -c "SELECT 1 FROM pg_database WHERE datname = '$OLD'")" ]; then
  die "a database named $OLD already exists; wait a second and run again"
fi
confirm "REPLACE the live database with the restored dump (live copy kept as $OLD)"
say "stopping the app"
dc stop app
# Both renames in ONE transaction: either the swap happens completely or not at all.
if ! psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('lumiere', 'lumiere_restore') AND pid <> pg_backend_pid()" >/dev/null \
  || ! psql_admin -1 -c "ALTER DATABASE lumiere RENAME TO $OLD" -c "ALTER DATABASE lumiere_restore RENAME TO lumiere"; then
  echo "error: the database swap failed; restarting the app on the UNCHANGED live database" >&2
  dc up -d --no-deps app
  die "restore NOT applied (the scratch copy is still in lumiere_restore)"
fi
say "starting the app on the restored database"
since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
dc up -d --no-deps app
wait_for_migrations "$since"
smoke || echo "WARNING: smoke test failed after restore; investigate (previous data is in $OLD)"
flush_cache
say "restored. Previous live database kept as $OLD; drop it when you are sure:"
echo "   sh deploy/dc.sh $ENV exec db psql -U lumiere -d postgres -c 'DROP DATABASE $OLD'"
