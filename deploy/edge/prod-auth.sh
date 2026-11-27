#!/bin/sh
# Pre-launch lock for production: puts oojashop.ir behind HTTP basic auth, or removes it.
#   sh deploy/edge/prod-auth.sh on        # lock (needs deploy/edge/auth/prod.htpasswd: htpasswd.sh prod <user>)
#   sh deploy/edge/prod-auth.sh off       # remove the lock = LAUNCH (asks for confirmation)
#   sh deploy/edge/prod-auth.sh status
set -eu
# shellcheck source=_edge.sh
. "$(dirname -- "$0")/_edge.sh"

state="$EDGE_DIR/state/prod-auth.conf"

case "${1:-}" in
  on)
    [ -s "$EDGE_DIR/auth/prod.htpasswd" ] || die "create a login first:  sh deploy/edge/htpasswd.sh prod <user>"
    mkdir -p "$EDGE_DIR/state"
    cat > "$state" <<'EOF'
# Written by deploy/edge/prod-auth.sh. Delete (prod-auth.sh off) to launch.
auth_basic "OOJA SHOP - pre-launch";
auth_basic_user_file /etc/nginx/auth/prod.htpasswd;
EOF
    edge_reload || { rm -f "$state"; die "could not apply the lock; production left unchanged"; }
    code=$(public_status oojashop.ir)
    if [ "$code" = 401 ]; then echo "production is LOCKED (verified: anonymous request gets 401)"
    else echo "production lock written, but an anonymous request got ${code:-no answer} instead of 401: check  docker compose -f $EDGE_DIR/compose.yml logs nginx" >&2; exit 1; fi
    ;;
  off)
    if [ "${2:-}" != "--yes" ]; then
      printf 'This makes https://oojashop.ir PUBLIC (launch). Type "launch" to continue: '
      read -r answer
      [ "$answer" = launch ] || die "aborted"
    fi
    rm -f "$state"
    edge_reload
    echo "production is PUBLIC (basic auth off); anonymous request now gets $(public_status oojashop.ir)"
    ;;
  status)
    if [ -f "$state" ]; then echo "production: locked (basic auth on)"; else echo "production: public (no basic auth)"; fi
    ;;
  *) die "usage: $0 on|off|status" ;;
esac
