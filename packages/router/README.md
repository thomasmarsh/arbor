# @arbor/router

A TypeScript URL router with full type inference and no codegen. Route schemas are Zod objects; the router derives a discriminated union of all routes at compile time and validates at runtime. One definition drives URL parsing, URL construction, HTTP servers, typed HTTP clients, and OpenAPI spec generation.

## Install

```sh
pnpm add @arbor/router zod
```

## Define routes

Every route has a Zod schema with a `tag: z.literal(...)` field. The tag is the runtime discriminant; path parameters are additional fields.

```typescript
import z from 'zod';
import { defineRoutes, route, httpRoute, respond } from '@arbor/router';

const Users    = z.object({ tag: z.literal('users') });
const User     = z.object({ tag: z.literal('user'), id: z.string() });
const Settings = z.object({ tag: z.literal('settings') });

const router = defineRoutes([
  route(Users, 'users', [
    route(User, ':id', [
      route(Settings, 'settings'),
    ]),
  ]),
]);
```

### Parse and print

`parse(url)` returns a `Result<Route, string>`. Matched routes are **nested discriminated union objects** — each parent includes its matched child at the `child` key.

`print(route)` reconstructs the URL from a route object. Parse and print round-trip exactly.

```typescript
router.parse(new URL('http://localhost/users/42/settings')).getOrThrow();
// { tag: 'users', child: { tag: 'user', id: '42', child: { tag: 'settings' } } }

router.print({ tag: 'users', child: { tag: 'user', id: '42' } });
// '/users/42'
```

TypeScript narrows each `tag` branch fully — `route.child.id` is `string` when `route.child.tag === 'user'`.

## HTTP routes

`httpRoute()` attaches an HTTP method and request/response contracts to a route node. It feeds `createServer()` and `createClient()`.

```typescript
const GetUser = z.object({ tag: z.literal('get-user'), id: z.string() });
const UserResp = z.object({ id: z.string(), name: z.string() });

const router = defineRoutes([
  httpRoute(GetUser, 'GET', 'users/:id', {
    response: {
      200: UserResp,
      404: z.object({ error: z.string() }),
    },
  }),
]);
```

## HTTP server

`createServer()` takes the router and a handler map keyed by tag. Handlers receive validated `params`, `body`, `query`, `headers`, and `cookies`; they return a value via `respond()`.

```typescript
import { createServer, respond } from '@arbor/router';

const server = createServer(router, {
  'get-user': async (ctx) => {
    return ctx.params.id === '42'
      ? respond(200, { id: '42', name: 'Alice' })
      : respond(404, { error: 'user not found' });
  },
});

// Low-level dispatch (returns a plain object):
await server.handle(new URL('http://localhost/users/42'), 'GET');
// { status: 200, body: { id: '42', name: 'Alice' }, tag: 'get-user' }

// Web-standard Request/Response dispatch:
await server.handleRequest(new Request('http://localhost/users/99'));
// { status: 404, body: { error: 'user not found' }, tag: 'get-user' }
```

The handler map is **fully typed** — each tag's `ctx` shape is inferred from the route schema, and the return type is the union of all declared response shapes.

## Type-safe client

`createClient()` mirrors the server API. It derives method and response types from the same router definition.

```typescript
import { createClient } from '@arbor/router';

const client = createClient('https://api.example.com', router);

const route = router.parse(new URL('http://localhost/users/7')).getOrThrow();
const response = await client.fetch(route);
// type: { status: 200; body: { id: string; name: string } }
//      | { status: 404; body: { error: string } }

if (response.status === 200) {
  console.log(response.body.name); // string — fully narrowed
}
```

Pass a custom `fetch` implementation to use the client without real HTTP (useful for testing):

```typescript
const client = createClient('http://localhost', router, { fetch: mockFetch });
```

## Query parameters

Declare a `query` Zod schema on the route; it is parsed and coerced separately from path params. The validated result arrives at `ctx.query` in handlers and at `route.query` after `parse()`.

```typescript
const SearchItems = z.object({ tag: z.literal('search-items') });
const SearchQuery = z.object({
  q: z.string(),
  page: z.coerce.number().default(1),
});

const router = defineRoutes([
  httpRoute(SearchItems, 'GET', 'items', {
    query: SearchQuery,
    response: { 200: z.object({ results: z.array(z.string()) }) },
  }),
]);

const route = router.parse(new URL('http://localhost/items?q=hello&page=3')).getOrThrow();
console.log(route.query.page); // 3  (number, coerced from string)
```

## Request validation

Declare `headers`, `cookies`, and `body` schemas on the route. The server validates them before calling the handler; invalid inputs return a 400 response automatically.

```typescript
httpRoute(PostOrder, 'POST', 'orders', {
  body: z.object({ itemId: z.string(), qty: z.number() }),
  headers: z.object({ 'x-api-key': z.string() }),
  response: { 201: z.object({ orderId: z.string() }) },
})
```

## Response validation

Use `desc()` when a response includes typed headers or cookies alongside the body.

```typescript
import { desc } from '@arbor/router';

httpRoute(Login, 'POST', 'login', {
  response: {
    200: desc(
      z.object({ userId: z.string() }),
      { cookies: z.object({ 'session-id': z.string() }) },
    ),
    401: z.object({ error: z.string() }),
  },
})
```

## Guards

Guards are pre-handler steps that can short-circuit with an early response or extend the handler context with new typed fields.

```typescript
import { type Guard, withGuard, composeGuards } from '@arbor/router';

interface BaseCtx { req: Request }

const authGuard: Guard<BaseCtx, { userId: string }> = (ctx) => {
  const auth = ctx.req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer '))
    return Promise.resolve({ ok: false, response: new Response('Unauthorized', { status: 401 }) });
  return Promise.resolve({ ok: true, ctx: { ...ctx, userId: auth.slice(7) } });
};

// Single guard:
const handler = withGuard(authGuard, (ctx) =>
  Promise.resolve(new Response(`Hello ${ctx.userId}`)),
);

// Chained guards — both must pass; types accumulate:
const planGuard: Guard<BaseCtx & { userId: string }, { plan: string }> = ...;
const composed = composeGuards(authGuard, planGuard);
```

Built-in guards: `withSession` (JWT), `withRbac` (role check), `withApiKey`, `withRateLimit`, `withMetrics`, `withCors`.

## Rate limiting

Per-route via `httpRoute()` options:

```typescript
httpRoute(SearchItems, 'GET', 'items', {
  response: { 200: ResultSchema },
  rateLimit: { windowMs: 60_000, maxRequests: 100 },
})
```

Custom store and key resolver via `createServer()` options:

```typescript
createServer(router, handlers, {
  rateLimitStore: redisStore,
  rateLimitKeyResolver: ({ headers }) => headers['x-user-id'] ?? 'anon',
})
```

## CORS

Per-route via `httpRoute()` options or applied globally via `withCors()`:

```typescript
import { withCors } from '@arbor/router';

const corsMiddleware = withCors({
  origins: ['https://app.example.com'],
  methods: ['GET', 'POST'],
  credentials: true,
  csrf: true,
});
```

## OpenAPI

`openApiRoute()` extends `httpRoute()` with OpenAPI metadata. `generateSpec()` walks the router and produces an OpenAPI 3.1 document.

```typescript
import { openApiRoute, generateSpec } from '@arbor/router';

const router = defineRoutes([
  openApiRoute(GetUser, 'GET', 'users/:id', {
    response: { 200: UserResp, 404: z.object({ error: z.string() }) },
    meta: { summary: 'Get a user by ID', tags: ['users'] },
  }),
]);

const spec = generateSpec(router, { title: 'My API', version: '1.0.0' });
// spec is a plain object — serialize with JSON.stringify
```

## Sections

`section()` groups routes under a shared path prefix and accumulates typed section parameters (useful for multi-tenant or versioned APIs where the prefix itself carries semantic data).

```typescript
import { section, defineRoutes } from '@arbor/router';

const TenantSection = z.object({ tenantId: z.string() });

const router = defineRoutes([
  section(TenantSection, 'tenants/:tenantId', [
    route(Dashboard, 'dashboard'),
  ]),
]);

router.print({ tag: 'dashboard' }, { tenantId: 'acme' });
// '/tenants/acme/dashboard'
```

## Type utilities

| Type | Purpose |
| ---- | ------- |
| `Derive<Router>` | Discriminated union of all routes in a router |
| `InferRoute<Router, Tag>` | Single route type for a given tag |
| `InferContext<Router, Tag>` | Handler context shape (params, body, query, …) |
| `CtxMap<Router>` | Map from tag → full `HttpContext` |
| `HandlerCtx<CtxMap, Routes, Tag>` | Explicit handler context type |
| `HandlerMap<CtxMap, Routes>` | Full handler map type |
| `HttpResponse<Status, Body>` | Generic response shape |
| `Guard<Ctx, Extra>` | Guard function type |
| `TypedClient<Route, Map>` | Client type for a given router |
