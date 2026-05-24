# Arbo Monorepo

```
packages/
├── common      @arbo/common   — Zod schemas, shared types (UI ↔ API contract)
├── ui          @arbo/ui       — Vite + React SPA
├── bff         @arbo/bff      — Node BFF: OIDC session layer, proxies to API
├── api         @arbo/api      — Node API: pgtyped + Oracle
└── third_party               — Forked/pinned dependencies
```

## Prerequisites

- Node >= 22
- pnpm >= 9 (`npm i -g pnpm`)

## First-time setup

```bash
pnpm install
pnpm --filter @arbo/common build   # api/bff/ui all depend on this
```

## Development

```bash
# All packages in parallel (Turbo handles build order)
pnpm dev

# Individual packages
pnpm --filter @arbo/common dev
pnpm --filter @arbo/bff    dev     # http://localhost:3000
pnpm --filter @arbo/api    dev     # http://localhost:3001
pnpm --filter @arbo/ui     dev     # http://localhost:5173 (proxies /auth + /api → BFF)
```

## Auth in development

By default the BFF runs with `ARBO_AUTH_DISABLED=true` — no login required, a
fake session (`dev@localhost`) is injected automatically.

To test **real OIDC auth locally**:

1. Copy `packages/bff/.env.example` → `packages/bff/.env`
2. Fill in your IDP credentials and set `ARBO_AUTH_DISABLED=false`
3. Add a host alias so the IDP redirect URI resolves locally:
   ```
   # /etc/hosts
   127.0.0.1  arbo.local
   ```
4. Register `http://arbo.local:3000/auth/callback` as a redirect URI in your IDP
5. Set `ARBO_OIDC_REDIRECT_URI=http://arbo.local:3000/auth/callback` in `.env`
6. Visit `http://arbo.local:3000` (BFF serves UI in this mode via Vite proxy)

## Remote SSH development

Port forwarding is pre-configured in `arbo.code-workspace` (ports 5173, 3000, 3001).
VS Code's Remote SSH extension will forward them automatically when you open the workspace.

## Building for production

```bash
pnpm build
# Pod 1 artifact: packages/bff/dist  +  packages/ui/dist
# Pod 2 artifact: packages/api/dist
```

See deployment notes in each package for OpenShift pod configuration.

## Typecheck all packages

```bash
pnpm typecheck
```

## Lint

```bash
pnpm lint
```
