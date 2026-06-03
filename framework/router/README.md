# @arbor/router

A TypeScript typed protocol framework. One route definition tree drives URL parsing, URL
construction, HTTP server dispatch, typed SSE streams, typed WebSocket channels, typed HTTP
clients, and OpenAPI spec generation — all without codegen.

→ For the full feature list, comparison table, and roadmap see [FEATURES.md](../../FEATURES.md).

---

## Install

```sh
pnpm add @arbor/router zod
```

---

## Define routes

Every route has a Zod schema with a `tag: z.literal(...)` field. The tag is the runtime
discriminant; path parameters are additional fields.

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

`parse(url)` returns a `Result<Route, string>`. Matched routes are **nested discriminated
union objects** — each parent includes its matched child at the `child` key.

`print(route)` reconstructs the URL from a route object. Parse and print round-trip exactly.

```typescript
router.parse(new URL('http://localhost/users/42/settings')).getOrThrow();
// { tag: 'users', child: { tag: 'user', id: '42', child: { tag: 'settings' } } }

router.print({ tag: 'users', child: { tag: 'user', id: '42' } });
// '/users/42'
```

TypeScript narrows each `tag` branch fully — `route.child.id` is `string` when
`route.child.tag === 'user'`.

---

## HTTP routes

`httpRoute()` attaches an HTTP method and request/response contracts to a route node. It
feeds `createServer()` and `createClient()`.

```typescript
const GetUser  = z.object({ tag: z.literal('get-user'), id: z.string() });
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

---

## HTTP server

`createServer()` takes the router and a handler map keyed by tag. Handlers receive validated
`params`, `body`, `query`, `headers`, and `cookies`; they return a value via `respond()`.

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

// WinterCG Request/Response dispatch:
await server.handleRequest(new Request('http://localhost/users/99'));
// Response { status: 404, body: { error: 'user not found' } }
```

The handler map is **fully typed** — each tag's `ctx` shape is inferred from the route
schema, and the return type is the union of all declared response shapes. Uncaught handler
exceptions are caught automatically, mapped to 500, and emit a `RequestMetric`.

---

## Type-safe client

`createClient()` mirrors the server API, deriving method and response types from the same
router definition.

```typescript
import { createClient, matchResponse } from '@arbor/router';

const client = createClient('https://api.example.com', router);

const route    = router.parse(new URL('http://localhost/users/7')).getOrThrow();
const response = await client.fetch(route);
// type: { status: 200; body: { id: string; name: string } }
//      | { status: 404; body: { error: string } }

// Exhaustive response combinator — TypeScript error if any declared status is unhandled:
const name = matchResponse(response, {
  200: (r) => r.body.name,
  404: (r) => { throw new Error(r.body.error); },
});
```

Pass a custom `fetch` implementation to use the client without real HTTP:

```typescript
const client = createClient('http://localhost', router, { fetch: mockFetch });
```

---

## Query parameters

Declare a `query` Zod schema on the route; it is parsed and coerced separately from path
params. The validated result arrives at `ctx.query` in handlers.

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
console.log(route.query.page); // 3 (number, coerced from string)
```

---

## Request validation

Declare `headers`, `cookies`, and `body` schemas on the route. The server validates them
before calling the handler; invalid inputs return 400 automatically.

```typescript
httpRoute(PostOrder, 'POST', 'orders', {
  body: z.object({ itemId: z.string(), qty: z.number() }),
  headers: z.object({ 'x-api-key': z.string() }),
  response: { 201: z.object({ orderId: z.string() }) },
})
```

---

## Response helpers

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

---

## Guards

Guards are pre-handler steps that can short-circuit with an early response or extend the
handler context with new typed fields. Use the `.use()` fluent builder for left-to-right
readability, or `withGuard` / `composeGuards` for raw composition.

```typescript
import { type Guard, withGuard, composeGuards } from '@arbor/router';

interface BaseCtx { req: Request }

const authGuard: Guard<BaseCtx, { userId: string }> = (ctx) => {
  const auth = ctx.req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer '))
    return Promise.resolve({ ok: false, response: new Response('Unauthorized', { status: 401 }) });
  return Promise.resolve({ ok: true, ctx: { ...ctx, userId: auth.slice(7) } });
};

// Fluent builder — left-to-right, identical output to the factory form:
httpRoute(AdminRoute, 'GET', 'admin/stats', { ... })
  .use(withSession)
  .use(withRbac(['admin']))

// pipeline() applies a guard sequence to many routes at once:
const adminRoutes = [
  httpRoute(...).use(pipeline(withSession, withRbac(['admin']))),
];
```

Built-in guards: `withSession` (JWT), `withRbac` (role check), `withApiKey`, `withRateLimit`,
`withMetrics`, `withCors`.

---

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

---

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

---

## OpenAPI

`openApiRoute()` extends `httpRoute()` with OpenAPI metadata. `generateSpec()` walks the
router and produces an OpenAPI 3.1 document.

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

---

## Sections

`section()` groups routes under a shared path prefix and accumulates typed section
parameters (useful for multi-tenant or versioned APIs where the prefix itself carries
semantic data).

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

---

## Typed SSE streams

`sseRoute()` attaches a typed event schema to a route. The handler returns an
`AsyncIterable<EventType>`; the server serializes to `text/event-stream`. The client's
`createSseClient()` returns the same `AsyncIterable<EventType>` derived from the declared
schema — no manual type duplication.

```typescript
import { sseRoute, createSseServer, createSseClient } from '@arbor/router';

const Feed = z.object({ tag: z.literal('feed') });
const FeedEvent = z.object({ msg: z.string(), ts: z.number() });

const router = defineRoutes([
  sseRoute(Feed, 'stream/feed', { event: FeedEvent }),
]);

// Server:
const server = createSseServer(router, {
  feed: async function* (ctx) {
    yield { msg: 'hello', ts: Date.now() };
    yield { msg: 'world', ts: Date.now() };
  },
});

// Client — typed as AsyncIterable<{ msg: string; ts: number }>:
const client = createSseClient('https://api.example.com', router);
for await (const event of client.subscribe({ tag: 'feed' })) {
  console.log(event.msg);
}
```

---

## Typed WebSocket channels

`wsRoute()` attaches `{ in, out }` Zod schemas to a route. The server receives
`Recv<In, Send<Out>>`; the client automatically receives `Send<In, Recv<Out>>` — the
dual — as a compile-time guarantee. Mismatches are type errors.

```typescript
import { wsRoute, createWsServer, createWsClient } from '@arbor/router';

const Chat = z.object({ tag: z.literal('chat') });

const router = defineRoutes([
  wsRoute(Chat, 'ws/chat', {
    in:  z.object({ text: z.string() }),
    out: z.object({ reply: z.string() }),
  }),
]);

// Server — receives text, sends reply:
const server = createWsServer(router, {
  chat: async (channel) => {
    for await (const msg of channel.receive()) {
      await channel.send({ reply: `echo: ${msg.text}` });
    }
  },
});

// Client — dual type: sends text, receives reply:
const client = createWsClient('wss://api.example.com', router);
const channel = client.connect({ tag: 'chat' });
await channel.send({ text: 'hello' });
const { reply } = await channel.receive();
```

---

## Testing

`createTestClient()` runs an in-memory server + typed client in a single call. No network
required; the full pipeline (guards, validation, handlers) is exercised.

```typescript
import { createTestClient } from '@arbor/router';

const { client } = createTestClient(router, handlers);
const response = await client.fetch({ tag: 'get-user', id: '42' });
// { status: 200, body: { id: '42', name: 'Alice' } }
```

`@arbor/router-test` provides property-based testing: it generates arbitrary valid inputs
from Zod schemas via `fast-check` and asserts responses match declared contracts.

---

## Type utilities

| Type | Purpose |
| ---- | ------- |
| `Derive<Router>` | Discriminated union of all routes in a router |
| `InferRoute<Router, Tag>` | Single route type for a given tag |
| `InferContext<Router, Tag>` | Handler context shape (params, body, query, …) |
| `InferRouteBody<Router, Tag>` | Response body type for a given tag |
| `CtxMap<Router>` | Map from tag → full `HttpContext` |
| `HandlerCtx<CtxMap, Routes, Tag>` | Explicit handler context type |
| `HandlerMap<CtxMap, Routes>` | Full handler map type |
| `HttpResponse<Status, Body>` | Generic response shape |
| `Guard<Ctx, Extra>` | Guard function type |
| `TypedClient<Route, Map>` | Client type for a given router |
| `Dual<S>` | Session type dual — client protocol inferred from server protocol |
