#!/usr/bin/env bash
set -euo pipefail

create_env() {
  local path="$1"
  local contents="$2"

  if [[ -f "$path" ]]; then
    echo "skipped  $path (already exists)"
    return
  fi

  echo "$contents" > "$path"
  echo "created  $path"
}

SESSION_SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")

create_env packages/api/.env.local "\
ARBOR_PG_URL=postgresql://arbor:arbor@localhost:5433/arbor_dev
ARBOR_ORACLE_USER=user
ARBOR_ORACLE_PASSWORD=password
ARBOR_ORACLE_CONNECT_STRING=localhost:1521/XEPDB1
API_PORT=3001"

create_env packages/bff/.env.local "\
# OIDC credentials — only needed for dev:bff, not dev:mock
ARBOR_OIDC_ISSUER=http://localhost:8080/realms/arbor
ARBOR_OIDC_CLIENT_ID=arbor-bff
ARBOR_OIDC_CLIENT_SECRET=
ARBOR_OIDC_REDIRECT_URI=http://localhost:3000/auth/callback
ARBOR_SESSION_SECRET=${SESSION_SECRET}
ARBOR_API_URL=http://localhost:3001
NODE_ENV=development
BFF_PORT=3000"

create_env packages/bff/.env.staging.local "\
# Fill in real staging credentials before using dev:staging
ARBOR_OIDC_ISSUER=https://your-idp.example.com/realms/arbor
ARBOR_OIDC_CLIENT_ID=arbor-bff-staging
ARBOR_OIDC_CLIENT_SECRET=
ARBOR_OIDC_REDIRECT_URI=https://localhost:3000/auth/callback
ARBOR_SESSION_SECRET=${SESSION_SECRET}
ARBOR_API_URL=http://localhost:3001"

echo 
echo "Done."
echo 
echo "To get started:"
echo 
echo "  pnpm install"
echo "  pnpm db:reset     # set up db"
echo "  pnpm db:generate  # codegen pgtype queries"
echo "  pnpm build        # compile"
echo "  pnpm dev:mock     # run stack"
