# Arbor

[![CI](https://github.com/thomasmarsh/arbor/actions/workflows/ci.yml/badge.svg)](https://github.com/thomasmarsh/arbor/actions/workflows/ci.yml)

Arbor is a TypeScript monorepo with two distinct layers:

- **`framework/`** — `@arbor/router`, a typed protocol framework for building HTTP APIs, typed SSE streams, and WebSocket channels without codegen. See [FEATURES.md](FEATURES.md) and [BROWSER.md](BROWSER.md).
- **`apps/`** — a production full-stack web application (React SPA, Node BFF with OIDC, Node API with PostgreSQL/Oracle) deployed on OpenShift. See [DEPLOY.md](DEPLOY.md).

---

## Workspace

| Directory                  | Package                 | Purpose                                                                            |
| -------------------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| `framework/router`         | `@arbor/router`         | Typed protocol framework — URL parse/print, HTTP dispatch, SSE, WebSocket, OpenAPI |
| `framework/router-browser` | `@arbor/router-browser` | Browser History API adapter (in development)                                       |
| `framework/router-test`    | `@arbor/router-test`    | Property-based test harness for `@arbor/router`                                    |
| `framework/common`         | `@arbor/common`         | Shared primitives — `Result<T>`, `Effect<T>`, `Store / Reducer`                    |
| `apps/api`                 | `@arbor/api`            | Node API: PostgreSQL + Oracle data layer                                           |
| `apps/bff`                 | `@arbor/bff`            | Node BFF: OIDC session layer, proxies to API                                       |
| `apps/ui`                  | `@arbor/ui`             | Vite + React SPA                                                                   |
| `apps/common`              | `@arbor/app-common`     | Shared application types and Zod schemas (UI ↔ API contract)                       |

---

## Prerequisites

- Node >= 22
- pnpm >= 9 (`npm i -g pnpm`)
- podman or docker (for local Postgres and Keycloak)

## First-time setup

```bash
pnpm setup
```

Follow the instructions after the script exits.

---

## Development

Three auth modes are available:

| Script          | Auth mode | BFF auth | Use when                               |
| --------------- | --------- | -------- | -------------------------------------- |
| `pnpm dev:mock` | mock      | disabled | Day-to-day development, no auth needed |
| `pnpm dev:bff`  | bff       | enabled  | Testing full BFF + OIDC flow locally   |
| `pnpm dev:oidc` | oidc      | disabled | Testing browser-side OIDC flow         |

```bash
# Fastest, no auth, no Keycloak needed
pnpm dev:mock

# Full auth flow via local Keycloak
pnpm dev:bff

# Individual packages
pnpm --filter @arbor/bff    dev     # http://localhost:3000
pnpm --filter @arbor/api    dev     # http://localhost:3001
pnpm --filter @arbor/ui     dev     # http://localhost:5173
```

---

## Testing

```bash
pnpm test            # all packages
pnpm typecheck       # type-check all packages
pnpm lint            # ESLint across framework/ and apps/

# Framework only
pnpm --filter @arbor/router test
pnpm --filter @arbor/router typecheck

# Watch mode
pnpm --filter @arbor/bff test:watch
```

---

## Build

```bash
pnpm build
# Pod 1 artifact: apps/bff/dist + apps/ui/dist
# Pod 2 artifact: apps/api/dist
```

---

## Local Keycloak (`dev:bff` and `dev:oidc`)

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
5. Copy `apps/bff/.env.example` → `apps/bff/.env.local` and fill in credentials

---

## Remote SSH development

Port forwarding is pre-configured in `arbor.code-workspace` (ports 5173, 3000, 3001). VS Code's Remote SSH extension forwards them automatically when you open the workspace.

---

## Further reading

| Document                   | Contents                                                             |
| -------------------------- | -------------------------------------------------------------------- |
| [FEATURES.md](FEATURES.md) | `@arbor/router` features, framework comparison, roadmap              |
| [BROWSER.md](BROWSER.md)   | Browser integration plan — `@arbor/router-browser`, React hooks, SSR |
| [DEPLOY.md](DEPLOY.md)     | OpenShift deployment, secrets management, image builds               |
