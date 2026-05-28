# Open Questions

Questions that require product or architectural decisions before the relevant
plan can proceed.

---

## Q1 — `print()` section params: phantom threading vs. weak fix?

**Relevant plan**: 20.print-section-params.md

Two options:

**a. Full phantom threading** — introduce a new phantom type `_sectionParams`
tracking required param keys. Gives a compile-time error when section params
are omitted. ~50–80 lines of type utilities.

**b. Weak fix** — change `print(route: Route)` to
`print(route: Route, sectionParams?: Record<string, string | number>)`. Removes
the `as any` from call sites but does not make omission a type error.

Which do you prefer? If (a), is this the right moment or should it be deferred
until after the server DI work (plan 22)?

---

## Q2 — Server DI context shape: flat or namespaced?

**Relevant plan**: 22.server-di-context.md

Two shapes for the unified handler `ctx`:

**a. Flat merge**
```typescript
handler: (ctx: { userId: string; page: number; name: string; req: Request }) => Response
```
Risk: param name collisions between path/query/body.

**b. Namespaced**
```typescript
handler: (ctx: { params: { userId: string }; query: { page: number }; body: { name: string }; req: Request }) => Response
```
No collision risk. Slightly more verbose at call sites.

Preference?

---

## Q3 — OpenAPI generator: router-level or node-level?

**Relevant plan**: 23.openapi-generator.md

The existing `generateSpec` test helper works at the single node level.
Should plan 23 extend that helper OR write a new top-level utility that walks
the full route tree and delegates to per-node logic?

The full-tree approach is more useful but requires plan 19 to land first
(cast-free `_ctx` access). OK to defer plan 23 until after plans 19–21?

---

## Q4 — TanStack bridge: separate package or in-repo?

**Relevant plan**: 24.spike-tanstack-bridge.md

If the bridge is viable, should it live in:

**a.** `packages/router` as an opt-in sub-path export (`@arbor/router/tanstack`)
**b.** A new package `packages/router-tanstack`

(a) keeps the monorepo simple. (b) avoids making `@tanstack/react-router` a
peer dep of every consumer of `@arbor/router`.
