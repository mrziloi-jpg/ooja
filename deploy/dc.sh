#!/bin/sh
# docker compose for one environment, with the right project name, files and env files.
#   sh deploy/dc.sh prod ps
#   sh deploy/dc.sh staging logs -f app
#   sh deploy/dc.sh prod exec db psql -U lumiere
set -eu
# shellcheck source=lib.sh
. "$(dirname -- "$0")/lib.sh"
[ $# -ge 1 ] || die "usage: $0 prod|staging <docker compose arguments>"
env_resolve "$1"
shift
dc "$@"
