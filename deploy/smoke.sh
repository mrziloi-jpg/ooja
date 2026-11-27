#!/bin/sh
# Checks that every page in the verify list returns 200 through the edge, for one environment.
#   sh deploy/smoke.sh staging
# While the site is behind basic auth, put "user:password" in <env dir>/.smoke-auth (chmod 600).
set -eu
# shellcheck source=lib.sh
. "$(dirname -- "$0")/lib.sh"
[ $# -ge 1 ] || die "usage: $0 prod|staging"
env_resolve "$1"
smoke
