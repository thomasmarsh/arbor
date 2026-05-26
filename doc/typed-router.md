# A Fully Type-Safe Nested Router in TypeScript

> A URL router where the schema _is_ the type, routes form a tree not a flat list,
> and `Route` is a proper nested discriminated union — derived statically with no
> codegen, no manual type declarations, and no macros.

## Motivation

Most typed routers take one of two approaches:

**Codegen** — a build step generates types from route definitions (TanStack Router
file-based, tRPC). This works but adds tooling complexity and a build step that
must run before TypeScript can typecheck your code.

**Manual declarations** — you write both the route config and the TypeScript types
separately, kept in sync by convention. They drift. They always drift.

The ideal is that the route definition _is_ the type. Declare a Zod schema, get a
TypeScript type for free. No duplication. No drift.

We also had an architectural constraint: routes needed to be a _tree_, not a flat
list. Two different sub-apps in a large enterprise codebase can both have an
`issue` route — they need to be structurally distinct, not collapsed into one type.

## What We Built

```typescript
// declare schemas — these ARE the types
const Users = z.object({ tag: z.literal('users') });
const User = z.object({ tag: z.literal('user'), id: z.string() });
const Project = z.object({ tag: z.literal('project'), projectId: z.number() });
const Issue = z.object({
  tag: z.literal('issue'),
  issueId: z.string(),
  status: z.enum(['open', 'closed']).optional(),
  page: z.coerce.number().default(1),
});

export type Users = z.infer<typeof Users>;
export type User = z.infer<typeof User>;
export type Project = z.infer<typeof Project>;
export type Issue = z.infer<typeof Issue>;

// wire the tree
export const router = defineRoutes([
  route(Users, 'users/', [route(User, ':id/')]),
  section('orgs/:orgId/', [route(Project, '#projectId/', [route(Issue, ':issueId/')])]),
]);

// Route type falls out for free
export type Route = InferRoute<typeof router>;
```

`Route` is a fully typed nested discriminated union:

```typescript
type Route =
  | { tag: 'users'; child?: { tag: 'user'; id: string } }
  | {
      child: {
        // section — child required
        tag: 'project';
        projectId: number;
        child?: {
          tag: 'issue';
          issueId: string;
          status?: 'open' | 'closed';
          page: number;
        };
      };
    };
```

`router.parse(url)` returns `Result<Route, string>`. `router.print(route)` returns
a URL string including query params. Both are backed by Zod at runtime.

## The Core Idea: Phantom Types

The naive approach — build a Zod `discriminatedUnion` at runtime and call
`z.infer` on it — doesn't work:

```typescript
// loses all type information
function compileSchema(nodes: ASTNode[]) {
  const objects: z.ZodObject<any>[] = [];
  // populate dynamically at runtime...
  return z.discriminatedUnion('tag', objects);
  // z.infer gives Record<string, unknown> — TypeScript can't see inside
}
```

TypeScript's type inference is purely static. A schema built by pushing objects
into an array at runtime is opaque to the type system.

The solution is to carry the type as a **phantom** — a type parameter that exists
only at compile time and is erased at runtime:

```typescript
interface RouteNode<R, Child, C extends RouteNode<unknown, unknown, any>[] = []> {
  _type: R; // phantom — always undefined at runtime
  _child: Child; // phantom — always undefined at runtime
  schema: z.ZodObject<any, any, any> | null;
  path: string;
  children: C;
}
```

`_type` and `_child` are assigned `undefined as never` at runtime. They exist
purely so TypeScript can track the inferred type through `typeof node._type`.
`InferRoute<typeof router>` is then just `typeof router._type`.

## The Type-Level Tree Walk

The nested `Route` type is derived by a type-level function that mirrors the
runtime tree walk:

```typescript
// derive the nested type for a single node
type Derive<N> =
  N extends RouteNode<infer R, infer Child, any>
    ? [R] extends [never]
      ? Flatten<{ child: Child }> // section — child required
      : [Child] extends [never]
        ? Flatten<R> // leaf — no child field
        : Flatten<R & { child?: Child }> // tagged node with children — optional child
    : never;

// derive the union across a tuple of nodes
type ChildUnion<C extends RouteNode<unknown, unknown, any>[]> = {
  [K in keyof C]: Derive<C[K]>;
}[number];
```

`Flatten<T> = { [K in keyof T]: T[K] }` converts intersections like
`{ tag: 'user' } & { child?: ... }` into clean object types.

`[R] extends [never]` wraps in a tuple to prevent TypeScript's distributive
conditional behaviour — bare `never extends never` is unreliable.

## Five Hard-Won Discoveries

Getting TypeScript to correctly infer `R` through a recursive tree required
working through several non-obvious problems.

### 1. `any` poisons inference

Using `RouteNode<any>` anywhere in a constraint causes TypeScript to widen
everything to `any`. The constraint must use `unknown`:

```typescript
// wrong — poisons inference
C extends RouteNode<any>[]

// correct — preserves specific types
C extends RouteNode<unknown, unknown, any>[]
```

### 2. `z.ZodObject<any, any, any>` not `z.ZodRawShape`

The constraint `S extends z.ZodObject<z.ZodRawShape>` loses the shape
information needed for `z.infer<S>` to work. Zod's own internal constraint
`z.ZodObject<any, any, any>` preserves it:

```typescript
function route<S extends z.ZodObject<any, any, any>>(schema: S): z.infer<S>;
//                                   ^^^^^^^^^^^^^^
//              three `any` parameters preserves shape inference
```

### 3. `[...C]` preserves tuple types

Without the spread, TypeScript infers the children argument as
`RouteNode<unknown, unknown, any>[]` — an array — losing the specific element
types. The spread forces inference as a tuple:

```typescript
function route<C extends RouteNode<unknown, unknown, any>[] = []>(
  children?: [...C], // spread preserves [RouteNode<A>, RouteNode<B>]
); // not RouteNode<unknown>[]
```

### 4. Children must be a type parameter, not a field type

Storing children as `RouteNode<unknown, unknown, any>[]` in the interface field
loses type information when reading it back. The solution is to make the children
tuple a third type parameter `C` on `RouteNode`:

```typescript
interface RouteNode<R, Child, C extends RouteNode<unknown, unknown, any>[] = []> {
  children: C; // typed as the specific tuple, not the base constraint
}
```

This means `typeof node.children` preserves the exact tuple, which is essential
for composition via spread.

### 5. Default type parameter prevents widening on empty children

Without a default, `C` is inferred as `RouteNode<unknown, unknown, any>[]` when
no children are passed, and `ChildUnion<C>` resolves to `unknown`. Adding `= []`
as the default ensures empty children give `never`:

```typescript
function route<
  S extends z.ZodObject<any, any, any>,
  C extends RouteNode<unknown, unknown, any>[] = []  // default prevents widening
>
```

## Section Nodes

A `section` is a path prefix that is not itself a valid terminal route. Because
its `R` type parameter is `never`, `Derive` produces `{ child: Child }` with a
**required** child — making it impossible to represent a section without a child
in the type system:

```typescript
// section nodes cannot be terminal — parse returns failure
section('orgs/:orgId/', [route(Project, '#projectId/')]);
// /orgs/acme       → Result.failure (not a valid terminal route)
// /orgs/acme/42    → { child: { tag: 'project', projectId: 42 } }
```

This is the type system enforcing a real constraint: some URL prefixes are
structural, not navigable.

## Composition

Because `children` is typed as the specific tuple `C`, sub-routers can be spread
into a parent router while preserving their types:

```typescript
const orgRoutes  = defineRoutes([route(Org, 'orgs/:orgId/', [...])]);
const userRoutes = defineRoutes([route(Users, 'users/', [...])]);

const router = defineRoutes([
  ...orgRoutes.children,   // types preserved through spread
  ...userRoutes.children,
]);

type Route = InferRoute<typeof router>;
// OrgRoute | UserRoute — full union, no information lost
```

Two completely independent sub-apps can both define `{ tag: 'issue' }` routes and
they remain structurally distinct:

```typescript
// orgs sub-app
{ child: { tag: 'project'; child?: { tag: 'issue'; ... } } }

// support sub-app
{ child: { tag: 'ticket'; child?: { tag: 'issue'; ... } } }
```

No collision. The nesting is the namespace.

## The DSL

The full route definition syntax supports:

| Path syntax | Meaning                                         |
| ----------- | ----------------------------------------------- |
| `'users/'`  | literal segment                                 |
| `':id/'`    | string param                                    |
| `'#id/'`    | numeric param (coerced by Zod)                  |
| `':id?/'`   | optional string param                           |
| `'#id?/'`   | optional numeric param                          |
| `'*rest/'`  | wildcard — captures remaining segments as array |
| `'a/b/:c/'` | multiple segments in one node                   |

Query params are declared in the Zod schema — any schema key that is not captured
as a path param is treated as a query param during parse and print:

```typescript
const Issue = z.object({
  tag: z.literal('issue'),
  issueId: z.string(), // path param (from ':issueId/')
  status: z.enum(['open', 'closed']).optional(), // query param
  page: z.coerce.number().default(1), // query param with default
});

router.parse(new URL('https://x.com/issues/7?status=open&page=2'));
// { tag: 'issue', issueId: '7', status: 'open', page: 2 }

router.print({ tag: 'issue', issueId: '7', status: 'open', page: 2 });
// '/issues/7?status=open&page=2'
```

## Known Limitations

**Default values in print** — `page: 1` will be serialised if present in the
route object. `parse` applies defaults on the way in; `print` serialises whatever
is in the route. Callers should omit default-valued fields for clean URLs.

**Optional child** — a tagged node with children produces `child?: Child`. There
is no way to express "this node has children and is never a valid terminal" without
using `section`. This is a deliberate tradeoff — use `section` when a prefix
should not be navigable.

**Zod v3/v4 compatibility** — Zod v4 changed `shape` from a property to a
function. We handle both internally but this is a dependency on an implementation
detail.

## Prior Art and Inspiration

- **PointFree's parser/printer router**

  The direct inspiration for this work.
  Brandon Williams and Stephen Celis developed a bidirectional router for Swift
  based on the parser/printer pattern, featured in their [Point-Free series on
  parsers](https://www.pointfree.co/collections/parsing). Their Swift DSL using
  result builders and case paths is the clearest prior statement of the idea that
  a route definition should be simultaneously a parser and a printer. We pursued
  the same principle in TypeScript, adapting it to the constraints of the type
  system and the browser.

- **Servant** (Haskell)

  A type-level route DSL where the route definition is the
  type, verified at compile time. The same principle, but Haskell's type system
  (type families, GADTs, type-level strings) makes it considerably more natural.
  We achieved a similar result in TypeScript through phantom types and careful
  generic constraints rather than type-level computation.

- **tRPC**

  Fully typed end-to-end but procedure-oriented and server-focused, not
  URL routing.

A clean TypeScript client-side router with full nested type inference, Zod-backed
validation, composable sub-routers, and zero codegen does not appear to exist as
a standalone library. The combination of phantom types, tuple-preserving generics,
and recursive type derivation is what makes it possible — and the parser/printer
insight from PointFree is what made us reach for it in the first place.
