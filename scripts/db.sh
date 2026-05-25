#!/usr/bin/env bash
set -euo pipefail

CONTAINER=arbo-postgres
VOLUME=arbo-postgres-data
IMAGE=postgres:16-alpine

case "${1:-}" in
  up)
    if podman container exists "$CONTAINER"; then
      podman start "$CONTAINER"
    else
      podman run -d \
        --name "$CONTAINER" \
        -e POSTGRES_DB=arbo_dev \
        -e POSTGRES_USER=arbo \
        -e POSTGRES_PASSWORD=arbo \
        -p 5433:5432 \
        "$IMAGE"
    fi

    echo "Waiting for postgres..."
    until podman exec "$CONTAINER" pg_isready -U arbo -d arbo_dev -q; do
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

  *)
    echo "Usage: $0 {up|down|reset}"
    exit 1
    ;;
esac
