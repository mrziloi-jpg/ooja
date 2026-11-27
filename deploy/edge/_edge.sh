# Shared helpers for the edge scripts. Sourced, not run.
# shellcheck shell=sh

EDGE_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)

die() { echo "error: $*" >&2; exit 1; }

edge_dc() {
  if [ -f "$EDGE_DIR/.env" ]; then
    docker compose -f "$EDGE_DIR/compose.yml" --env-file "$EDGE_DIR/.env" "$@"
  else
    docker compose -f "$EDGE_DIR/compose.yml" "$@"
  fi
}

# Validates the edge config and reloads it. Returns non-zero (and leaves the running config alone) if invalid.
edge_reload() {
  if ! edge_dc exec -T nginx nginx -t; then
    echo "edge config is INVALID; the running edge keeps its previous config" >&2
    return 1
  fi
  edge_dc exec -T nginx nginx -s reload
  # Reload is asynchronous: old workers can still answer for a moment with the previous config.
  sleep 3
  echo "edge reloaded"
}

# Prints the HTTP status the public site returns without credentials (via this server, not DNS).
public_status() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$1:443:127.0.0.1" "https://$1/" 2>/dev/null || true
}

# Certificate name for an environment (must match sites/<env>.conf and the certbot --cert-name).
cert_name() {
  case "$1" in
    prod) echo oojashop.ir ;;
    staging) echo staging.oojashop.ir ;;
    *) die "unknown environment '$1' (use prod or staging)" ;;
  esac
}
