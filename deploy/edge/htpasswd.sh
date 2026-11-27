#!/bin/sh
# Creates or replaces the basic-auth login for an environment (one user per file).
#   sh deploy/edge/htpasswd.sh staging <user>
#   sh deploy/edge/htpasswd.sh prod <user>
# Asks for the password twice; stores only an apr1 hash in deploy/edge/auth/<env>.htpasswd (git-ignored).
# Uses openssl, so no extra packages are needed. Run  sh deploy/edge/site.sh enable <env>  (or prod-auth.sh on)
# afterwards if the edge is already running, so nginx picks the file up.
set -eu
# shellcheck source=_edge.sh
. "$(dirname -- "$0")/_edge.sh"

env=${1:-}
user=${2:-}
[ -n "$env" ] && [ -n "$user" ] || die "usage: $0 prod|staging <user>"
cert_name "$env" >/dev/null
case "$user" in *:*) die "user name must not contain ':'" ;; esac
command -v openssl >/dev/null || die "openssl is required (apt install openssl)"

stty -echo 2>/dev/null || true
printf 'Password for %s on %s: ' "$user" "$env"; read -r pass1; echo
printf 'Repeat password: '; read -r pass2; echo
stty echo 2>/dev/null || true
[ "$pass1" = "$pass2" ] || die "passwords do not match"
[ "${#pass1}" -ge 10 ] || die "use at least 10 characters"

mkdir -p "$EDGE_DIR/auth"
hash=$(printf '%s' "$pass1" | openssl passwd -apr1 -stdin)
printf '%s:%s\n' "$user" "$hash" > "$EDGE_DIR/auth/$env.htpasswd"
# Readable by the nginx worker inside the container; it holds a hash, not the password.
chmod 644 "$EDGE_DIR/auth/$env.htpasswd"
echo "wrote deploy/edge/auth/$env.htpasswd for user '$user'"
