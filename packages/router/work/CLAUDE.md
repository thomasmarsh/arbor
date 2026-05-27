# arbor-router

A URL router with full TypeScript type inference. No codegen. No manual type declarations.
The `Route` type is a nested discriminated union derived statically via phantom types.

## Working style

These rules are non-negotiable. Follow them on every change:

1. **Smallest possible change.** One thing at a time. If a change feels big, find
   a smaller version of it. A one-line change with a test is better than a
   ten-line change without one.

2. **Test first or alongside.** Every change to `define-routes.ts` needs a
   corresponding test. Type-level changes use `expectTypeOf`. Runtime changes
   use `expect`. Both count.

3. **Always verify before moving on.** After every change run:
```bash
   npm test && npm run typecheck
```
   Do not proceed if either fails. Fix it first.

4. **Correct by construction.** Prefer making illegal states unrepresentable
   in the type system over runtime checks. If something can be wrong, make it
   a type error. Parse don't validate — accept unstructured input at the
   boundary, return structured typed output, never pass unvalidated data inward.

5. **Don't accumulate debt.** If a type cast feels wrong, stop and fix it. If
   a test is asserting something that feels untrue, stop and understand why.
   Don't paper over type errors with `as any` unless there is a documented
   reason in a comment.

6. **Phantom types are intentional.** `_type`, `_child`, `_context` fields are
   always `undefined as never` at runtime. They exist only for type inference.
   Never assign real values to them.

7. **Preserve existing tests.** No phase should break a test from a previous
   phase. If a refactor breaks a test, fix the test or fix the refactor —
   don't delete the test.

8. **One phase at a time.** Complete the current phase fully before starting
   the next. Phases are in `PLAN.md`.

---

## Architecture

### Key types

```typescript
// The tree node — all inference flows through here
interface RouteNode
  R,        // this node's route type (z.infer<S>)
  Child,    // union of child route types
  C extends RouteNode<unknown, unknown, any, any>[] = [],  // children tuple
  Context = never,   // open extension slot — never = no extension
> {
  _type:    R;        // phantom
  _child:   Child;    // phantom
  _context: Context;  // phantom
  schema:   z.ZodObject<any, any> | null;  // null for section()
  path:     string;
  children: C;
}

// Derives the nested Route type from a tuple of RouteNodes
type ChildUnion<C extends RouteNode<unknown, unknown, any, any>[]> = {
  [K in keyof C]: Derive<C[K]>
}[number]

// Derives the type for a single node
type Derive<N> =
  N extends RouteNode<infer R, infer Child, any, any>
    ? [R] extends [never]
      ? Flatten<{ child: Child }>           // section — child required
      : [Child] extends [never]
        ? Flatten<R>                        // leaf — no child
        : Flatten<R & { child?: Child }>    // tagged node — optional child
    : never
```

### Non-obvious decisions

- `z.ZodObject<any, any>` — Zod v4 takes 2 type params not 3
- `[...C]` on children — spread preserves tuple type for ChildUnion inference
- `[R] extends [never]` — tuple prevents distributive conditional behaviour
- `C extends RouteNode<unknown, unknown, any, any>[]` — `unknown` not `any`
  for R and Child, or inference widens to `any`
- `tsc --noEmit` not `tsc -b --noEmit` — the `-b` flag propagates noEmit to
  referenced projects, breaking composite builds

### Result type

Local stub in `src/result.ts`. Not the full `@arbor/common` version.
API: `Result.success`, `Result.failure`, `Result.isSuccess`, `Result.isFailure`.

---

## Current state

All tests pass. Implementation complete for core URL routing.
See `PLAN.md` for what comes next.

## Commands

```bash
npm test              # run tests once
npm run test:watch    # watch mode
npm run typecheck     # typecheck only
```
