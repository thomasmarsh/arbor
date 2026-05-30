# Development Workflow

## Execution Order

Work through numbered plans in this sequence. Complete each fully (tests passing, typecheck clean) before starting the next.

### Current queue (plans 19–23)

```text
19 → 21 → 27 → 25 → 20 → 22 → 26 → 23
```

Plan 24 (TanStack bridge) is **deferred** — do not start until 19–23 are complete.
Plan 28 (`_child` removal) is **blocked** — see Q7 in `questions.md`. Spike 46
must validate an approach first; a new implementation plan (28b) will follow.

Rationale for ordering:

- **19 first**: Phantom/runtime context split. Adds `_ctx`; unblocks all plans that read runtime schemas cast-free (25, 22, 23).
- **28 removed from queue**: Blocked. `_child` is a load-bearing type memoization field; removing it causes `TS2589` due to mutual recursion in `Derive`/`ChildUnion`. See plan 46 spike.
- **21 after 19**: Smallest plan — `Route extends { tag: string }` bound. Independent, zero-risk.
- **27 after 21**: Normalize `Record<number>` vs `Record<string>` for response status codes. Small, independent; must land before the OpenAPI generator (23).
- **25 after 19**: Server body validation and error boundary. Critical production safety floor. Needs `_ctx.bodySchema` from plan 19.
- **20 after 25**: Section params in `print()` via full phantom threading (Q1). Type machinery is fresh from 19.
- **22 after 19+25**: Server DI context with namespaced `ctx` shape (Q2). Builds on a validated foundation from plan 25.
- **26 after 20+22**: Type-level test expansion. Section-param test requires plan 20; handler-exhaustiveness test requires the plan 22 handler shape.
- **23 after 27+22**: OpenAPI generator, full-tree approach (Q3). Needs normalized status code types (27) and the unified context shape (22).

---

### Wave 1 — Diagnostics and test foundation (after plan 23)

```text
42 ✓ (edge case tests)
46 ✓ (derive restructure spike)
47   ← NEXT: remove _child via FlattenChildrenImpl
43   (inference limits benchmark — run after 47 lands)
```

- **42**: ✓ Done.
- **46 spike**: ✓ Done. Depth-counter approach (`FlattenChildrenImpl<C, D>`)
  passes all assertions including a 4-level tree; plan 47 opened.
- **47**: Remove `_child` phantom field. Replace `Derive`/`ChildUnion` with
  `FlattenChildrenImpl`. Unblocks plan 28. **Next in queue.**
- **43 spike**: Benchmark type inference depth/complexity with the new
  `FlattenChildrenImpl` implementation (which has a 15-level cap by default).
  Measures tsc wall-clock time and TS2589 threshold vs. tree depth/breadth.
  Run after plan 47 so the benchmark tests the new implementation.

---

### Wave 2 — API contract surface (after plan 22+23)

```text
29 → 30 → 31 spike
        ↘ 35
```

- **29**: Typed response headers. Extends handler return type and OpenAPI spec.
- **30**: Typed request headers. Extends `ctx` shape; same validation pattern as plan 25.
- **31 spike**: ✓ Done. Typed HTTP API client architecture spike. Resolved Q8;
  opened plan 48.
- **48**: Typed HTTP client — options API (`{body?, headers?}`), `HttpResponseUnion`
  return type, `./client` and `./server` subpath exports. Opens after plan 31.
- **35**: Multipart/streaming body parsing (S1). Depends on plan 22 (ctx shape).
  Can proceed in parallel with 29/30/48.

---

### Wave 3 — Infrastructure layer (after wave 2 + plan 22)

```text
41 (examples)   ← start after plan 22; add examples as features land
44 → 45
44 → 36
44 → 37
```

- **41**: Examples directory. First batch (`basic-server`, `nested-routes`,
  `query-params`) lands after plan 22. Add further examples as each feature
  plan completes.
- **44**: ~~Type-safe middleware pipeline~~ **Superseded by plan 49 spike.**
  Use handler enrichers (`withEnricher`) instead — see plan 49.
- **49 spike**: ✓ Done. Handler enrichers validated as middleware replacement.
  `withEnricher` + `composeEnrichers` in `src/server/enrichers.ts`. Plans 36,
  37, 38, 39, 40 each get a named enricher; no pipeline runner needed.
- **50**: Publish enrichers to public API + redirect plans 36–40. **Next.**
  Exports `Enricher`/`withEnricher`/`composeEnrichers`; closes plan 44;
  updates plans 36–40 dependency sections to reference `withEnricher`.
- **45**: Pluggable error mapping. Extends plan 25's catch block.
- **36**: Per-route rate limiting. Implement as `withRateLimit` enricher.
- **37**: Telemetry decorator (`withMetrics`). Implement as `withMetrics` enricher.

---

### Wave 4 — Security stack (after plan 44)

```text
38 → 33
39 → 34
39 → 40
32 (after 29 + 30 + Q10 resolved)
```

- **38**: CORS/CSRF server wrapper (SEC1). Functional decorator; reads per-route
  `cors` field from plan 33.
- **33**: Per-route CORS policy. Extends plan 38's server-level config.
- **39**: JWT/session authentication contracts (SEC2). `protectedRoute` factory.
- **40**: RBAC authorization (SEC3). Sits on top of plan 39.
- **34**: API key authentication. Distinct auth strategy; follows the
  `protectedRoute` composition pattern from plan 39.
- **32**: Cookie handling. Blocked on Q10 (WinterCG CookieStore vs. custom
  abstraction) and plans 29+30 (validated contract inputs pattern).

---

### Deferred

- **Plan 24** (TanStack bridge spike): Do not start until plans 19–23 complete.
  See Q4 + Q6. If undeferred, lives in `packages/router-tanstack`.
- **Plan 48** (typed HTTP client): Opens from plan 31 spike. See plan 48.
- **Radix tree router** (spec.enhancements Phase 4): Performance optimization.
  Not planned until a benchmark shows O(N) lookup is a real bottleneck.

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
| 50   | Publish enrichers API; redirect plans 36–40                |
| 56   | Tech debt: core/ must not import from contexts/            |

---

## TDD Workflow Per Plan

1. Read the plan. Understand the problem and the proposed change.
2. Write the failing test first (type-level with `expectTypeOf`, runtime with `expect`).
3. Run `npm test` — confirm it fails for the right reason.
4. Implement the minimum change to make it pass.
5. Run `npm test && npm run typecheck`.
6. Fix any failures before moving to the next plan.

## What "Complete" Means

A plan is complete when:

- All new behavior is tested
- No existing tests are broken
- `npm test && npm run typecheck` passes clean
- If `examples/` is present, then all examples are brought up to date with code changes
- The plan file's CLAUDE.md entry is updated (status → complete)
