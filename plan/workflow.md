# Development Workflow

## Ledger

`plan/ledger.jsonl` is the single source of truth for task status and sequencing.
Every task is one line of JSON — `rg` and `sed` operate directly on it.

### Reading the ledger

```bash
# Current focus task (status = next)
rg '"status": "next"' plan/ledger.jsonl

# Next queued task
rg '"status": "queued"' plan/ledger.jsonl | head -1

# Look up a specific task by id
rg '"id": 86,' plan/ledger.jsonl

# All tasks in a wave
rg '"wave": "w14"' plan/ledger.jsonl

# All tasks in a story
rg '"story": "s4"' plan/ledger.jsonl

# All queued tasks in a story
rg '"story": "s4"' plan/ledger.jsonl | rg '"status": "queued"'
```

### Updating status

Each task lives on one line. Target by id and update only the status field:

```bash
# Start work on a task (queued → next)
sed -i '' '/"id": 86,/s/"status": "queued"/"status": "next"/' plan/ledger.jsonl

# Mark the current task done
sed -i '' '/"id": 86,/s/"status": "next"/"status": "done"/' plan/ledger.jsonl

# Block a task
sed -i '' '/"id": 28,/s/"status": "[^"]*"/"status": "blocked"/' plan/ledger.jsonl

# Supersede a task
sed -i '' '/"id": 44,/s/"status": "[^"]*"/"status": "superseded"/' plan/ledger.jsonl
```

---

## Prioritization Criteria

Evaluate queued plans in this order:

1. **Impact** — genuinely useful to users of the library
2. **Foundational** — hard to retrofit later, or unlocks a cluster of future work
3. **Correctness testing** — enables contract testing, property-based testing, or fuzz testing

Novel features with large dependencies or non-obvious ergonomics must be **opt-in, pay-for-what-you-use**. Spikes produce only updated plans or notes — no shipping code until the theory is validated.

---

## TDD Workflow Per Plan

0. **Pre-flight** (do this before writing a single line of code):
   - If the plan touches `any`, type utilities, or generics: read `/arbor/eslint.config.js`
     (workspace root) to know which strict rules apply. The package root has no local
     eslint config — the workspace config is the one that fires.
   - If the plan involves a novel type design (see §TypeScript Type-Level Design Spikes):
     create a scratch file now, not after writing the implementation.

1. Read the plan. Understand the problem and the proposed change.
2. Write the failing test first (`expectTypeOf` for type-level, `expect` for runtime).
3. Run `pnpm test` — confirm it fails for the right reason.
4. Implement the minimum change to make it pass.
5. Run `pnpm test && pnpm typecheck && pnpm lint`.
6. Run `pnpm run examples`.
7. Fix any failures before moving to the next plan.
8. **Post-mortem (conditional):** If the verification chain ran ≥ 2 times before
   passing, append a `## Post-mortem` section to the current plan file: state the root
   cause of each failure and what pre-flight step would have caught it. Keep it to
   ≤ 10 lines. This is the signal to consider a process improvement.

---

## TypeScript Type-Level Design Spikes

When a plan's type design involves any of the following, treat the type design
itself as a **spike** before writing tests or implementation:

- Union types as generic constraints where lambdas need contextual typing
- Overloaded functions called with union-typed arguments
- Index signatures (e.g. `Record<number, ...>`) intersected with mapped types
- Novel use of conditional types to infer return/parameter types from generics

**The rule:** validate the type-level invariant in the smallest possible isolated
file _before_ writing tests or implementation. A 10–20 line scratch file that
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

| Hypothesis                                               | Quick test                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| TypeScript is narrowing the response variable            | Try `declare const ok: Res` vs. `const ok: Res = literal`      |
| Index signature intersects and widens/narrows body type  | Inline the intersection manually; check `keyof` and `Extract`  |
| Overload 1 is poisoning contextual types for overload 2  | Temporarily remove overload 1 and see if body infers correctly |
| Union argument is being distributed over overload checks | Replace union variable with `declare const` of the full union  |

**Do not spend more than one full iteration theorising in prose.** If a mental
model predicts the error but the fix doesn't work, the mental model is wrong —
test a different hypothesis empirically instead.

---

## Session Type Design Spikes

Session types introduce a distinct class of type-level challenge: _recursive phantom types
with a computed dual_. Before writing tests or implementation for any session type plan
(87–91), spike the type-level claim first.

### When to treat as a session type spike

A plan involves session type machinery if it touches any of:

- `Dual<S>` computation — recursive conditional type swapping `Send`↔`Recv`
- `Channel<S>` — a type whose method set changes with each operation (dependent session)
- `Project<G, P>` — multi-party projection from a global type
- Adding a new `_meta` key that carries a session phantom and must not widen existing HTTP `_meta`

### Scratch-file workflow (session types)

1. Create `scratch/NN-session-spike.ts` (gitignored or deleted after).
2. Write the minimum TypeScript to test the core session claim:
   - Does `Dual<Send<A, Recv<B, End>>>` = `Recv<A, Send<B, End>>`?
   - Does `Channel<Send<string, End>>` have `.send(v: string)` and no `.recv`?
   - Does projection `Project<G, "Alice">` produce the correct local type?
3. Run `tsc --noEmit --strict scratch/NN-session-spike.ts`.
4. Run `tsc --diagnostics scratch/NN-session-spike.ts` and record the instantiation count.
5. Iterate until the claim holds. If instantiation count exceeds ~500k, apply the
   depth-counter technique from `FlattenChildrenImpl`.
6. Only then write the real test file and implementation.

### Hypotheses to eliminate early (session types)

| Hypothesis                             | Quick test                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Dual<S>` distributes over union       | `Dual<Send<A, End> \| End>` — should be `Recv<A, End> \| End`                               |
| Recursive `Dual` hits TS depth limit   | 5-deep chain; `tsc --diagnostics`                                                           |
| `Channel<S>` contextual typing works   | `(ch: Channel<Send<string, End>>) => ch.send('hello')` no cast                              |
| New `_meta` key widens HTTP extractors | `type M = Extract<SseMeta<E> & HttpContextData, { __httpMethod: any }>` — must still narrow |

---

## What "Complete" Means

A plan is complete when:

- All new behavior is tested
- No existing tests are broken
- All examples in `examples/` are brought up to date with code changes
- `pnpm test && pnpm typecheck && pnpm lint` passes clean
- `pnpm run examples` runs cleanly
- The task status is set to `"done"` in `plan/ledger.jsonl`:

  ```bash
  sed -i '' '/"id": N,/s/"status": "next"/"status": "done"/' plan/ledger.jsonl
  ```
