# Development Workflow

## Execution Order

Work through numbered plans in this sequence. Complete each fully (tests passing, typecheck clean) before starting the next.

```text
19 → 21 → 20 → 22 → 23 → 24
```

Rationale for ordering:

- **19 first**: Phantom/runtime context split. Eliminates the root `as unknown as` casts and makes `_ctx` accessible without casting everywhere downstream. Unblocks 22 and 23.
- **21 next**: Smallest plan — just adds `Route extends { tag: string }` bound. Independent, low-risk, good warm-up.
- **20 after 21**: Section params in `print()`. Depends on decisions in `questions.md` (Q1). If full phantom threading, do it here while the type machinery is fresh from 19.
- **22 after 19**: Server DI context. Needs `_ctx` (from 19) to read schemas cast-free. Blocked on Q2 answer.
- **23 after 19+22**: OpenAPI generator. Builds on the clean `_ctx` access from 19 and the unified handler shape from 22.
- **24 (spike) any time**: TanStack bridge feasibility — read-only research, can run in parallel with any plan above.

## Phase Mapping (Plans → Roadmap)

| Plan | Roadmap item                                       |
| ---- | -------------------------------------------------- |
| 18   | Eliminate unjustified casts (done)                 |
| 19   | Phantom/runtime context split                      |
| 20   | Type-safe section params in `print()`              |
| 21   | `Route extends { tag: string }` constraint         |
| 22   | Server handler DI context (enhancements Ph.2 #1)   |
| 23   | OpenAPI spec generator (enhancements Ph.3 #1)      |
| 24   | TanStack bridge spike (spec.tanstack-bridge.md)    |

After plan 23, the next natural phases are:

- **spec.enhancements.md Phase 2, items 2–3**: Type-safe middleware pipelines,
  pluggable error mapping. These depend on the DI shape settled in plan 22.
- **spec.roadmap.md Phase SEC1–SEC2**: CORS/CSRF, JWT/Session contracts.
  Require middleware pipeline from Phase 2 to be in place.
- **spec.roadmap.md Phase C1–C3**: Client-side loaders, lifecycle tracking,
  search param inheritance. TanStack bridge spike (24) informs whether to build
  natively or via adapter.

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
- The plan file's CLAUDE.md entry is updated (status → complete)
