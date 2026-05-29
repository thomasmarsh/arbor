# CLAUDE.md 🪐

## Active Focus

- **Current Task**: Ready to begin `plan/20.print-section-params.md`.
- **Current Status**: Plans 19–28 queued (24 deferred). See `plan/spec.workflow.md` for execution order.

## Strict System Rules (Zero Preamble)

- **Format**: Output raw `SEARCH/REPLACE` blocks immediately. The first byte of your reply must be the markdown code fence. Zero conversational introductions, filler, or conclusions.
- **Diff Structure**: Include 2-3 lines of matching context buffer code inside the `SEARCH` block. Never rewrite entire files.
- **Example Style**:

  ```diff
  <<<<<<< SEARCH
  export type Derive<N> = N extends RouteNode<infer R, infer Child, any, any>
  =======
  export type Derive<N> = N extends RouteNode<infer R, infer Child, any, any, infer Query>
  >>>>>>> REPLACE
  ```

## Working Commands

- Test suite: `npm test`
- Type checking: `npm run typecheck`
- Verification chain: `npm test && npm run typecheck`

NOTE: Path structure described in `plan/spec.topology.md`

## Architecture & Core Shapes

_URL router with full TS type inference without codegen. Route type is a nested discriminated union via phantom types. Read `plan/spec.architecture.md` for compiler constraints and structural edge cases._

```typescript
interface RouteNode<
  R,
  Child,
  C extends RouteNode<unknown, unknown, any, any>[] = [],
  Context = never,
> {
  _type: R; // phantom (undefined as never)
  _child: Child; // phantom (undefined as never)
  schema: z.ZodObject<any, any> | null;
  path: string;
  children: C;
  context?: Context; // concrete — carries runtime data
}

type ChildUnion<C extends RouteNode<unknown, unknown, any, any>[]> = {
  [K in keyof C]: Derive<C[K]>;
}[number];

type Derive<N> =
  N extends RouteNode<infer R, infer Child, any, any>
    ? [R] extends [never]
      ? Flatten<{ child: Child }>
      : [Child] extends [never]
        ? Flatten<R>
        : Flatten<R & { child?: Child }>
    : never;
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
7. **Phantom types**: `_type` and `_child` are strictly `undefined as never` at runtime. Used for inference only.
8. **Preserve tests**: Never delete or break past tests. Fix the refactor to match.
9. **One phase at a time**: Complete the current phase in `plan/` fully before starting the next.

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
