#!/usr/bin/env bash
set -euo pipefail

CONTAINER=arbor-postgres
VOLUME=arbor-postgres-data
IMAGE=postgres:16-alpine

# Parse connection details from ARBOR_PG_URL if set
# Expected format: postgresql://user:password@host:port/dbname
if [ -n "${ARBOR_PG_URL:-}" ]; then
  DB_USER=$(node -e "console.log(new URL('$ARBOR_PG_URL').username)")
  DB_PASS=$(node -e "console.log(new URL('$ARBOR_PG_URL').password)")
  DB_PORT=$(node -e "console.log(new URL('$ARBOR_PG_URL').port)")
  DB_NAME=$(node -e "console.log(new URL('$ARBOR_PG_URL').pathname.slice(1))")
else
  DB_USER=arbor
  DB_PASS=arbor
  DB_PORT=5433
  DB_NAME=arbor_dev
fi

case "${1:-}" in
  up)
    if podman container exists "$CONTAINER"; then
      podman start "$CONTAINER"
    else
      podman run -d \
        --name "$CONTAINER" \
        -v "$VOLUME":/var/lib/postgresql/data \
        -e POSTGRES_DB="$DB_NAME" \
        -e POSTGRES_USER="$DB_USER" \
        -e POSTGRES_PASSWORD="$DB_PASS" \
        -p "${DB_PORT}:5432" \
        "$IMAGE"
    fi

    echo "Waiting for postgres..."
    until podman exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" -q &>/dev/null 2>&1; do
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
        podman exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
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