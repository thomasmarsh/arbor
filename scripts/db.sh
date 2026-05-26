#!/usr/bin/env bash
set -euo pipefail

CONTAINER=arbor-postgres
VOLUME=arbor-postgres-data
IMAGE=postgres:16-alpine

case "${1:-}" in
  up)
    if podman container exists "$CONTAINER"; then
      podman start "$CONTAINER"
    else
      podman run -d \
        --name "$CONTAINER" \
        -v "$VOLUME":/var/lib/postgresql/data  \
        -e POSTGRES_DB=arbor_dev \
        -e POSTGRES_USER=arbor \
        -e POSTGRES_PASSWORD=arbor \
        -p 5433:5432 \
        "$IMAGE"
    fi

    echo "Waiting for postgres..."
    until podman exec "$CONTAINER" psql -U arbor -d arbor_dev -c "SELECT 1" -q &>/dev/null 2>&1; do
      sleep 1
    done
    echo "Postgres ready."
    ;;

  down)
    podman stop "$CONTAINER"
    ;;

  reset)
    podman rm -f "$CONTAINER" 2>/dev/null || true
    podman volume rm "$VOLUME" 2>/dev/null || true
    "$0" up
    ;;

  status)
    if podman container exists "$CONTAINER"; then
      STATUS=$(podman inspect "$CONTAINER" --format '{{.State.Status}}')
      echo "Container: $CONTAINER ($STATUS)"
      if [ "$STATUS" = "running" ]; then
        podman exec "$CONTAINER" psql -U arbor -d arbor_dev -c "
          SELECT name, applied_at FROM schema_migrations ORDER BY name;
        " 2>/dev/null || echo "No migrations table yet"
      fi
    else
      echo "Container: $CONTAINER (not found)"
    fi
    ;;

  *)
    echo "Usage: $0 {up|down|reset|status}"
    exit 1
    ;;
esac
