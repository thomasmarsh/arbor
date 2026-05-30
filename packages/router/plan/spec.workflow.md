# Development Workflow

## Execution Order

Work through numbered plans in this sequence. Complete each fully (tests passing, typecheck clean) before starting the next.

### Current queue

```text
57 → 59 → 61 → 60 → 62
```

Plans 19–27, 32, 36, 38–39, 42–43, 46–47, 50, 53–56 are **complete**.
Plan 28 is **superseded** by plan 47 (FlattenChildrenImpl approach).

---

### Wave 0 — Foundation (complete)

Plans 19, 21, 25, 20, 27, 22, 26, 23 — phantom/runtime split, body validation,
section params, DI context, type-level tests, OpenAPI generator, status code normalization.

---

### Wave 1 — Diagnostics and type machinery (complete)

```text
42 ✓  46 ✓  47 ✓  43 ✓
```

- **42**: ✓ Edge case tests.
- **46**: ✓ Depth-counter spike (`FlattenChildrenImpl`).
- **47**: ✓ Removed `_child` phantom via `FlattenChildrenImpl`.
- **43**: ✓ Inference depth benchmark.

---

### Wave 2 — API contract surface (complete)

```text
31 ✓  48 ✓  29/30 (typed headers — not yet started)
35 (multipart — not yet started)
```

- **31**: ✓ Typed HTTP client spike.
- **48**: ✓ Typed HTTP client — options API, `HttpResponseUnion`, subpath exports.
- **29/30**: Typed response/request headers. Not yet started.
- **35**: Multipart/streaming body parsing. Not yet started.

---

### Wave 3 — Infrastructure layer (complete)

```text
49 ✓  50 ✓  45 ✓  36 ✓  38 ✓  39 ✓  32 ✓
```

- **49**: ✓ Handler enrichers spike.
- **50**: ✓ Published enrichers API.
- **45**: ✓ Pluggable error mapping.
- **36**: ✓ Per-route rate limiting enricher.
- **38**: ✓ CORS/CSRF server wrapper.
- **39**: ✓ JWT/session authentication enricher.
- **32**: ✓ Cookie handling.
- **37**: Telemetry/metrics enricher. Not yet started.
- **33/34/40**: Per-route CORS, API key auth, RBAC. Not yet started.

---

### Wave 4 — Context layer cleanup (complete)

```text
53 ✓  54 ✓  55 ✓  56 ✓
```

- **53**: ✓ RouteCtx moved to plugins.
- **54**: ✓ RouteCtx removed via ctx param.
- **55**: ✓ `_ctx`/`Ctx` renamed to `_meta`/`Meta`.
- **56**: ✓ Core decoupled from HTTP context layer.

---

### Wave 5 — Structural health (current)

```text
57 → 59 → 61 → 60 → 62
```

- **57**: Rename `Enricher` → `Guard`; resolve Result overlap. **Next in queue.**
- **59**: Decompose `walkParse` god function; unify walk boilerplate across `walkCollect`,
  `walkPrint`, `buildMethodMap`, `buildResponseSchemaMap`.
- **61**: Type the `_meta` bag — eliminate `as HttpContextData` / `as OpenApiCtxData`
  casts by narrowing `WalkNode` per context layer. Can run parallel to 59.
- **60**: Decompose `createServer` god function into `validateInput`, `resolveHandler`,
  `validateResponse` steps, each returning typed `Result`.
- **62**: Unify `DispatchResult` / `HttpResponseUnion` / handler return into one
  `HttpResponse` type; add `respond(status, body)` helper to eliminate `status: N as const`.

See **plan 58** for the full prioritized smell inventory and rationale.

---

### Deferred

- **Plan 24** (TanStack bridge): Lives in `packages/router-tanstack` when undeferred. See Q4 + Q6.
- **Plans 29/30** (typed headers): Wave 2 remainder. Opens after wave 5 settles the response type shape (plan 62).
- **Plans 33/34/40** (per-route CORS, API key, RBAC): Wave 3 remainder.
- **Plan 35** (multipart): Wave 2 remainder.
- **Plan 37** (telemetry enricher): Wave 3 remainder.
- **Radix tree router** (spec.enhancements Phase 4): Not until a benchmark shows O(N) lookup is a real bottleneck.

---

## Phase Mapping (Plans → Roadmap)

| Plan | Roadmap item                                               |
| ---- | ---------------------------------------------------------- |
| 18   | Eliminate unjustified casts (done)                         |
| 19   | Phantom/runtime context split                              |
| 20   | Type-safe section params in `print()`                      |
| 21   | `Route extends { tag: string }` constraint                 |
| 22   | Server handler DI context (enhancements Ph.2 #1)           |
| 23   | OpenAPI spec generator (enhancements Ph.3 #1)              |
| 24   | TanStack bridge spike — DEFERRED                           |
| 25   | Server body validation and error boundary                  |
| 26   | Expand type-level test coverage                            |
| 27   | Normalize response status code types                       |
| 28   | Remove redundant `_child` phantom field                    |
| 29   | Typed response headers                                     |
| 30   | Typed request headers as contract                          |
| 31   | Typed HTTP API client — architecture spike                 |
| 32   | Cookie handling in contract (blocked on Q10)               |
| 33   | Per-route CORS policy override                             |
| 34   | API key authentication strategy                            |
| 35   | Multipart / streaming body parsing (roadmap S1)            |
| 36   | Per-route rate limiting (roadmap S2 part 1)                |
| 37   | Telemetry / metrics decorator (roadmap S2 part 2)          |
| 38   | CORS / CSRF server wrapper (roadmap SEC1)                  |
| 39   | JWT / session authentication contracts (roadmap SEC2)      |
| 40   | RBAC authorization (roadmap SEC3)                          |
| 41   | Examples directory                                         |
| 42   | Edge and corner case tests                                 |
| 43   | Type inference depth / complexity limits — spike           |
| 44   | ~~Type-safe middleware pipeline~~ — superseded by plan 49  |
| 45   | Pluggable error mapping engine (enhancements Ph.2 #3)      |
| 46   | Spike: restructure `Derive`/`ChildUnion` — ✓ done          |
| 47   | Remove `_child` phantom via depth-counter                  |
| 48   | Typed HTTP client: options API + headers + subpath exports |
| 49   | Spike: handler enrichers as middleware alt. — ✓ done       |
| 50   | Publish enrichers API; redirect plans 36–40 — ✓ done       |
| 51   | Spike: RouteCtx design — superseded by 53                  |
| 52   | Spike: openApiRoute wraps httpRoute — ✓ done               |
| 53   | RouteCtx move to plugins — ✓ done                          |
| 54   | RouteCtx removal via ctx param — ✓ done                    |
| 55   | Rename `_ctx`/`Ctx` to `_meta`/`Meta` — ✓ done            |
| 56   | Tech debt: core/ must not import from contexts/ — ✓ done   |
| 57   | Rename Enricher → Guard; resolve Result overlap            |
| 58   | Architectural smell assessment (reference backlog)         |
| 59   | Decompose walkParse; unify walk boilerplate                |
| 60   | Decompose createServer god function                        |
| 61   | Type the `_meta` bag; eliminate accessor casts             |
| 62   | Unify response types; add `respond()` helper               |

---

## TDD Workflow Per Plan

1. Read the plan. Understand the problem and the proposed change.
2. Write the failing test first (type-level with `expectTypeOf`, runtime with `expect`).
3. Run `pnpm test` — confirm it fails for the right reason.
4. Implement the minimum change to make it pass.
5. Run `pnpm test && pnpm typecheck && pnpm lint`.
6. Run `pnpm run examples`
7. Fix any failures before moving to the next plan.

## What "Complete" Means

A plan is complete when:

- All new behavior is tested
- No existing tests are broken
- All examples in `examples/` are brought up to date with code changes
- `pnpm test && pnpm typecheck && pnpm lint` passes clean
- `pnpm run examples` runs cleanly
- The plan file's CLAUDE.md entry is updated (status → complete)
