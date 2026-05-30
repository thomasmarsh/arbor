# Work Order

Operational execution list. See `plan/workflow.md` for workflow rules and completion criteria.

## Current Queue

```text
67 → 82 → 83 → 69 → 68 → 84 → 71 → 73 → 72 → 85 → 75 → 76 → 77 → 63 → 64 → 66 → 78 → 79 → 80 → 81 → 86
```

---

## Wave History

### Wave 0 — Foundation (complete)

Plans 19, 21, 25, 20, 27, 22, 26, 23 — phantom/runtime split, body validation,
section params, DI context, type-level tests, OpenAPI generator, status code normalization.

### Wave 1 — Diagnostics and type machinery (complete)

- **42** ✓ Edge case tests
- **46** ✓ Depth-counter spike (`FlattenChildrenImpl`)
- **47** ✓ Removed `_child` phantom via `FlattenChildrenImpl`
- **43** ✓ Inference depth benchmark

### Wave 2 — API contract surface (complete)

- **31** ✓ Typed HTTP client spike
- **48** ✓ Typed HTTP client — options API, `HttpResponseUnion`, subpath exports
- **29** ✓ Typed response headers
- **30** ✓ Typed request headers
- **35** ✓ Multipart / streaming body parsing

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

### Wave 4 — Context layer cleanup (complete)

- **53** ✓ RouteCtx moved to plugins
- **54** ✓ RouteCtx removed via ctx param
- **55** ✓ `_ctx`/`Ctx` renamed to `_meta`/`Meta`
- **56** ✓ Core decoupled from HTTP context layer

### Wave 5 — Structural health (complete)

- **57** ✓ Rename `Enricher` → `Guard`; resolve Result overlap
- **59** ✓ Decompose `walkParse` god function; unify walk boilerplate
- **61** ✓ Type the `_meta` bag — eliminate accessor casts
- **60** ✓ Decompose `createServer` god function
- **62** ✓ Unify response types; add `respond()` helper

See **plan 58** for the full prioritized smell inventory.

### Wave 6 — Structural cleanup (complete)

- **65** ✓ Barrel cleanup + missing root exports (`ParseDiag`, `HandlerCtx`).
- **63**: Decompose `walkSpec()` (112-line function); remove spurious `generateSpec` re-export from `openapi-context.ts`.
- **64**: Fix `openApiRoute()` cast-and-mutate pattern.
- **66**: Extract rate-limit check from `executeRoute()` into named helper.

### Wave 7 — Segment correctness + test quality (current)

- **67**: Fix `num`/`opt-num` to reject non-integers (`parseInt` + round-trip check). **Next.**
- **82**: Test infrastructure — fixture builders + `it.each` table-driven refactor.
- **83**: Inline snapshot adoption + `ParseDiag` diagnostics layer.
- **69**: Enforce optional segment ordering at definition time.
- **68**: Change wildcard capture from `string[]` to `string`. Breaking change — do after 69.
- **84**: Framework-internal PBT — `fast-check` for core invariants (after segment fixes).

### Wave 8 — Feature completeness

- **71**: Type-level method/body safety — GET/HEAD/DELETE cannot carry a `body` option.
- **73**: Include `Allow` header in 405 responses (RFC 7231 §6.5.5).
- **72** ✓ `createTestClient` — in-memory server + typed client bundled for test use.
- **85**: Fix `HttpContext` arity inconsistency; extract shared `RouterContract` type; remove casts from `createTestClient`.

### Wave 9 — Client correctness

- **75**: `matchResponse` exhaustive combinator — compile-time error for unhandled status codes.

### Wave 10 — Ergonomics

- **76**: `.use()` fluent builder + `pipeline()` — left-to-right guard composition.
- **77**: Declarative `requires` annotation on `httpRoute`.

### Wave 11 — Infrastructure cleanup

- **63**: Decompose `walkSpec()`; remove spurious `generateSpec` re-export.
- **64**: Fix `openApiRoute()` cast-and-mutate pattern.
- **66**: Extract rate-limit logic from `executeRoute()`.

### Wave 12 — Handler ergonomics

- **78**: `IntoResponse` — handlers may return domain objects directly on single-status routes.

### Wave 13 — Testing automation

- **79**: Property-based / fuzz testing from Zod schemas (`@arbor/router-test`). Depends on 72 + 75.

### Wave 14 — Architecture spikes

- **80**: Spike — typed capability / environment system.
- **81**: Default handler supervision (let-it-crash safety net).

### Deferred / low priority

- **Plan 70**: Pattern/regex segment kind. Do after wave 7 settles.
- **Plan 74**: Radix tree router spike. Benchmark-gated.
- **Plan 24**: TanStack bridge. Separate package; undeferred after API surface stabilises.

---

## Plan Index

| Plan | Topic                                                        | Status                |
| ---- | ------------------------------------------------------------ | --------------------- |
| 18   | Eliminate unjustified casts                                  | ✓                     |
| 19   | Phantom/runtime context split                                | ✓                     |
| 20   | Type-safe section params in `print()`                        | ✓                     |
| 21   | `Route extends { tag: string }` constraint                   | ✓                     |
| 22   | Server handler DI context                                    | ✓                     |
| 23   | OpenAPI spec generator                                       | ✓                     |
| 24   | TanStack bridge spike                                        | DEFERRED              |
| 25   | Server body validation and error boundary                    | ✓                     |
| 26   | Expand type-level test coverage                              | ✓                     |
| 27   | Normalize response status code types                         | ✓                     |
| 28   | Remove redundant `_child` phantom                            | SUPERSEDED by 47      |
| 29   | Typed response headers                                       | ✓                     |
| 30   | Typed request headers                                        | ✓                     |
| 31   | Typed HTTP API client — architecture spike                   | ✓                     |
| 32   | Cookie handling                                              | ✓                     |
| 33   | Per-route CORS policy override                               | ✓                     |
| 34   | API key authentication                                       | ✓                     |
| 35   | Multipart / streaming body parsing                           | ✓                     |
| 36   | Per-route rate limiting                                      | ✓                     |
| 37   | Telemetry / metrics decorator                                | ✓                     |
| 38   | CORS / CSRF server wrapper                                   | ✓                     |
| 39   | JWT / session authentication                                 | ✓                     |
| 40   | RBAC authorization                                           | ✓                     |
| 41   | Examples directory                                           | ✓                     |
| 42   | Edge and corner case tests                                   | ✓                     |
| 43   | Type inference depth / complexity limits — spike             | ✓                     |
| 44   | ~~Type-safe middleware pipeline~~                            | SUPERSEDED by 49      |
| 45   | Pluggable error mapping engine                               | ✓                     |
| 46   | Spike: restructure `Derive`/`ChildUnion`                     | ✓                     |
| 47   | Remove `_child` phantom via depth-counter                    | ✓                     |
| 48   | Typed HTTP client: options API + headers                     | ✓                     |
| 49   | Spike: handler enrichers as middleware alt.                  | ✓                     |
| 50   | Publish enrichers API                                        | ✓                     |
| 51   | ~~Spike: RouteCtx design~~                                   | SUPERSEDED by 53      |
| 52   | Spike: openApiRoute wraps httpRoute                          | ✓                     |
| 53   | RouteCtx move to plugins                                     | ✓                     |
| 54   | RouteCtx removal via ctx param                               | ✓                     |
| 55   | Rename `_ctx`/`Ctx` to `_meta`/`Meta`                        | ✓                     |
| 56   | Tech debt: core/ must not import from contexts/              | ✓                     |
| 57   | Rename Enricher → Guard; resolve Result overlap              | ✓                     |
| 58   | Architectural smell assessment (reference backlog)           | —                     |
| 59   | Decompose walkParse; unify walk boilerplate                  | ✓                     |
| 60   | Decompose createServer god function                          | ✓                     |
| 61   | Type the `_meta` bag; eliminate accessor casts               | ✓                     |
| 62   | Unify response types; add `respond()` helper                 | ✓                     |
| 63   | Decompose `walkSpec()`; fix `generateSpec` re-export         | queued                |
| 64   | Fix `openApiRoute()` cast-and-mutate                         | queued                |
| 65   | Barrel cleanup; add `ParseDiag`/`HandlerCtx` to root exports | ✓                     |
| 66   | Extract rate-limit logic from `executeRoute()`               | queued                |
| 67   | Fix `num`/`opt-num` to reject non-integers                   | queued                |
| 68   | Wildcard captures `string` not `string[]`                    | queued                |
| 69   | Enforce optional segment ordering at definition time         | queued                |
| 70   | Pattern/regex segment kind                                   | LOW                   |
| 71   | Method/body type safety — GET/HEAD/DELETE cannot have body   | queued                |
| 72   | `createTestClient` in-memory test utility                    | ✓                     |
| 73   | Include `Allow` header in 405 responses                      | queued                |
| 74   | Radix tree router spike                                      | LOW — benchmark-gated |
| 75   | `matchResponse` exhaustive combinator                        | queued                |
| 76   | `.use()` fluent builder + `pipeline()` combinator            | queued                |
| 77   | Declarative `requires` annotation on `httpRoute`             | queued                |
| 78   | `IntoResponse` — direct domain object return from handlers   | queued                |
| 79   | Property-based / fuzz testing from Zod schemas               | queued                |
| 80   | Spike — typed DIY capability / environment system            | queued                |
| 81   | Default handler supervision (let-it-crash safety net)        | queued                |
| 82   | Test infrastructure: fixture builders + `it.each` refactor   | queued                |
| 83   | Inline snapshot adoption + `ParseDiag` diagnostics layer     | queued                |
| 84   | Framework-internal PBT — `fast-check` for core invariants    | queued                |
| 85   | Fix `HttpContext` arity; extract `RouterContract`; no casts  | queued                |
| 86   | Lint: exhaustiveness-check, no-console, fix suppressions     | queued                |
