#!/bin/sh
# Certbot deploy hook: reloads the edge proxy after a certificate is renewed, so nginx serves the new one.
# Install once (DEPLOY.md, certificates):
#   sudo install -m 755 /opt/lumiere/deploy/edge/certbot-deploy-hook.sh /etc/letsencrypt/renewal-hooks/deploy/reload-lumiere-edge.sh
# Renewals run in --webroot mode through the edge, so they need no downtime.
set -eu
EDGE_DIR=${EDGE_DIR:-/opt/lumiere/deploy/edge}
if [ -f "$EDGE_DIR/.env" ]; then
  docker compose -f "$EDGE_DIR/compose.yml" --env-file "$EDGE_DIR/.env" exec -T nginx nginx -s reload
else
  docker compose -f "$EDGE_DIR/compose.yml" exec -T nginx nginx -s reload
fi
echo "lumiere edge reloaded after certificate renewal: ${RENEWED_DOMAINS:-}"
