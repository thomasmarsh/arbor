# Roadmap

## Architectural Mandate

`@arbor/router` is a runtime-agnostic URL router with full TypeScript type inference — no codegen required. The route type is a nested discriminated union built from phantom types; handlers receive a fully typed context derived entirely from the route tree definition.

**Invariants that must never be violated:**

- Consume and emit only **WinterCG web-standard primitives** (`Request`, `Response`, `FormData`, `URLSearchParams`). No platform-specific imports in `core/` or `server/`.
- Implicit middleware arrays are forbidden. Cross-cutting concerns are handled via **Higher-Order Route Factories** (compile-time schema mutation) and **Guard decorators** (runtime wrap).
- `core/` must not import from `contexts/` or `server/`. Dependency flow is strictly one-way: `core → contexts → server`.

---

## In Scope

Active work is tracked numerically in `plan/work-order.md`. Current target areas:

| Area | Plans | Status |
|---|---|---|
| Segment correctness (int-only num, optional ordering, wildcard as string) | 67, 69, 68 | queued |
| Feature completeness (method/body safety, Allow header, test client) | 71, 73, 72 | queued |
| Client correctness (`matchResponse` combinator) | 75 | queued |
| Ergonomics (`use()` builder, declarative `requires`) | 76, 77 | queued |
| Handler ergonomics (`IntoResponse`) | 78 | queued |
| Structural cleanup (barrel, OpenAPI decompose, rate-limit decouple) | 65, 63, 64, 66 | queued |
| Testing automation (property-based, fuzz) | 79 | queued |
| Architecture spikes (capability system, radix tree, handler supervision) | 80, 74, 81 | deferred/spike |

---

## Out of Scope for This Package

These items require a separate package and must not be implemented in `@arbor/router`:

- **Browser-side navigation runtime** — parallel loaders, pending/error lifecycle states, query-param inheritance across navigations. Belongs in `packages/router-browser` or `packages/router-tanstack`.
- **TanStack Router bridge** — `adaptToTanStackTree` adapter. Lives in `packages/router-tanstack` when undeferred (see `plan/spec.tanstack-bridge.md`). Blocked until Plans 63–77 stabilise the API surface.
- **E2E integration test rig** — fires malformed inputs at a live server. A CI/developer tooling concern; no plan until the feature surface stabilises.

---

## Deferred (benchmark- or dependency-gated)

- **Plan 70** — Pattern/regex segment kind (`~name:regex`). Do after segment correctness wave (67–69) settles.
- **Plan 74** — Radix tree router. Benchmark O(N) against real workloads first; implement only if measurable.
- **Plan 24** — TanStack bridge. Separate package; unblocked after API surface stabilises.

---

## Long-Horizon Directions

These are not yet planned but have been identified as valuable:

- **Typed capability / environment system** (Plan 80 spike) — model service injection and capability proofs in TypeScript's type system without Effect-TS.
- **`@arbor/router-test` package** — property-based testing from Zod schemas using `createTestClient`; generates arbitrary valid inputs and asserts responses match declared schemas.
- **TypeScript compiler performance** — as route trees grow, benchmark and simplify utility types to keep IDE autocomplete snappy. Plan 43 established the baseline; revisit when trees exceed ~50 routes.
