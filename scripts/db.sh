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
    until podman exec "$CONTAINER" pg_isready -U arbor -d arbor_dev -q; do
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
