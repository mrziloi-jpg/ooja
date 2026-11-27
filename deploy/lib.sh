# Shared helpers for the environment scripts (dc.sh, release.sh, rollback.sh, backup.sh, restore.sh,
# refresh-staging.sh). Sourced, not run.
# shellcheck shell=sh
#
# Environments:
#   prod    -> directory $LUMIERE_PROD_DIR    (default /opt/lumiere),         Compose project "lumiere"
#   staging -> directory $LUMIERE_STAGING_DIR (default /opt/lumiere-staging), Compose project "lumiere-staging"
# Each directory is its own git checkout of the repository with its own .env.

die() { echo "error: $*" >&2; exit 1; }
say() { echo ">> $*"; }

# Sets ENV, ENV_DIR, PROJECT for "prod" or "staging".
env_resolve() {
  ENV=${1:-}
  case "$ENV" in
    prod) ENV_DIR=${LUMIERE_PROD_DIR:-/opt/lumiere}; PROJECT=lumiere ;;
    staging) ENV_DIR=${LUMIERE_STAGING_DIR:-/opt/lumiere-staging}; PROJECT=lumiere-staging ;;
    *) die "unknown environment '${ENV}' (use prod or staging)" ;;
  esac
  [ -f "$ENV_DIR/docker-compose.yml" ] || die "$ENV_DIR is not a LUMIERE checkout (no docker-compose.yml)"
  [ -f "$ENV_DIR/.env" ] || die "$ENV_DIR/.env is missing (copy .env.example and fill it in)"
  # Two environments must never share a directory: that would point both at the same data.
  if [ "${LUMIERE_PROD_DIR:-/opt/lumiere}" = "${LUMIERE_STAGING_DIR:-/opt/lumiere-staging}" ]; then
    die "production and staging point at the same directory"
  fi
}

# Reads KEY from a dotenv file without executing it. Prints the value (quotes stripped) or nothing.
env_get() {
  file=$1 key=$2
  [ -f "$file" ] || return 0
  sed -n "s/^[[:space:]]*$key=//p" "$file" | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

# docker compose for the resolved environment. .env.release (written by release.sh) pins APP_IMAGE.
dc() {
  if [ -f "$ENV_DIR/.env.release" ]; then
    docker compose --project-directory "$ENV_DIR" -p "$PROJECT" \
      -f "$ENV_DIR/docker-compose.yml" -f "$ENV_DIR/deploy/compose.$ENV.yml" \
      --env-file "$ENV_DIR/.env" --env-file "$ENV_DIR/.env.release" "$@"
  else
    docker compose --project-directory "$ENV_DIR" -p "$PROJECT" \
      -f "$ENV_DIR/docker-compose.yml" -f "$ENV_DIR/deploy/compose.$ENV.yml" \
      --env-file "$ENV_DIR/.env" "$@"
  fi
}

# Prints the target and asks before touching it. Production needs the word "production" typed,
# unless the script was given --yes (ASSUME_YES=1).
confirm() {
  what=$1
  echo ""
  echo "  target:  $ENV  (Compose project '$PROJECT', directory $ENV_DIR)"
  echo "  action:  $what"
  echo ""
  if [ "${ASSUME_YES:-0}" = 1 ]; then echo "  (--yes given, not asking)"; return 0; fi
  # Read the answer from the terminal when there is one, so nothing piped into the script answers for you.
  # (/dev/tty can exist yet fail to open, e.g. over non-interactive SSH: test by actually opening it.)
  if (exec 3</dev/tty) 2>/dev/null; then exec 3</dev/tty; else exec 3<&0; fi
  answer=""
  if [ "$ENV" = prod ]; then
    printf '  This is PRODUCTION. Type "production" to continue: '
    read -r answer <&3 || true
    [ "$answer" = production ] || die "aborted"
  else
    printf '  Continue? [y/N] '
    read -r answer <&3 || true
    case "$answer" in y|Y|yes|YES) ;; *) die "aborted" ;; esac
  fi
  exec 3<&-
}

# Pages that must return 200 after a release (DEPLOY.md, verify step).
SMOKE_PAGES="/ /shop /shop/serums /concern/acne /p/niacinamide-10-zinc-1 /quiz /ingredients /ingredients/retinal
/consultation /help /about /terms /privacy /returns /cart /login /sitemap.xml /robots.txt /feeds/products.json"

# Requests every smoke page through the edge (resolved to this server, so no hairpin DNS needed).
# Basic auth: put "user:password" in $ENV_DIR/.smoke-auth (git-ignored, chmod 600) while the site is locked.
smoke() {
  site=$(env_get "$ENV_DIR/.env" SITE_URL)
  [ -n "$site" ] || die "SITE_URL is not set in $ENV_DIR/.env"
  host=$(echo "$site" | sed -e 's#^[a-z]*://##' -e 's#/.*##' -e 's#:.*##')
  set -- --silent --output /dev/null --write-out '%{http_code}' --max-time 30 --resolve "$host:443:127.0.0.1"
  if [ -f "$ENV_DIR/.smoke-auth" ]; then set -- "$@" --user "$(cat "$ENV_DIR/.smoke-auth")"; fi
  failed=0
  for page in $SMOKE_PAGES; do
    code=$(curl "$@" "$site$page" || true)
    if [ "$code" = 200 ]; then echo "   200  $page"; else echo "   $code  $page   <-- FAILED"; failed=1; fi
  done
  if [ "$failed" = 1 ]; then
    if [ ! -f "$ENV_DIR/.smoke-auth" ]; then echo "   (401 everywhere? the site is behind basic auth: create $ENV_DIR/.smoke-auth)"; fi
    return 1
  fi
  say "smoke test passed: every page returned 200 at $site"
}

# Empties this environment's page cache so visitors get the new version immediately.
flush_cache() {
  dc exec -T nginx sh -c 'rm -rf /var/cache/nginx/pages/*' </dev/null && dc exec -T nginx nginx -s reload </dev/null
  say "page cache flushed"
}

# Waits until the app container started after $1 (UTC timestamp) logs "migrations applied".
wait_for_migrations() {
  since=$1
  i=0
  while [ "$i" -lt 90 ]; do
    if dc logs --no-log-prefix --since "$since" app 2>/dev/null | grep -q "migrations applied"; then
      say "migrations applied"
      sleep 3   # let the HTTP server bind after the migration step
      return 0
    fi
    i=$((i + 1))
    sleep 2
  done
  echo "--- last app log lines:"
  dc logs --no-log-prefix --tail 40 app || true
  die "the app did not log 'migrations applied' within 3 minutes"
}
