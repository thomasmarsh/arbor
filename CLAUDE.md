# CLAUDE.md 🪐

## Active Focus

**At the start of every session, read `plan/workflow.md`.** It is the canonical execution protocol — stages, gates, mode selection, and all `[CHECKPOINT]` stops live there.

`plan/ledger.jsonl` is the source of truth for task state. Find the current task with:

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

- **Minimize reads**: Do not read entire source files to discover structure. Prefer targeted `rg` (ripgrep) lookups first to locate exact line ranges, then read only those ranges.

- **No linting markdown**: Ignore all lint warnings on markdown documents you create.

## Working Commands

Working directory is the workspace root (`/Users/tmarsh/git/arbor`). Source lives in `packages/router/`.

- Test suite: `pnpm --filter @arbor/router test`
- Type checking: `pnpm --filter @arbor/router typecheck`
- Run examples: `pnpm --filter @arbor/router run examples`
- Verification chain: `pnpm --filter @arbor/router test && pnpm --filter @arbor/router typecheck && pnpm lint && pnpm --filter @arbor/router run examples`
- Lint config: `/Users/tmarsh/git/arbor/eslint.config.js` (workspace root — no local config)

NOTE: Path structure described in `plan/topology.md`. Execution order in `plan/ledger.jsonl`.

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

## Effect Type Conventions

- **`Effect<undefined>`** is the canonical type for effects that produce no meaningful value (e.g., `sleep`, `pollTick`, mutation side-effects). Never use `Effect<void>` in interface or env types.
- **Why**: `void` is a function-return convention; `undefined` is a concrete value. `Effect.sleep` literally calls `send(undefined)` internally. Using `void` also triggers `@typescript-eslint/no-invalid-void-type` when written as an explicit generic arg in call expressions (e.g., `Effect.of<void>(...)`).
- **`Effect<never>`** is what `Effect.none()` returns and is assignable to any `Effect<T>` — use it for no-op effects in tests.
- **Contextual typing**: never write `Effect.of<void>(...)` or `Effect.none<void>()`. Rely on the binding-site annotation (`const env: LedgerEnv = { pollTick: Effect.of((send) => ...) }`) to drive inference. No explicit `void` type arg in any call expression.

## Non-Negotiable Working Style

**Invariants** (apply at all times, no exceptions):

1. **Smallest possible change** — one localized thing at a time. Prefer a 1-line change with a test over a multi-line refactor.
2. **Correct by construction** — parse, don't validate. Make illegal states unrepresentable with types, not runtime guards.
3. **No debt** — fix bad type casts immediately. Do not use `as any` without a documented comment explaining why.
4. **Preserve tests** — never delete or break past tests. Fix the refactor to match.
5. **Phantom types** — `_type` is strictly `undefined as never` at runtime. Never assign a real value. (`_child` removed in plan 47; child union is now derived via `FlattenChildrenImpl`.)
6. **One phase at a time** — complete the current phase in `plan/` fully before starting the next.

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
| `ws-chat.ts`        | `wsRoute` + `createWsServer` + `createWsClient` — typed bidirectional WS channel      |
| `ws-session.ts`     | `wsSessionRoute` + `createWsSessionServer` + `createWsSessionClient` — structured send/recv session protocol |

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
- Append a line to `plan/ledger.jsonl` to add the plan to the as a TODO. Example: `{ "type": "task", "id": 91, "epic": "e1", "story": "s4", "kind": "spike", "wave": "w16", "layer": "server", "status": "todo", "size": "m", "text": "Spike — multi-party structural session projections", "file": "91.spike-mpst.md", "deps": [ 87, 88 ] }`.

- Update `plan/roadmap.md` if the plan changes scope, deferred items, or long-horizon directions
- Every plan document must include the sections:
  - Context
  - Goal
  - Change Surface & T-shirt Sizing
  - Dependencies
  - Success Criteria

T-shirt Sizing guide:

- XS: trivial, < 1 hour, single file change
- S: small, a few hours, 1-3 files
- M: medium, half day to a day, several files
- L: large, 1-3 days, multiple files, some design
- XL: very large, 3+ days, major new system

## Testing Conventions section near existing test guidance.\n\n## Testing Conventions

- Use a single base mock with spread overrides; do NOT use per-test vi.fn() factories or vi.mock for env. Follow the TCA-style static object / dependency-injection idiom.
- Use valtio's snapshot() (not structuredClone) for state snapshots.
- Use effect-ts TestClock for time-based tests.
- Always include component and keyboard tests when applicable.

k
