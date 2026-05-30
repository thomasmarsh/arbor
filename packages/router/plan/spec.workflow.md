# Development Workflow

## Execution Order

Work through numbered plans in this sequence. Complete each fully (tests passing, typecheck clean) before starting the next.

Prioritization criteria (in order):

1. **Impact** — genuinely useful to users of the library
2. **Foundational** — hard to retrofit later, or unlocks a cluster of future work
3. **Correctness testing** — enables contract testing, property-based testing, or fuzz testing

Novel features with large dependencies or non-obvious ergonomics must be **opt-in, pay-for-what-you-use**. Spikes produce only updated plans or notes — no shipping code until the theory is validated.

### Current queue

```text
65 → 67 → 69 → 68 → 71 → 73 → 72 → 75 → 76 → 77 → 63 → 64 → 66 → 78 → 79 → 80 → 81
```

---

### Wave 0 — Foundation (complete)

Plans 19, 21, 25, 20, 27, 22, 26, 23 — phantom/runtime split, body validation,
section params, DI context, type-level tests, OpenAPI generator, status code normalization.

---

### Wave 1 — Diagnostics and type machinery (complete)

- **42** ✓ Edge case tests
- **46** ✓ Depth-counter spike (`FlattenChildrenImpl`)
- **47** ✓ Removed `_child` phantom via `FlattenChildrenImpl`
- **43** ✓ Inference depth benchmark

---

### Wave 2 — API contract surface (complete)

- **31** ✓ Typed HTTP client spike
- **48** ✓ Typed HTTP client — options API, `HttpResponseUnion`, subpath exports
- **29** ✓ Typed response headers
- **30** ✓ Typed request headers
- **35** ✓ Multipart / streaming body parsing

---

### Wave 3 — Infrastructure layer (complete)

- **49** ✓ Handler enrichers spike
- **50** ✓ Published enrichers API
- **45** ✓ Pluggable error mapping
- **36** ✓ Per-route rate limiting
- **33** ✓ Per-route CORS policy override
- **38** ✓ CORS / CSRF server wrapper
- **39** ✓ JWT / session authentication
- **32** ✓ Cookie handling
- **34** ✓ API key authentication
- **40** ✓ RBAC authorization
- **37** ✓ Telemetry / metrics decorator

---

### Wave 4 — Context layer cleanup (complete)

- **53** ✓ RouteCtx moved to plugins
- **54** ✓ RouteCtx removed via ctx param
- **55** ✓ `_ctx`/`Ctx` renamed to `_meta`/`Meta`
- **56** ✓ Core decoupled from HTTP context layer

---

### Wave 5 — Structural health (complete)

- **57** ✓ Rename `Enricher` → `Guard`; resolve Result overlap
- **59** ✓ Decompose `walkParse` god function; unify walk boilerplate
- **61** ✓ Type the `_meta` bag — eliminate accessor casts
- **60** ✓ Decompose `createServer` god function
- **62** ✓ Unify response types; add `respond()` helper

See **plan 58** for the full prioritized smell inventory.

---

### Wave 6 — Structural cleanup (current)

- **65**: Barrel cleanup + missing root exports (`ParseDiag`, `HandlerCtx`). Zero risk, standalone. **Next.**
- **63**: Decompose `walkSpec()` (112-line function); remove spurious `generateSpec` re-export from `openapi-context.ts`.
- **64**: Fix `openApiRoute()` cast-and-mutate pattern.
- **66**: Extract rate-limit check from `executeRoute()` into named helper.

---

### Wave 7 — Segment correctness

- **67**: Fix `num`/`opt-num` to reject non-integers (`parseInt` + round-trip check). Tiny, isolated.
- **69**: Enforce optional segment ordering at definition time (throw if `opt-str`/`opt-num` precedes required segment).
- **68**: Change wildcard capture from `string[]` to `string`. Breaking change — do after 69 stabilises segment semantics.

---

### Wave 8 — Feature completeness

- **71**: Type-level method/body safety — GET/HEAD/DELETE cannot carry a `body` option.
- **73**: Include `Allow` header in 405 responses (RFC 7231 §6.5.5).
- **72**: `createTestClient` — in-memory server + typed client bundled for test use.

---

### Wave 9 — Client correctness and testing foundation

- **75**: `matchResponse` exhaustive combinator — compile-time error for unhandled status
  codes. Client-side mirror of `switch(route.tag)` exhaustiveness. Enables correctness
  testing; pairs with `createTestClient`.

---

### Wave 10 — Ergonomics (foundational for adoption)

- **76**: `.use()` fluent builder + `pipeline()` — left-to-right guard composition. Same
  types as nested factories; transition path for Express/Hono teams. Foundational: sets
  the ergonomic surface that later plans build on.
- **77**: Declarative `requires` annotation on `httpRoute` — `requires: ['admin']` as
  shorthand for `withSession + withRbac`. Stepping stone toward the capability system
  (Plan 80).

---

### Wave 11 — Infrastructure cleanup

- **63**: Decompose `walkSpec()` (112-line function); remove spurious `generateSpec`
  re-export from `openapi-context.ts`.
- **64**: Fix `openApiRoute()` cast-and-mutate pattern.
- **66**: Extract rate-limit logic from `executeRoute()` into named helper.

---

### Wave 12 — Handler ergonomics

- **78**: `IntoResponse` — handlers may return domain objects directly on single-status
  routes; `respond()` becomes optional for the common case.

---

### Wave 13 — Testing automation

- **79**: Property-based / fuzz testing from Zod schemas (`@arbor/router-test` package).
  Generates arbitrary valid inputs, fires them through `createTestClient`, asserts
  responses match declared schemas. Depends on Plans 72 + 75.

---

### Wave 14 — Architecture spikes

- **80**: Spike — typed DIY capability / environment system. Validates whether
  TypeScript's type system alone can model service injection + capability proof without
  Effect-TS. Output: updated plan(s) or NOTES.md entry; no shipping code.
- **81**: Default handler supervision (let-it-crash safety net). Uncaught handler errors
  → 500 + `onError` callback. Opt-out via `{ supervise: false }`.

---

### Deferred / low priority

- **Plan 70**: Pattern/regex segment kind (`~name:regex`). Enhancement; do after segment correctness wave (67–69) settles.
- **Plan 74**: Radix tree router spike. Benchmark first; implement only if O(N) is measurable in real workloads.
- **Plan 24**: TanStack bridge. Lives in `packages/router-tanstack` when undeferred. See Q4 + Q6.

---

### Out of scope for this package

Items from `spec.roadmap.md` Phases C1–C3 (parallel loaders, lifecycle tracking, query
parameter inheritance) describe a browser-side navigation runtime. They belong in a
separate package (e.g., `packages/router-browser` or `packages/router-tanstack`), not in
`@arbor/router` which is runtime-agnostic.

The E2E property-test rig (`spec.enhancements.md` Phase 3 #3) is a CI / developer tooling
concern. No plan is created until the feature surface stabilises.

---

## Phase Mapping (Plans → Roadmap)

| Plan | Roadmap item |
| ---- | ------------ |
| 18 | Eliminate unjustified casts ✓ |
| 19 | Phantom/runtime context split ✓ |
| 20 | Type-safe section params in `print()` ✓ |
| 21 | `Route extends { tag: string }` constraint ✓ |
| 22 | Server handler DI context ✓ |
| 23 | OpenAPI spec generator ✓ |
| 24 | TanStack bridge spike — DEFERRED |
| 25 | Server body validation and error boundary ✓ |
| 26 | Expand type-level test coverage ✓ |
| 27 | Normalize response status code types ✓ |
| 28 | Remove redundant `_child` phantom — SUPERSEDED by 47 |
| 29 | Typed response headers ✓ |
| 30 | Typed request headers ✓ |
| 31 | Typed HTTP API client — architecture spike ✓ |
| 32 | Cookie handling ✓ |
| 33 | Per-route CORS policy override ✓ |
| 34 | API key authentication ✓ |
| 35 | Multipart / streaming body parsing ✓ |
| 36 | Per-route rate limiting ✓ |
| 37 | Telemetry / metrics decorator ✓ |
| 38 | CORS / CSRF server wrapper ✓ |
| 39 | JWT / session authentication ✓ |
| 40 | RBAC authorization ✓ |
| 41 | Examples directory ✓ |
| 42 | Edge and corner case tests ✓ |
| 43 | Type inference depth / complexity limits — spike ✓ |
| 44 | ~~Type-safe middleware pipeline~~ — SUPERSEDED by 49 |
| 45 | Pluggable error mapping engine ✓ |
| 46 | Spike: restructure `Derive`/`ChildUnion` ✓ |
| 47 | Remove `_child` phantom via depth-counter ✓ |
| 48 | Typed HTTP client: options API + headers ✓ |
| 49 | Spike: handler enrichers as middleware alt. ✓ |
| 50 | Publish enrichers API ✓ |
| 51 | ~~Spike: RouteCtx design~~ — SUPERSEDED by 53 |
| 52 | Spike: openApiRoute wraps httpRoute ✓ |
| 53 | RouteCtx move to plugins ✓ |
| 54 | RouteCtx removal via ctx param ✓ |
| 55 | Rename `_ctx`/`Ctx` to `_meta`/`Meta` ✓ |
| 56 | Tech debt: core/ must not import from contexts/ ✓ |
| 57 | Rename Enricher → Guard; resolve Result overlap ✓ |
| 58 | Architectural smell assessment (reference backlog) |
| 59 | Decompose walkParse; unify walk boilerplate ✓ |
| 60 | Decompose createServer god function ✓ |
| 61 | Type the `_meta` bag; eliminate accessor casts ✓ |
| 62 | Unify response types; add `respond()` helper ✓ |
| 63 | Decompose `walkSpec()`; fix `generateSpec` re-export |
| 64 | Fix `openApiRoute()` cast-and-mutate |
| 65 | Barrel cleanup; add `ParseDiag`/`HandlerCtx` to root exports |
| 66 | Extract rate-limit logic from `executeRoute()` |
| 67 | Fix `num`/`opt-num` to reject non-integers |
| 68 | Wildcard captures `string` not `string[]` |
| 69 | Enforce optional segment ordering at definition time |
| 70 | Pattern/regex segment kind (LOW) |
| 71 | Method/body type safety — GET/HEAD/DELETE cannot have body |
| 72 | `createTestClient` in-memory test utility |
| 73 | Include `Allow` header in 405 responses |
| 74 | Radix tree router spike (LOW — benchmark-gated) |
| 75 | `matchResponse` exhaustive combinator |
| 76 | `.use()` fluent builder + `pipeline()` combinator |
| 77 | Declarative `requires` annotation on `httpRoute` |
| 78 | `IntoResponse` — direct domain object return from handlers |
| 79 | Property-based / fuzz testing from Zod schemas (`@arbor/router-test`) |
| 80 | Spike — typed DIY capability / environment system |
| 81 | Default handler supervision (let-it-crash safety net) |

---

## TDD Workflow Per Plan

1. Read the plan. Understand the problem and the proposed change.
2. Write the failing test first (`expectTypeOf` for type-level, `expect` for runtime).
3. Run `pnpm test` — confirm it fails for the right reason.
4. Implement the minimum change to make it pass.
5. Run `pnpm test && pnpm typecheck && pnpm lint`.
6. Run `pnpm run examples`.
7. Fix any failures before moving to the next plan.

## What "Complete" Means

A plan is complete when:

- All new behavior is tested
- No existing tests are broken
- All examples in `examples/` are brought up to date with code changes
- `pnpm test && pnpm typecheck && pnpm lint` passes clean
- `pnpm run examples` runs cleanly
- The plan file is renamed to `N.DONE.topic.md` and CLAUDE.md is updated
