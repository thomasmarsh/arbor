# Development Workflow

## Prioritization Criteria

Evaluate queued plans in this order:

1. **Impact** — genuinely useful to users of the library
2. **Foundational** — hard to retrofit later, or unlocks a cluster of future work
3. **Correctness testing** — enables contract testing, property-based testing, or fuzz testing

Novel features with large dependencies or non-obvious ergonomics must be **opt-in, pay-for-what-you-use**. Spikes produce only updated plans or notes — no shipping code until the theory is validated.

---

## TDD Workflow Per Plan

1. Read the plan. Understand the problem and the proposed change.
2. Write the failing test first (`expectTypeOf` for type-level, `expect` for runtime).
3. Run `pnpm test` — confirm it fails for the right reason.
4. Implement the minimum change to make it pass.
5. Run `pnpm test && pnpm typecheck && pnpm lint`.
6. Run `pnpm run examples`.
7. Fix any failures before moving to the next plan.

---

## What "Complete" Means

A plan is complete when:

- All new behavior is tested
- No existing tests are broken
- All examples in `examples/` are brought up to date with code changes
- `pnpm test && pnpm typecheck && pnpm lint` passes clean
- `pnpm run examples` runs cleanly
- The plan file is renamed to `N.DONE.topic.md` and CLAUDE.md is updated
