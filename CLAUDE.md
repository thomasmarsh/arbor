# CLAUDE.md 🪐

## Active Focus

`plan/ledger.jsonl` is the source of truth. Find the current task with:

```bash
rg '"status": "next"' plan/ledger.jsonl
```

## Strict System Rules (Zero Preamble)

**Execution Mode**: Determine if the task is a Code Edit or an Architectural Plan.

- **Code Edits**: Output raw `SEARCH/REPLACE` blocks immediately. The first byte of your reply must be the markdown code fence. Zero conversational introductions, filler, or conclusions.
- **Architectural Plans**: When creating or modifying files in `plan/`, you are permitted a concise, step-by-step prose analysis before outputting the markdown blocks.

- **Diff Structure**: Include 2-3 lines of matching context buffer code inside the `SEARCH` block. Never rewrite entire files. Keep search blocks focused tightly on the changing lines to maximize token efficiency.
- **Example Style**:

```diff
<<<<<<< SEARCH
export type Derive<N> = N extends RouteNode<unknown, any, any, any>
=======
export type Derive<N> = N extends RouteNode<unknown, any, any, any, infer Query>
>>>>>>> REPLACE
```

- **Minimize reads**: Do not read entire source files to discover structure except when required for whole file analysis. Prefer targeted rg (ripgrep) lookups first to locate exact line ranges, then read only those ranges.

- **EXPERIMENT, DON'T SPECULATE**: avoid blind and endless speculation. Just write a simple test or experiment in `scratch/` and validate understanding. Start with the basics of the problem and layer complexity as you have resolved your understanding. Only then commit to larger implementation in the source tree. If you get stuck: backtrack and go back to basics.

## Working Commands

Working directory is the workspace root (`/Users/tmarsh/git/arbor`). Source lives in `packages/router/`.

- Test suite: `pnpm --filter @arbor/router test`
- Type checking: `pnpm --filter @arbor/router typecheck`
- Run examples: `pnpm --filter @arbor/router run examples`
- Verification chain: `pnpm --filter @arbor/router test && pnpm --filter @arbor/router typecheck && pnpm lint && pnpm --filter @arbor/router run examples`
- Lint config: `/Users/tmarsh/git/arbor/eslint.config.js` (workspace root — no local config)

NOTE: Path structure described in `plan/topology.md`. Execution order in `plan/work-order.md`.

## Testing

Full philosophy in `plan/testing.md`. Quick decisions:

- **Tier**: `expectTypeOf` → type contracts; `expect` + `it.each` → runtime; `toMatchInlineSnapshot` → structured/diagnostic output; `createTestClient` → full pipeline; `fast-check` → invariants.
- **Snapshots**: inline only (`toMatchInlineSnapshot`). No external `.snap` files.
- **Tables**: `it.each` when ≥ 3 tests share the same assertion shape with different data.
- **Route fixtures**: build trees via `packages/router/src/test-utils/fixtures.ts` (Plan 82), not raw `RouteNode` objects.
- **PBT**: never-throw and round-trip properties; not for happy-path coverage.

## Architecture & Core Shapes

_URL router with full TS type inference without codegen. Route type is a nested discriminated union via phantom types. Read `plan/spec.architecture.md` for compiler constraints and structural edge cases._

```typescript
interface RouteNode<
  R,
  C extends RouteNode<unknown, any, any, any, any>[] = [],
  Context = never,
  SectionParams extends string = never,
  Meta = Record<string, unknown>,
> {
  _type: R; // phantom (undefined as never)
  schema: z.ZodObject<any, any> | null;
  path: string;
  children: C;
  context?: Context; // concrete — carries runtime data
  _meta?: Meta; // typed plugin-metadata bag; HttpContextData for httpRoute(), OpenApiCtxData for openApiRoute()
}

type ChildUnion<C extends RouteNode<unknown, any, any, any, any>[]> =
  FlattenChildrenImpl<C>[number];

type Derive<N> =
  N extends RouteNode<unknown, any, any, any, any> ? FlattenChildrenImpl<[N]>[0] : never;
// FlattenChildrenImpl is a single self-recursive mapped type with a depth
// counter (up to 15 levels). Eliminates the mutual recursion that blocked
// removing _child.
```

- The core types like RouteNode should be as domain independent as much as possible. We use the `Context` type parameter in preference to baking in understanding of different schemes or protocols

## Non-Negotiable Working Style

0. **Session mode — choose before touching code:**

   | Mode        | When to use                                                      | Output                             |
   | ----------- | ---------------------------------------------------------------- | ---------------------------------- |
   | **Deliver** | Bounded to 1–2 files, risk clear, no novel type design           | Code + tests, done                 |
   | **Spike**   | Unknown territory, novel type constraint, or unclear feasibility | Scratch file or isolated prototype |
   | **Plan**    | Cross-layer, cross-file (3+), or the plan doesn't exist yet      | `plan/<n>.md` + TODO stubs, stop   |

   Pick the mode first. Do not drift from Deliver into Plan-scope mid-session; if scope expands, stop, write the plan, add `// TODO(plan/<n>): ...` stubs, and end the session cleanly.

   Big changes are allowed only when: a plan exists, it explicitly says "deliver in one session," and the scope is fully bounded in that plan. Otherwise, write the plan now.

   Before editing blind, use `rg` (ripgrep) to find exact symbol definitions. Do not read entire files just to scan for code signatures.

1. **Smallest possible change**: One localized thing at a time. Prefer a 1-line change with a test.
2. **TDD Workflow**: Write failing tests/stubs first to verify ergonomics before updating runtime code. **Exception — novel type designs**: if the plan introduces a type design involving union constraints + contextual typing, generic overloads, or index signatures intersected with mapped types, validate the type-level invariant in a minimal scratch file _before_ writing tests. See `plan/workflow.md` §TypeScript Type-Level Design Spikes for the scratch-file workflow and a table of quick-hypothesis checks. Do not iterate on the full implementation more than once without empirical confirmation of the root cause.
3. **Test alongside**: Changes require tests (`expectTypeOf` for type-level, `expect` for runtime). Base cases first.
4. **Always verify**: Run verification chain after every single change. Fix failures before moving forward. If the chain runs ≥ 2 times before passing, append a `## Post-mortem` to the plan file (≤ 10 lines: root cause + what pre-flight step would have caught it) — see `plan/workflow.md` §TDD Workflow Per Plan step 8.
5. **Correct by construction**: Parse, don't validate. Use types over runtime checks to make illegal states unrepresentable.
6. **No Debt**: Fix bad type casts immediately. Do not use `as any` without a documented comment reason.
7. **Phantom types**: `_type` is strictly `undefined as never` at runtime. Used for inference only. (`_child` was removed in plan 47; child union is now derived via `FlattenChildrenImpl`.)
8. **Preserve tests**: Never delete or break past tests. Fix the refactor to match.
9. **One phase at a time**: Complete the current phase in `plan/` fully before starting the next.

## `expectTypeOf` Post-mortem Notes

- `IteratorResult<T>.value` is `T | any = any; toEqualTypeOf<T>()` fails on `any`. Test channel message types via `expectTypeOf(ch.messages)`, not `result.value`.
- Write a scratch file first for novel `expectTypeOf` assertions.

## Examples (`packages/router/examples/`)

Self-contained runnable demos in `packages/router/examples/`. Run them as a smoke test with `pnpm --filter @arbor/router run examples`.

**Keep them current**: when a plan changes the public API, update any example that exercises it. The examples are the human-facing documentation — stale examples are worse than no examples.

| File                | What it shows                                                                        |
| ------------------- | ------------------------------------------------------------------------------------ |
| `basic-server.ts`   | `createServer` + `handle()` dispatch                                                 |
| `basic-client.ts`   | `createClient.fetch()` with typed responses                                          |
| `query-params.ts`   | `httpRoute` with a Zod query schema                                                  |
| `nested-routes.ts`  | Nested `route()` tree; `parse()` + `print()` roundtrip                               |
| `openapi-output.ts` | `generateSpec()` → stdout JSON                                                       |
| `guards.ts`         | `withGuard` + `composeGuards` — pre-handler auth/plan checks                         |
| `typed-client.ts`   | `createClient` options object API; typed request headers; `TypedClient` utility type |
| `auth-protected.ts` | `withSession` guard — JWT auth short-circuit, typed session in ctx                   |
| `rbac.ts`           | `withRbac` guard — role-based 403 check composed on top of `withSession`             |
| `test-client.ts`    | `createTestClient` — in-memory server + typed client in one call for test suites     |
| `use-builder.ts`    | `.use()` + `.pipe(pipeline())` — left-to-right route-node transformer composition    |
| `sse-stream.ts`     | `sseRoute` + `createSseServer` + `createSseClient` — typed SSE stream end-to-end     |

**Rules for examples**:

- Import only from `../src/index.js` relative to the examples dir (resolves to `packages/router/src/index.js`).
- No `expect`/`describe` — real code only.
- No casting or `any`/`unknown` (with rare exceptions) - examples should showcase type safety.
- Every example must produce visible output when run with `tsx`.
- Add the new entry to the table above when you add a file.

## Planning

When planning, use the following rules:

- Place a plan document in plan/ (using the next available number). Format: `plan/<sequence>.<topic>.md`
- Open questions for user resolution → new plan file (spike if unvalidated theory)
- Update `plan/work-order.md` to add the plan to the queue and update the plan index
- Update `plan/roadmap.md` if the plan changes scope, deferred items, or long-horizon directions
- Every plan document must include the sections:
  - Context
  - Goal
  - Change Surface
  - Dependencies
  - Success Criteria
