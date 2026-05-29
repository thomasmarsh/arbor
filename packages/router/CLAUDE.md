# CLAUDE.md 🪐

## Active Focus

- **Current Task**: Plan 54 complete
- **Current Status**: Plans 19, 21, 25, 20, 27, 22, 26, 23, 42, 46, 47, 43, 36, 53, 54 complete. Plan 28 superseded by 47. Plan 54: `RouteCtx` removed; `Ctx` 5th type parameter added to `RouteNode`; `httpRoute()` returns `RouteNode<..., HttpContextData>`, `openApiRoute()` returns `RouteNode<..., OpenApiCtxData>`. See `plan/spec.workflow.md` for execution order.

## Strict System Rules (Zero Preamble)

- **Format**: Output raw `SEARCH/REPLACE` blocks immediately. The first byte of your reply must be the markdown code fence. Zero conversational introductions, filler, or conclusions.
- **Diff Structure**: Include 2-3 lines of matching context buffer code inside the `SEARCH` block. Never rewrite entire files.
- **Example Style**:

  ```diff
  <<<<<<< SEARCH
  export type Derive<N> = N extends RouteNode<unknown, any, any, any>
  =======
  export type Derive<N> = N extends RouteNode<unknown, any, any, any, infer Query>
  >>>>>>> REPLACE
  ```

## Working Commands

- Test suite: `pnpm test`
- Type checking: `pnpm run typecheck`
- Verification chain: `pnpm test && pnpm run typecheck && pnpm run lint`

NOTE: Path structure described in `plan/spec.topology.md`

## Architecture & Core Shapes

_URL router with full TS type inference without codegen. Route type is a nested discriminated union via phantom types. Read `plan/spec.architecture.md` for compiler constraints and structural edge cases._

```typescript
interface RouteNode<
  R,
  C extends RouteNode<unknown, any, any, any, any>[] = [],
  Context = never,
  SectionParams extends string = never,
  Ctx = Record<string, unknown>,
> {
  _type: R; // phantom (undefined as never)
  schema: z.ZodObject<any, any> | null;
  path: string;
  children: C;
  context?: Context; // concrete — carries runtime data
  _ctx?: Ctx; // typed plugin-context bag; HttpContextData for httpRoute(), OpenApiCtxData for openApiRoute()
}

type ChildUnion<C extends RouteNode<unknown, any, any, any, any>[]> = FlattenChildrenImpl<C>[number];

type Derive<N> = N extends RouteNode<unknown, any, any, any, any> ? FlattenChildrenImpl<[N]>[0] : never;
// FlattenChildrenImpl is a single self-recursive mapped type with a depth
// counter (up to 15 levels). Eliminates the mutual recursion that blocked
// removing _child.
```

- The core types like RouteNode should be as domain independent as much as possible. We use the `Context` type parameter in preference to baking in understanding of different schemes or protocols

## Non-Negotiable Working Style

0. **Break down work per session:** No refactor binges or endless pontificating. If a change too large, requires extensive decision-making, raises serious concerns, or otherwise would burn tokens, take either or both of these actions: a) add/update `plan/questions.md` for user consideration, and/or b) add tech debt plans in the `plan/` directory in format `plan/
1. **Smallest possible change**: One localized thing at a time. Prefer a 1-line change with a test.
2. **TDD Workflow**: Write failing tests/stubs first to verify ergonomics before updating runtime code.
3. **Test alongside**: Changes require tests (`expectTypeOf` for type-level, `expect` for runtime). Base cases first.
4. **Always verify**: Run verification chain after every single change. Fix failures before moving forward.
5. **Correct by construction**: Parse, don't validate. Use types over runtime checks to make illegal states unrepresentable.
6. **No Debt**: Fix bad type casts immediately. Do not use `as any` without a documented comment reason.
7. **Phantom types**: `_type` is strictly `undefined as never` at runtime. Used for inference only. (`_child` was removed in plan 47; child union is now derived via `FlattenChildrenImpl`.)
8. **Preserve tests**: Never delete or break past tests. Fix the refactor to match.
9. **One phase at a time**: Complete the current phase in `plan/` fully before starting the next.

## Examples (`examples/`)

Self-contained runnable demos in `examples/`. Run them as a smoke test with `pnpm run examples`.

**Keep them current**: when a plan changes the public API, update any example that exercises it. The examples are the human-facing documentation — stale examples are worse than no examples.

| File | What it shows |
| --- | --- |
| `basic-server.ts` | `createServer` + `handle()` dispatch |
| `basic-client.ts` | `createClient.fetch()` with typed responses |
| `query-params.ts` | `httpRoute` with a Zod query schema |
| `nested-routes.ts` | Nested `route()` tree; `parse()` + `print()` roundtrip |
| `openapi-output.ts` | `generateSpec()` → stdout JSON |
| `enrichers.ts` | `withEnricher` + `composeEnrichers` — pre-handler auth/plan checks |
| `typed-client.ts` | `createClient` options object API; typed request headers; `TypedClient` utility type |
| `auth-protected.ts` | _Pending plan 39_ |

**Rules for examples**:

- Import only from `../src/index.js` (no publish step needed).
- No `expect`/`describe` — real code only.
- Every example must produce visible output when run with `tsx`.
- Add the new entry to the table above when you add a file.

## Planning

When planning, use the following rules:

- Place a plan document in plan/ (using the next available number). Format: `plan/<sequence>.<topic>.md`
- Update `plan/questions.md` if there are open questions for me to resolve
- Update `plan/spec.workflow.md` if you need to change order or give other meta work direction
- Every plan document must include the sections:
  - Context
  - Goal
  - Change Surface
  - Dependencies
  - Success Criteria
