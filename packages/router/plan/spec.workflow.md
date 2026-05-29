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
42 (edge case tests)
43 spike (inference limits)   ← independent, can run in parallel with 42
46 spike (derive restructure) ← independent, can run in parallel with 42/43
```

- **42**: Edge and corner case tests. Builds directly on plan 26's test framework.
  No new runtime code — pure test-writing.
- **43 spike**: Benchmark type inference depth/complexity. Independent; run
  at any point after plan 19. If the spike reveals a real problem, a new plan
  is opened before continuing.
- **46 spike**: Restructure `Derive`/`ChildUnion` to eliminate mutual recursion,
  unblocking plan 28 (`_child` removal). Explores a single-recursive mapped type
  (`FlattenChildren`) that avoids the `TS2589` depth limit. If green, opens a
  new implementation plan (28b). If red, closes plan 28 permanently. Independent
  of all wave-1 work; can run in parallel with 42 and 43.

---

### Wave 2 — API contract surface (after plan 22+23)

```text
29 → 30 → 31 spike
        ↘ 35
```

- **29**: Typed response headers. Extends handler return type and OpenAPI spec.
- **30**: Typed request headers. Extends `ctx` shape; same validation pattern as plan 25.
- **31 spike**: Typed HTTP API client architecture. Resolves Q8 (package boundary
  and generation strategy). Depends on 22+23 being settled and 29+30 drafted.
  Opens a new implementation plan if the spike is green.
- **35**: Multipart/streaming body parsing (S1). Depends on plan 22 (ctx shape).
  Can proceed in parallel with 29/30/31.

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
- **44**: Type-safe middleware pipeline. Prerequisite for 36, 37, 38, 39, 40.
  Must land before any plan that declares route-level middleware.
- **45**: Pluggable error mapping. Extends plan 25's catch block; may simplify
  if 44 lands first.
- **36**: Per-route rate limiting. Becomes a built-in middleware after plan 44.
- **37**: Telemetry decorator (`withMetrics`). Server-output wrapper; independent
  of middleware pipeline but clean to implement after.

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
- **Client SDK implementation plan** (number TBD): Opens from plan 31 spike
  result. No plan number assigned until Q8 is resolved.
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
| 44   | Type-safe middleware pipeline (enhancements Ph.2 #2)       |
| 46   | Spike: restructure `Derive`/`ChildUnion` (unblocks plan 28)|
| 45   | Pluggable error mapping engine (enhancements Ph.2 #3)      |

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
