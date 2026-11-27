#!/bin/sh
# Enables or disables an environment's HTTPS site on the edge proxy.
#   sh deploy/edge/site.sh enable  prod|staging
#   sh deploy/edge/site.sh disable prod|staging
# "enable" refuses to run until the environment's Let's Encrypt certificate exists (and, for staging,
# until deploy/edge/auth/staging.htpasswd exists), because nginx would not start without them.
set -eu
# shellcheck source=_edge.sh
. "$(dirname -- "$0")/_edge.sh"

action=${1:-}
env=${2:-}
[ -n "$action" ] && [ -n "$env" ] || die "usage: $0 enable|disable prod|staging"
cert=$(cert_name "$env")
target="$EDGE_DIR/enabled/$env.conf"
LE_DIR=${LETSENCRYPT_DIR:-/etc/letsencrypt}   # host path mounted into the edge (compose.yml)

case "$action" in
  enable)
    # /etc/letsencrypt/live is readable by root only: without access, ask the edge container (it runs as root).
    if [ -r "$LE_DIR/live" ]; then
      [ -f "$LE_DIR/live/$cert/fullchain.pem" ] || die "no certificate at $LE_DIR/live/$cert/ - issue it first (DEPLOY.md, certificates)"
    else
      edge_dc exec -T nginx test -f "/etc/letsencrypt/live/$cert/fullchain.pem" </dev/null \
        || die "no certificate for $cert in the edge's /etc/letsencrypt - issue it first (DEPLOY.md, certificates)"
    fi
    if [ "$env" = staging ] && [ ! -s "$EDGE_DIR/auth/staging.htpasswd" ]; then
      die "staging must be password-protected: create it first with  sh deploy/edge/htpasswd.sh staging <user>"
    fi
    mkdir -p "$EDGE_DIR/enabled"
    backup=""
    if [ -f "$target" ]; then backup="$target.bak"; cp "$target" "$backup"; fi
    cp "$EDGE_DIR/sites/$env.conf" "$target"
    if ! edge_reload; then
      if [ -n "$backup" ]; then mv "$backup" "$target"; else rm -f "$target"; fi
      die "enabling $env failed; reverted"
    fi
    rm -f "$backup"
    echo "$env site enabled ($cert)"
    ;;
  disable)
    rm -f "$target"
    edge_reload
    echo "$env site disabled"
    ;;
  *) die "usage: $0 enable|disable prod|staging" ;;
esac
