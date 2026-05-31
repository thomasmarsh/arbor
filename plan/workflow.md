# Development Workflow

## Session Opening

Start every session with one of these signals:

| Signal              | Meaning                                               |
| ------------------- | ----------------------------------------------------- |
| `next`              | Proceed with whatever is `status: next` in the ledger |
| `plan <N>`          | Jump to a specific plan ID regardless of ledger state |
| `plan <N>, deliver` | Explicit Deliver mode — skip the mode-selection stop  |

On receiving any of the above, Claude must complete Stage 0, then **stop and state**:

1. The task goal (one sentence)
2. The change surface (files to be touched)
3. The chosen mode

Then wait for user confirmation before touching any code — including in Deliver mode.

---

## Protocol

Every session follows these stages in strict order. Do not skip or reorder.
Each stage lists its **Entry**, **Actions**, and **Gate** (exit condition).
Stages marked **[CHECKPOINT]** require you to stop and await user input before continuing.

---

### Stage 0 — Orient

**Entry**: new session or new task.

1. `rg '"status": "next"' plan/ledger.jsonl` — identify the current task.
2. Read the linked plan file.
3. State the task goal and the files in its change surface.

**Gate**: you can articulate the task goal and enumerate the files it touches.

---

### Stage 1 — Mode Selection

Evaluate scope. Choose exactly one mode:

| Mode        | Condition                                                     | Next stage                    |
| ----------- | ------------------------------------------------------------- | ----------------------------- |
| **Deliver** | Bounded to 1–2 files, risk clear, no novel type design        | Stage 2                       |
| **Spike**   | Unknown territory, novel type constraint, unclear feasibility | Stage 1S                      |
| **Plan**    | Cross-layer (3+ files), or no plan exists yet                 | Write plan → **[CHECKPOINT]** |

**Plan branch**: write the plan file, update `plan/work-order.md`, add `// TODO(plan/<n>): ...` stubs where needed, then **STOP — do not proceed until the user responds**.

Never drift from Deliver into Plan scope mid-session. If scope expands unexpectedly, write the stubs, write the plan, and stop.

**Gate**: mode is chosen. If Plan → plan written and session ended.

---

### Stage 1S — Spike _(branch from Spike mode)_

1. Create `scratch/<topic>-spike.ts`.
2. Write the minimum code to test the core claim (10–20 lines).
3. Run `tsc --noEmit --strict scratch/<topic>-spike.ts`.
4. Iterate until the claim holds **or** is falsified.

**If spike falsifies the plan → [CHECKPOINT]: report findings, propose a plan revision, STOP — do not proceed until the user responds.**

If spike confirms the approach → delete or gitignore the scratch file, return to Stage 1 with mode = Deliver.

**Gate**: core claim confirmed in the scratch file.

See **Appendix A** (TypeScript design spikes) and **Appendix B** (session type spikes) for hypotheses to eliminate first.

---

### Stage 2 — Pre-flight

1. If the plan touches `any`, type utilities, or generics: read `eslint.config.js` at workspace root (there is no local package-level config).
2. `rg` the exact symbol definitions in the change surface — do not open entire files to scan for signatures.
3. Confirm the change surface matches the plan. If the surface is larger than expected → **[CHECKPOINT]**: flag the discrepancy and await user.

**Gate**: change surface is fully mapped and consistent with the plan.

---

### Stage 3 — Red (Failing Test)

1. Write the failing test:
   - `expectTypeOf` — type-level contracts.
   - `expect` / `it.each` — runtime behavior (use `it.each` when ≥ 3 tests share the same assertion shape).
   - `toMatchInlineSnapshot` — structured or diagnostic output.
   - `createTestClient` — full-pipeline integration.
2. Run `pnpm --filter @arbor/router test` — confirm the test fails **for the right reason**.
3. If the test passes immediately or fails for a wrong reason, revise it before proceeding.

**Gate**: the test fails with the expected error or type error.

---

### Stage 4 — Green (Implement)

1. Write the minimum change that makes Stage 3's test pass.
2. Do not add features, refactoring, or cleanup beyond what the failing test requires.
3. Run `pnpm --filter @arbor/router test` — confirm the new test passes and no prior tests regress.

**Gate**: Stage 3's test now passes; no regressions.

---

### Stage 5 — Verify

Run the full verification chain:

```bash
pnpm --filter @arbor/router test && pnpm --filter @arbor/router typecheck && pnpm lint && pnpm --filter @arbor/router run examples
```

Fix any failure before moving to Stage 6. Do not advance with a red chain.

**Gate**: verification chain exits clean in a single run.

---

### Stage 6 — Close Out

1. If the plan changed the public API, update all affected `examples/` files. Run examples to confirm they produce output.
2. Mark the task done in the ledger:

   ```bash
   sed -i '' '/"id": N,/s/"status": "next"/"status": "done"/' plan/ledger.jsonl
   ```

3. Update `CLAUDE.md` §Examples table if a new example file was added.
4. Provide recommended commit message for the changes made during the session.

**Gate**: ledger updated; examples run clean.

---

### Stage 7 — Post-mortem _(conditional)_

**Trigger**: the verification chain in Stage 5 ran ≥ 2 times before passing.

1. Append `## Post-mortem` to the current plan file.
2. State the root cause of each failure and what pre-flight step would have caught it. ≤ 10 lines.
3. **[CHECKPOINT if systemic]**: if the post-mortem identifies a recurring pattern or a missing pre-flight check that affects the workflow itself, flag it explicitly and await user before closing the session.

**Gate**: post-mortem appended; systemic issues flagged.

---

## Ledger Reference

`plan/ledger.jsonl` is the single source of truth. Every task is one line of JSON.

### CLI (preferred)

```bash
# What to work on next
arbor next

# Full ready queue (deps satisfied, sorted by wave + rank)
arbor queue

# Status transitions
arbor set 86 next        # queued → next
arbor set 86 done        # next → done
arbor set 28 blocked     # block a task
arbor set 44 superseded  # supersede a task

# Reorder within a wave
arbor bump 86            # move to front of its wave
arbor defer 86           # push to back of its wave

# Interactive TUI
arbor tui                # table view; n=next d=done b=bump D=defer r=refresh q=quit
```

### Ripgrep lookups

```bash
# Current focus task
rg '"status": "next"' plan/ledger.jsonl

# Look up by id
rg '"id": 86,' plan/ledger.jsonl

# All tasks in a wave
rg '"wave": "w14"' plan/ledger.jsonl

# All tasks in a story
rg '"story": "s4"' plan/ledger.jsonl
```

---

## Prioritization Criteria

Evaluate queued plans in this order:

1. **Impact** — genuinely useful to users of the library
2. **Foundational** — hard to retrofit later, or unlocks a cluster of future work
3. **Correctness testing** — enables contract testing, property-based testing, or fuzz testing

Novel features with large dependencies or non-obvious ergonomics must be **opt-in, pay-for-what-you-use**. Spikes produce only updated plans or notes — no shipping code until the theory is validated.

---

## Appendix A — TypeScript Type-Level Design Spikes

When the plan involves any of the following, the type design is itself a spike (Stage 1S):

- Union types as generic constraints where lambdas need contextual typing
- Overloaded functions called with union-typed arguments
- Index signatures (`Record<number, ...>`) intersected with mapped types
- Novel conditional types inferring return or parameter types from generics

### Hypotheses to eliminate early

| Hypothesis                                         | Quick test                                                    |
| -------------------------------------------------- | ------------------------------------------------------------- |
| TypeScript is narrowing the response variable      | `declare const ok: Res` vs. `const ok: Res = literal`         |
| Index signature widens/narrows body type           | Inline the intersection; check `keyof` and `Extract`          |
| Overload 1 poisons contextual types for overload 2 | Remove overload 1; see if body infers correctly               |
| Union argument distributed over overload checks    | Replace union variable with `declare const` of the full union |

Do not spend more than one iteration theorising. If the mental model predicts the error but the fix does not work, the model is wrong — test a different hypothesis empirically.

---

## Appendix B — Session Type Design Spikes

Treat as a session type spike (Stage 1S) when the plan touches any of:

- `Dual<S>` — recursive conditional swapping `Send`↔`Recv`
- `Channel<S>` — method set changes per operation (dependent session)
- `Project<G, P>` — multi-party projection from a global type
- A new `_meta` key that carries a session phantom and must not widen existing HTTP `_meta`

### Scratch-file workflow (session types)

1. Create `scratch/NN-session-spike.ts`.
2. Write the minimum TypeScript to test the core session claim.
3. Run `tsc --noEmit --strict scratch/NN-session-spike.ts`.
4. Run `tsc --diagnostics scratch/NN-session-spike.ts` and record instantiation count.
5. If instantiation count exceeds ~500k, apply the depth-counter technique from `FlattenChildrenImpl`.
6. Only then proceed to Stage 2.

### Hypotheses to eliminate early (session types)

| Hypothesis                             | Quick test                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `Dual<S>` distributes over union       | `Dual<Send<A, End> \| End>` should be `Recv<A, End> \| End`                      |
| Recursive `Dual` hits TS depth limit   | 5-deep chain; `tsc --diagnostics`                                                |
| `Channel<S>` contextual typing works   | `(ch: Channel<Send<string, End>>) => ch.send('hello')` no cast                   |
| New `_meta` key widens HTTP extractors | `Extract<SseMeta<E> & HttpContextData, { __httpMethod: any }>` must still narrow |
