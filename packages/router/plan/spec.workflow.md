# Development Workflow

## Execution Order

Work through numbered plans in this sequence. Complete each fully (tests passing, typecheck clean) before starting the next.

```text
...15 → 11 → 12 → 13 → 16 → 17...
```

Rationale for ordering:

- **14 first**: The barrel smoke test is a safety net. It catches accidental export regressions introduced by any subsequent plan.
- **15 second**: Section-nesting and adjacent-optional-segment tests are bug hunts. Running them before adding features ensures the baseline is solid and reveals real bugs to fix before new code layers over them.
- **11 → 12 → 13**: Diagnostics, client validation, and OpenAPI wildcard are independent improvements. They can be done in any order but diagnostics first is preferable since it aids debugging the others.
- **16 onward**: New features that expand the public API surface. Only start after the above hygiene is complete.

## Phase Mapping (Plans → Roadmap)

Plans 11-16 correspond to **spec.enhancements.md Phase 1** ("Client & Server Core Enhancements"):

| Plan | Roadmap item                                                            |
| ---- | ----------------------------------------------------------------------- |
| 12   | Parse-don't-validate on client responses                                |
| 16   | Query Parameter Schema Engine                                           |
| 16   | Compile-Time Variable Substitution (already done — enforced by `print`) |

After plan 16, the next natural phase is server-side DI (passing validated query + body + path params as a single typed context to handlers), which maps to **Phase 2** of `spec.enhancements.md`.

The items in **spec.roadmap.md** (CORS, CSRF, JWT, RBAC, loaders, TanStack bridge) are future phases that require the foundation from plans 11-16 to be solid first. Do not start those until the current numbered plans are done.

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
