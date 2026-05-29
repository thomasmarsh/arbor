# Open Questions

Questions that require product or architectural decisions before the relevant
plan can proceed.

All questions below are **resolved**. Decisions are recorded here for
traceability; see the relevant plan files for how they are applied.

---

## Q1 — `print()` section params: phantom threading vs. weak fix? ✓

**Resolution**: Full phantom threading (option a). Omitting a required section
param must be a compile-time error. Weak fix rejected.
**See**: 20.print-section-params.md

---

## Q2 — Server DI context shape: flat or namespaced? ✓

**Resolution**: Namespaced (option b) — `{ params, body, query, req }`.
Verbosity at call sites accepted; can revisit if it becomes a problem.
**See**: 22.server-di-context.md

---

## Q3 — OpenAPI generator: router-level or node-level? ✓

**Resolution**: Full-tree approach. A single `generateSpec(router)` walks the
complete route tree. Deferred until plan 19 lands.
**See**: 23.openapi-generator.md

---

## Q4 — TanStack bridge: separate package or in-repo? ✓

**Resolution**: Separate package (`packages/router-tanstack`) if/when the
work is undeferred. Work is currently deprioritized (see Q6).
**See**: 24.spike-tanstack-bridge.md

---

## Q5 — Plan 22 scope: include body validation or keep it separate? ✓

**Resolution**: Keep separate. Plan 25 (body validation + error boundary)
lands first; plan 22 (DI refactor) builds on that foundation. Smaller diffs
preferred.
**See**: 25.server-validation-error-boundary.md, 22.server-di-context.md

---

## Q6 — TanStack bridge priority: now or after runtime safety is solid? ✓

**Resolution**: Deferred. Do not start until plans 19–27 are complete.
TanStack work is additive; the runtime safety floor comes first.
**See**: 24.spike-tanstack-bridge.md

---

## Q7 — Remove the `_child` phantom field? ✓

**Resolution**: Yes, remove it. Own plan (28), done after plan 19 since both
touch `RouteNode`. Prefer more small plans over fewer large ones.
**See**: 28.remove-child-phantom.md

---

## Q8 — Typed client: separate package or integrated? (open)

**Plan 31 spike** must answer this before any client SDK implementation starts.

**Q8a — Package boundary**: Does the typed client live as an export of
`@arbor/router` (simpler, but risks pulling server code into browser bundles)
or in a dedicated `@arbor/router-client` package?

**Q8b — Generation strategy**: Does the client derive its types directly from
`RouteNode` / `ServerHandlers` (tighter inference, coupled to internals), or
from the OpenAPI JSON output (more portable, enables third-party spec interop)?

**See**: 31.spike-typed-client.md

---

## Q9 — Header typing: new `RouteNode` field or extend the context type parameter? (open)

Plans 29 and 30 need to add request and response header schemas to the route
contract. Two options:

**a) New dedicated fields** on the route factory (`headers`, `responseHeaders`)
alongside `schema` and `query` — explicit, easy to read, adds fields to
`RouteNode`.

**b) Extend the `Context` type parameter** — keeps `RouteNode`'s field count
stable but makes the contract shape less obvious to readers.

The `Context` parameter is currently used for runtime data (auth markers,
etc.). Mixing schema declarations in there may muddy its purpose.

**See**: 29.typed-response-headers.md, 30.typed-request-headers.md

---

## Q10 — Cookie handling: WinterCG `CookieStore` vs. custom abstraction? (open)

Plan 32 needs to extract cookies from the request. Two options:

**a) WinterCG `CookieStore` API** — standard, zero-dependency, but not
available in all WinterCG-compatible runtimes yet (notably Node.js < 22
without a polyfill).

**b) Parse the `Cookie` header string directly** with a small utility — more
portable, no polyfill needed, trivially testable.

Decision affects whether we add a polyfill dependency or accept the runtime
compatibility constraint.

**See**: 32.cookie-handling.md

---

## Q11 — Examples directory: co-located or top-level monorepo? (open)

Plan 41 proposes `packages/router/examples/`. Two options:

**a) Co-located** (`packages/router/examples/`) — simple, no extra package,
examples import directly from `../src` without a publish step.

**b) Top-level monorepo** (`examples/router/`) — consistent with how many
monorepos organize user-facing demos; easier to grow into a docs site later.

Resolved decision should be recorded before plan 41 begins.

**See**: 41.examples-directory.md
