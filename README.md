# Arbor Project

`packages/` the code is organized as follows.

| Directory      | Package Name    | Purpose                                       |
| -------------- | --------------- | --------------------------------------------- |
| `common/`      | `@arbor/common` | Zod schemas, shared types (UI ↔ API contract) |
| `ui/`          | `@arbor/ui`     | Vite + React SPA                              |
| `bff/`         | `@arbor/bff`    | Node BFF: OIDC session layer, proxies to API  |
| `api/`         | `@arbor/api`    | Node API: pgtyped + Oracle                    |
| `third_party/` |                 | Forked/pinned dependencies                    |

## Prerequisites

- Node >= 22
- pnpm >= 9 (`npm i -g pnpm`)
- podman or docker (for local Keycloak)

## First-time setup

```bash
pnpm install
pnpm --filter @arbor/common build   # api/bff/ui all depend on this
```

## Auth modes

Three auth modes are available via profile scripts:

| Script          | Auth mode | BFF auth | Use when                               |
| --------------- | --------- | -------- | -------------------------------------- |
| `pnpm dev:mock` | mock      | disabled | Day-to-day development, no auth needed |
| `pnpm dev:bff`  | bff       | enabled  | Testing full BFF + OIDC flow locally   |
| `pnpm dev:oidc` | oidc      | disabled | Testing browser-side OIDC flow         |

## Development

```bash
# Mock mode - fastest, no auth, no Keycloak needed
pnpm dev:mock

# BFF mode - full auth flow via local Keycloak
pnpm dev:bff

# Individual packages
pnpm --filter @arbor/common dev
pnpm --filter @arbor/bff    dev     # http://localhost:3000
pnpm --filter @arbor/api    dev     # http://localhost:3001
pnpm --filter @arbor/ui     dev     # http://localhost:5173
```

## Local Keycloak (dev:bff and dev:oidc)

```bash
docker run -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:latest \
  start-dev
```

Then:

1. Create realm `arbor`
2. Create confidential client `arbor-bff` (for `dev:bff`)
3. Create public client `arbor-ui` (for `dev:oidc`)
4. Create a test user with a password
5. Copy `packages/bff/.env.example` → `packages/bff/.env.local` and fill in credentials

## HTTPS setup (dev:staging only)

Required once per machine:

```bash
brew install mkcert
mkcert -install
mkcert -cert-file certs/localhost+2.pem -key-file certs/localhost+2-key.pem localhost 127.0.0.1 ::1
```

## Secrets setup

Each package has a `.env.example` - copy to `.env.local` and fill in:

```bash
cp packages/bff/.env.example packages/bff/.env.local
cp packages/api/.env.example packages/api/.env.local
```

## Testing

```bash
# All packages
pnpm test

# No cache
turbo test --force
# or
pnpm -r test

# Watch mode (per package)
pnpm --filter @arbor/bff test:watch
```

## Remote SSH development

Port forwarding is pre-configured in `arbor.code-workspace` (ports 5173, 3000, 3001).
VS Code's Remote SSH extension will forward them automatically when you open the workspace.

## Building for production

```bash
pnpm build
# Pod 1 artifact: packages/bff/dist + packages/ui/dist
# Pod 2 artifact: packages/api/dist
```

Deploy via Kustomize:

```bash
oc apply -k deploy/overlays/dev
oc apply -k deploy/overlays/eval
oc apply -k deploy/overlays/prod
```

For more details, see [DEPLOY.md](DEPLOY.md)

## Typecheck all packages

```bash
pnpm typecheck
```

## Lint

```bash
pnpm lint
```
