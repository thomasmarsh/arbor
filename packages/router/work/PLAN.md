# arbor-router — Development Plan

## Current state

Full working implementation of a typed URL router. All tests pass.
See `src/define-routes.ts` and `src/define-routes.test.ts`.

The `RouteNode` interface currently has 4 type parameters:

```typescript
interface RouteNode<R, Child, C extends RouteNode<unknown, unknown, any, any>[] = [], Context = never>
```

`Context` is defined but not yet used. That's where we're starting.

---

## Phase 1 — Add Context parameter to RouteNode

**Goal:** Thread `Context` through the type machinery without breaking anything.

**Steps:**
1. Add `Context = never` as 4th type param to `RouteNode`
2. Add `_context: Context` phantom field
3. Update all internal usages of `RouteNode<...>` to include the 4th param
4. Update `route()` and `section()` return types to pass `never` for Context
5. Update `ChildUnion` and `Derive` to thread Context through
6. **All existing tests must still pass — no new tests needed yet**

**Verify:** `npm test` green, `npm run typecheck` clean.

**Do not:** Add any HTTP concepts. Context stays `never` for now.

---

## Phase 2 — InferContext helper

**Goal:** Expose a clean way to extract Context from a RouteNode.

**Steps:**
1. Add `export type InferContext<N extends { _context: unknown }> = N['_context']`
2. Add compile-time tests using `expectTypeOf`:

```typescript
type T1 = InferContext<RouteNode<{ tag: 'user' }, never, [], never>>;
// expected: never

type T2 = InferContext<RouteNode<{ tag: 'user' }, never, [], { method: 'GET' }>>;
// expected: { method: 'GET' }
```

**Verify:** `npm test` green, `npm run typecheck` clean.

---

## Phase 3 — HTTP Context type (no implementation yet)

**Goal:** Define the HTTP extension type in isolation. Pure types, no runtime code.

**Steps:**
1. Create `src/http-context.ts`
2. Define:

```typescript
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type HttpContext
  Method extends HttpMethod,
  Body,
  Response extends Record<number, unknown>,
> = {
  method:   Method;
  body:     Body;
  response: Response;
}
```

3. Add type-level tests in `src/http-context.test.ts`:

```typescript
import { expectTypeOf } from 'vitest';
import type { HttpContext } from './http-context.js';

type GetUser = HttpContext<'GET', never, { 200: { id: string } }>;

expectTypeOf<GetUser['method']>().toEqualTypeOf<'GET'>();
expectTypeOf<GetUser['body']>().toEqualTypeOf<never>();
```

**Verify:** `npm test` green, `npm run typecheck` clean.

**Do not:** Touch `define-routes.ts` yet.

---

## Phase 4 — httpRoute() constructor

**Goal:** A constructor that creates a `RouteNode` with `HttpContext` attached.

**Steps:**
1. Add to `src/http-context.ts`:

```typescript
export function httpRoute
  S extends z.ZodObject<any, any>,
  Method extends HttpMethod,
  C extends RouteNode<unknown, unknown, any, any>[] = [],
  Body = never,
  Response extends Record<number, unknown> = Record<number, unknown>,
>(
  schema:   S,
  method:   Method,
  path:     string,
  options:  { body?: z.ZodType<Body>; response: Response },
  children?: [...C],
): RouteNode<z.infer<S>, ChildUnion<C>, [...C], HttpContext<Method, Body, Response>>
```

2. Add tests:

```typescript
const GetUser = z.object({ tag: z.literal('get-user'), id: z.string() });
const UserResponse = z.object({ id: z.string(), email: z.string() });

const r = httpRoute(GetUser, 'GET', ':id/', {
  response: { 200: UserResponse },
});

type T = InferContext<typeof r>;
// expected: HttpContext<'GET', never, { 200: { id: string; email: string } }>

expectTypeOf<T['method']>().toEqualTypeOf<'GET'>();
```

**Verify:** `npm test` green, `npm run typecheck` clean.

---

## Phase 5 — Typed server handler

**Goal:** A `createServer()` that takes a router with HTTP context and produces
exhaustively typed handlers.

**Steps:**
1. Create `src/server.ts`
2. Define:

```typescript
type HandlerMap<Routes> = {
  [K in Routes as K extends { tag: infer T extends string } ? T : never]:
    K extends { tag: string } 
      ? InferContext<???> extends HttpContext<any, infer Body, infer Response>
        ? (route: K, body: Body) => Promise<{ [S in keyof Response]: { status: S; body: Response[S] } }[keyof Response]>
        : never
      : never
}
```

3. Tests: handler gets correct types for route params, body, and response.

**Verify:** `npm test` green, `npm run typecheck` clean.

---

## Phase 6 — Typed fetch client

**Goal:** A `createClient()` that takes a router with HTTP context and produces
a typed fetch function.

**Steps:**
1. Create `src/client.ts`
2. Takes a base URL and router
3. `client.fetch({ tag: 'get-user', id: '123' })` returns typed response
4. Tests cover happy path and error status codes

**Verify:** `npm test` green, `npm run typecheck` clean.

---

## Phase 7 — OpenAPI context (stretch)

**Goal:** Extend HttpContext with metadata for OpenAPI spec generation.

**Steps:**
1. Create `src/openapi-context.ts`
2. `OpenApiContext` extends `HttpContext` with `meta` field
3. `openApiRoute()` constructor
4. `generateSpec()` walks the tree and produces OpenAPI 3.1 JSON
5. Tests verify spec shape for known routes

---

## Guard rails

**After every phase:**
- `npm test` must be green
- `npm run typecheck` must be clean
- No changes to `define-routes.ts` unless the phase explicitly requires it
- No phase should break tests from a previous phase

**If Claude Code goes off the rails:**
- Run `npm test` — if red, revert the last change
- Run `npm run typecheck` — if errors, look at what changed in the type signatures
- The most likely failure modes are:
  - `ChildUnion` or `Derive` losing type information when Context is threaded through
  - `RouteNode` constraint changes causing `any` to spread
  - Zod v4 type param count (`ZodObject<any, any>` not `ZodObject<any, any, any>`)

**Key invariants that must never break:**
- `type Route = InferRoute<typeof router>` produces a proper discriminated union
- `router.parse(url)` returns `Result<Route, string>`
- `router.print(route)` returns a string
- Sub-router composition via spread works
- `section()` nodes are not valid terminal routes
