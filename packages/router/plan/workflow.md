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

## TypeScript Type-Level Design Spikes

When a plan's type design involves any of the following, treat the type design
itself as a **spike** before writing tests or implementation:

- Union types as generic constraints where lambdas need contextual typing
- Overloaded functions called with union-typed arguments
- Index signatures (e.g. `Record<number, ...>`) intersected with mapped types
- Novel use of conditional types to infer return/parameter types from generics

**The rule:** validate the type-level invariant in the smallest possible isolated
file *before* writing tests or implementation. A 10–20 line scratch file that
confirms "TypeScript can infer `body` correctly here" costs one iteration.
Finding out it doesn't — after writing a full test suite — costs fifteen.

### Scratch-file workflow

1. Create `scratch/_type-test.ts` (gitignored, or deleted after).
2. Write the minimum TypeScript to test the core type-level claim:
   - Can TypeScript contextually type a lambda parameter from this constraint?
   - Does passing a union-typed variable to this generic function preserve the union?
   - Does the object literal trigger excess-property checking here?
3. Run `tsc --noEmit --strict scratch/_type-test.ts` directly.
4. Iterate on the type design in the scratch file until the invariant holds.
5. Only then write the real test file and implementation.

### Hypotheses to eliminate early

When you encounter unexpected `body: any`, `body: unknown`, or `body: never`,
check these in order — each can be tested in 3–5 lines:

| Hypothesis | Quick test |
| --- | --- |
| TypeScript is narrowing the response variable | Try `declare const ok: Res` vs. `const ok: Res = literal` |
| Index signature intersects and widens/narrows body type | Inline the intersection manually; check `keyof` and `Extract` |
| Overload 1 is poisoning contextual types for overload 2 | Temporarily remove overload 1 and see if body infers correctly |
| Union argument is being distributed over overload checks | Replace union variable with `declare const` of the full union |

**Do not spend more than one full iteration theorising in prose.** If a mental
model predicts the error but the fix doesn't work, the mental model is wrong —
test a different hypothesis empirically instead.

---

## What "Complete" Means

A plan is complete when:

- All new behavior is tested
- No existing tests are broken
- All examples in `examples/` are brought up to date with code changes
- `pnpm test && pnpm typecheck && pnpm lint` passes clean
- `pnpm run examples` runs cleanly
- The plan file is renamed to `N.DONE.topic.md` and CLAUDE.md is updated
