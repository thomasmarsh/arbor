# @arbor/router — Features, Comparison, and Assessment

## What It Is

A TypeScript URL router where a single route definition tree drives URL parsing, URL
construction, HTTP server dispatch, typed HTTP clients, and OpenAPI spec generation —
all without codegen. Route types are a nested discriminated union derived at compile time
via phantom types and a depth-limited recursive mapped type (`FlattenChildrenImpl`).

---

## Current Features

### Core routing

- **Route tree definition** — `defineRoutes()`, `route()`, `section()` compose a typed tree.
- **Segment kinds** — literal (`users`), string param (`:id`), numeric param (`#id`),
  optional string (`:id?`), optional numeric (`#id?`), wildcard (`*rest`).
- **`parse(url)`** — returns `Result<Route, string>`. Matched routes are nested
  discriminated union objects (`{ tag: 'users', child: { tag: 'user', id: '42', child: ... } }`).
- **`print(route)`** — reconstructs a URL from a route object; round-trips exactly.
- **Query parameter schemas** — per-route `z.ZodObject` validated and coerced separately
  from path params; arrives at `ctx.query`.
- **Full TypeScript inference** — no codegen; all route shapes, param names, response types
  derived from Zod schemas at compile time.

### HTTP server

- **`httpRoute()`** — attaches HTTP method and typed request/response contracts to a node.
- **`createServer()`** — takes router + handler map; dispatches requests. Each tag's `ctx`
  is typed to that route's params, body, query, headers, and cookies.
- **`respond(status, body[, opts])`** and **`desc(body[, opts])`** — typed response
  helpers that eliminate `status: N as const` boilerplate.
- **Body parsing** — JSON and multipart/form-data (`Content-Type` demuxing).
- **WinterCG-compatible** — consumes and emits web-standard `Request`/`Response` primitives
  via `server.handleRequest()`; also exposes a lower-level `server.handle()`.
- **Validation error boundary** — Zod parse failures return 400 with structured errors before
  the handler runs.
- **Pluggable error mapper** — map exception types to typed status codes.

### Security / middleware

- **Guards** — `withGuard()`, `composeGuards()` — pre-handler short-circuits with typed
  context enrichment (session, roles, etc.).
- **`withSession()`** — JWT extraction/verification guard; typed session injected into ctx.
- **`withRbac()`** — role-based access control guard composed on top of session.
- **`withApiKey()`** — API key authentication guard.
- **`withCors()`** — per-server CORS wrapper with optional per-route overrides.
- **`withRateLimit()`** — sliding-window rate limiting; pluggable store (built-in memory
  store; bring-your-own Redis adapter via `RateLimitStore` interface).
- **`withMetrics()`** — request telemetry decorator; emits structured `RequestMetric` per
  dispatch.
- **CSRF protection** — bundled in the CORS/CSRF wrapper (`withCors`).

### Typed client

- **`createClient()`** — derives request method and response union from the router.
  `client.fetch(route)` returns the narrowed response union for that route.
- **Custom `fetch` injection** — swap the transport for testing or edge runtimes.
- **`TypedClient<R>` utility type** — for use in type-level declarations.

### OpenAPI

- **`openApiRoute()`** — wraps `httpRoute()` with OpenAPI metadata (summary, description,
  tags, operationId, security schemes).
- **`generateSpec()`** — emits a compliant `openapi.json` / object from the route tree;
  Zod schemas converted to JSON Schema automatically.

---

## Planned / In-Progress Features

| Plan | Topic | Status |
|------|-------|--------|
| 63 | Decompose `walkSpec()` helpers | Pending |
| 64 | Fix OpenAPI context mutation | Pending |
| 65 | Module barrel and export audit | Pending |
| 66 | Rate-limit decoupling | Pending |
| 67 | `#id` integer-only enforcement (reject `1.5`, `1e3`) | Pending |
| 68 | Wildcard captures `string` not `string[]` | Pending |
| 69 | Enforce optional segment ordering at definition time | Pending |
| 70 | Pattern segment kind (`~id:[0-9a-f]{8}`) for format-based routing | Pending |
| 71 | Method/body type safety (`GET` + `body` is a compile error) | Pending |
| 72 | `createTestClient()` — in-memory server-backed typed client for tests | Pending |
| 73 | `Allow` header on 405 responses (RFC 7231 §6.5.5) | Pending |
| 74 | Radix tree spike (O(N) → O(L) dispatch for large trees) | Deferred |

---

## Framework Comparison

| Capability | @arbor/router | tRPC | ts-rest | Hono | Express + Zod |
|---|---|---|---|---|---|
| **Primary model** | URL tree → typed dispatch | Procedure router | Contract-first REST | Web-standard middleware | Imperative routes |
| **Type source** | Zod schemas in route tree | TypeScript functions | Shared contract object | TypeScript, Zod plugins | Manual |
| **Codegen required** | No | No | No | No | No |
| **URL parse + print** | Yes (bidirectional) | No | No | No | No |
| **Nested route union** | Yes (structural parent/child) | No | No | No | No |
| **HTTP server** | Yes | Via adapter | Via adapter | Yes (core) | Yes |
| **Typed client** | Yes | Yes (core) | Yes (core) | Partial | No |
| **OpenAPI output** | Yes | Via plugin | Yes (core) | Via plugin | Via plugin |
| **Guards / middleware** | Typed HO factories | Middleware array | Middleware array | Middleware chain | Middleware array |
| **Rate limiting** | Built-in (`withRateLimit`) | External | External | Plugin | External |
| **CORS / CSRF** | Built-in | External | External | Plugin | External |
| **JWT / RBAC** | Built-in guards | External | External | External | External |
| **Runtime** | WinterCG (any) | Node + adapters | Node + adapters | WinterCG | Node only |
| **Query param schemas** | Yes (per-route Zod) | Yes | Yes | Partial | Manual |
| **Body type safety (GET)** | Planned (Plan 71) | N/A | Yes | N/A | No |
| **Mutation-safe session typing** | Yes (guard enrichment) | Yes (context) | No | No | No |
| **Mock/test client** | Planned (Plan 72) | Included | No | No | No |

### Gap analysis vs. peers

**vs. tRPC**: tRPC is procedure-oriented, not REST-URL-oriented. It wins on DX for
internal RPC (no URL design required, seamless React Query integration, subscriptions).
@arbor/router has no subscription story and no TanStack/React integration (spiked but not
built — plan 24). tRPC has no bidirectional URL parse/print; URL shape is opaque to the
caller. tRPC has no OpenAPI output unless you add a plugin. @arbor/router fits REST APIs
with real URL hierarchies; tRPC fits internal service calls.

**vs. ts-rest**: ts-rest is contract-first: you define an interface object, then implement
it on server and client separately. The contract is the source of truth. @arbor/router
embeds the contract in the route tree itself — definition and contract are the same thing.
ts-rest produces OpenAPI natively; @arbor/router does too. ts-rest has no routing engine
(it delegates to Express/Hono/Fastify); @arbor/router owns the entire dispatch stack.
ts-rest has no URL parse/print; clients construct URLs from contract keys. ts-rest does
support body-on-GET prevention. The key difference: ts-rest is a contract layer on top of
an existing framework; @arbor/router is a full stack from URL to response.

**vs. Hono**: Hono is a fast, thin, WinterCG web framework with a conventional middleware
chain and route registration API. It has good TypeScript inference for path params but no
bidirectional URL model, no shared client type, and limited OpenAPI support (via plugin).
@arbor/router is not a web framework — it is a typed dispatch layer. Hono wins on
ecosystem maturity, performance tooling, and familiarity. @arbor/router wins on type
fidelity (full response union typing, session enrichment, nested route structure).

**Gaps unique to @arbor/router**:
- No streaming / SSE support.
- No subscriptions (WebSocket, SSE).
- No TanStack Router / React integration (deferred spike exists).
- No built-in body size limits on `createServer` (multipart safeguard noted as a roadmap
  item but not yet implemented).
- No middleware arrays — intentional design; cross-cutting concerns must be higher-order
  factories or guard composition. This is more explicit but more verbose than `app.use()`.
- `createTestClient` not yet shipped (Plan 72 pending).
- Radix tree dispatch not yet done (Plan 74, deferred pending benchmark).

---

## Closing the Gaps

### 1. Middleware ergonomics — a `use()` builder as a transition path

The largest adoption barrier for teams coming from Express or Hono is the absence of
`app.use()`. The higher-order factory model is more correct, but it nests outward and
reads inside-out. A fluent `.use()` builder on route nodes would give the familiar
left-to-right pipeline feel without changing the execution model at all:

```typescript
// Current (compositionally correct, reads inside-out):
withSession(withRbac(['admin'], httpRoute(GetAdmin, 'GET', 'admin', { ... })));

// Proposed builder (same types, reads left-to-right):
httpRoute(GetAdmin, 'GET', 'admin', { ... })
  .use(withSession)
  .use(withRbac(['admin']));
```

The key: `.use(guard)` returns a new `RouteNode` type with the guard's context
enrichment applied — identical to what the HO factory produces. The handler map sees
the same types in both cases. This is a pure ergonomics proxy; no new execution
semantics. The resulting type is identical to the HO factory result, so `createServer`
requires the session-enriched ctx whether the route was built with `.use()` or `withSession(...)`.

For teams with existing Express codebases, this opens a migration path: extract
handlers into the typed handler map, attach existing middleware as `.use(guard)`
entries one at a time, and let TypeScript flag each place where the guard's ctx
enrichment is missing.

A companion `pipeline(...guards)` combinator would support applying the same set of
guards to many routes at once, replicating the `router.use('/admin', auth)` pattern:

```typescript
const adminPipeline = pipeline(withSession, withRbac(['admin']));

defineRoutes([
  httpRoute(GetAdmin,    'GET',  'admin/users', { ... }).pipe(adminPipeline),
  httpRoute(DeleteAdmin, 'DELETE','admin/users/:id', { ... }).pipe(adminPipeline),
]);
```

### 2. TanStack / React integration

The route tree already produces a discriminated union that maps naturally to a React
component switch with zero adapter needed:

```typescript
const route = router.parse(new URL(window.location.href)).getOrElse(null);
switch (route?.tag) {
  case 'users':  return <UserList />;
  case 'user':   return <UserDetail id={route.id} />;  // id: string, fully narrowed
  case 'settings': return <Settings />;
}
```

A thin `@arbor/react` package would only need four primitives: `useRoute()` (listens to
`popstate`, returns the parsed route), `useNavigate()` (calls `pushState(router.print(r))`),
`<Link to={route}>` (calls `router.print()` for `href`), and `<RouterProvider>` for
context. No framework-specific route objects; the discriminated union is the component
interface.

TanStack Query integration follows naturally: attach a `loader` to the route definition,
collect all loaders in the active branch on navigation, and fire them with `Promise.all`
before mounting. The loader's param type is inferred from the route schema.

### 3. Streaming and real-time

SSE is the lowest-cost addition: `sseRoute()` wraps `httpRoute()` with a response type of
`AsyncIterable<Event>`. The server serializes the iterable to `text/event-stream`; the typed
client returns the same `AsyncIterable<Event>` on the receiver side. The bidirectional
typing advantage — knowing the event schema at compile time — is something no other TS
framework provides for SSE.

WebSocket is harder because WinterCG lacks a standard WS API, but the type story is
tractable: `wsRoute(schema, path, { in: z.ZodType, out: z.ZodType })` produces a typed
socket factory. The runtime adapter is pluggable (Node's `ws`, Bun's native WS, etc.).

### 4. Exhaustive response handling on the client

The client already returns a typed union per route. The missing piece is a `matchResponse`
combinator that enforces exhaustive handling:

```typescript
matchResponse(await client.fetch(userRoute), {
  200: (body) => renderUser(body),     // body: User — inferred
  404: (body) => renderNotFound(body), // body: { error: string } — inferred
  // missing branch → TypeScript error
});
```

This is the client-side mirror of `switch(route.tag)` exhaustiveness. No other HTTP
framework does this. It closes the last gap where an unhandled status code can silently
produce a runtime error.

### 5. Generator-based guard pipelines

The current guard composition model is correct but requires explicit type threading.
TypeScript generator functions (`function*`) enable a monadic pipeline style where each
`yield*` is a guard check that short-circuits on failure and enriches context on success:

```typescript
const handler = pipeline(function* (ctx) {
  const session = yield* withSession(ctx);       // 401 if missing, typed session if present
  const user    = yield* withRbac(['admin'])(session);  // 403 if unauthorized
  return respond(200, { id: user.id });
});
```

Each yield point narrows the type of the value it produces. The pipeline short-circuits
automatically without explicit `if (result.ok === false) return result` chains. This
is achievable today with a small generator-driving utility function; no new runtime
infrastructure required.

---

## Novel Ideas from Other Ecosystems

### From Haskell / PureScript

**Servant-style type-level API descriptions.** Haskell's Servant library encodes the entire
API as a type using type operators (`"users" :> Capture "id" Text :> Get '[JSON] User`). The
type IS the spec; the type errors ARE the contract violations. @arbor/router is already
philosophically Servant-adjacent — the route tree value is the spec — but Servant goes one
step further: `Server API` and `Client API` are both mechanically derived from the same type
with no intermediate value. @arbor/router could push toward this by making the router's
inferred type truly isomorphic to the OpenAPI output, so that type-level changes
automatically invalidate outdated client code.

**Effect-tracked handlers.** Haskell tracks IO effects in types. In TypeScript this is
achievable via Effect-TS: handlers could declare their dependencies and permitted effects
as part of the type signature — `Handler<DB | Cache, never, HttpResponse<200, User>>` —
and the server would resolve the `DB | Cache` requirements from a service map at startup.
This is compile-time dependency injection: the type proves the handler cannot run without
its declared services, and the type proves a read-only route cannot acquire a write
service. The current `ctx` object is injected at runtime with no type-level proof of
which services were actually resolved.

**QuickCheck-style property testing from Zod schemas.** Because every route has a Zod
schema, valid inputs can be generated automatically. A `testRoute(router, handlers)`
utility using fast-check + zod-mock would fire randomly generated valid inputs at every
handler and assert the response structure matches the declared schema — finding edge cases
that no manually written test would cover. This is structurally unique to schema-first
frameworks; frameworks that declare routes imperatively cannot do this without code
introspection.

### From Rust

**Axum's extractor model.** In Axum, handler arguments are typed extractors, each
independently pulling a piece of the request context:

```rust
async fn get_user(Path(id): Path<String>, State(db): State<Db>) -> impl IntoResponse { }
```

Each extractor is testable in isolation. Applied to @arbor/router: instead of (or
alongside) the monolithic `ctx` object, handlers could declare named typed extractors as
positional arguments — `handler(path: Path<{ id: string }>, session: Session<UserSession>)`
— where each extractor knows how to pull itself from the resolved route. Handlers become
pure functions of typed values. Partial extraction makes unit testing trivial: pass just
`Path({ id: '42' })` without constructing a full ctx object.

**`IntoResponse` type class for domain return types.** Axum lets handlers return `User`,
`Result<User, AppError>`, or `(StatusCode, Json<User>)` — anything implementing
`IntoResponse`. An equivalent interface in @arbor/router would let handlers return domain
objects directly; the `respond()` call moves to the framework boundary. The common case
— a handler that always returns 200 with the domain object — becomes one line shorter,
and error handling can be centralized in the error mapper rather than scattered across
handlers.

**Zero-cost route compilation.** Rust macros generate specialized code at compile time;
there is no generic runtime cost. Applied here: at route definition time, the complete
tree structure is statically known. A "compile" phase (a build-time script, or a future
TypeScript Language Service plugin) could emit a specialized dispatch function for the
exact tree shape — no generic tree walk at request time, no array iteration, no
`matchSegments` loop. For large route trees this collapses the O(N) walk to a cascaded
`if/switch` with no allocation. This is more radical than Plan 74's radix tree and
complementary to it.

### From Erlang / Elixir

**Let-it-crash handler supervision.** In OTP, every process is supervised; crashes are
isolated and the supervisor decides the recovery strategy. Applied to `createServer()`:
every handler dispatch could be wrapped in a supervision boundary that catches uncaught
exceptions, maps them to 500 responses via the error mapper, and emits a `RequestMetric`
— with no per-handler `try/catch`. Currently this is either done manually or left to the
error mapper. Making it the default behavior (zero-config, opt-out) with automatic metric
emission would dramatically reduce boilerplate and ensure no unhandled rejection silently
kills the process.

**Phoenix LiveView — server-driven typed UI transitions.** Phoenix LiveView pushes HTML
diffs over a persistent WebSocket; the client applies patches without a full re-render.
@arbor/router's discriminated union route tree is structurally perfect for a typed variant
of this: route state transitions are discrete and typed. A `liveRoute()` factory could
associate a route node with a server render function, and the framework would handle the
WS transport, structural diff, and client-side patch application. The client receives
typed `RouteEvent<Tag>` objects that drive component swaps. The key advantage over
Phoenix's approach: the event types are statically verified against the route schema.

### From F# / Swift

**Computation expressions for guard pipelines.** F#'s computation expressions (and
similar constructs in Swift's result builders) make monadic sequencing readable. The
generator-based pipeline idea above is the TypeScript analogue. What F# adds that TypeScript
does not yet have: the ability to define *named* pipeline contexts (`auth { }`, `transaction { }`)
that implicitly carry their enrichment through the block without explicit threading. Swift's
`@resultBuilder` could inspire a route-tree DSL where child routes are declared inside a
builder block with automatic parent-context inheritance.

### Novel ideas with no precedent in any framework

**Compile-time contract diffing for CI.** The route tree is a first-class value; it can
be serialized and diffed. A `routerDiff(oldRouter, newRouter)` utility would produce a
typed manifest of breaking changes: removed status codes, new required fields, changed
response shapes, dropped route tags. Integrated into CI: "this PR introduces N breaking
client changes, here are the specific routes." This is strictly better than OpenAPI
change detection because the Zod schemas — not a serialized JSON document — are the
ground truth. Semver becomes mechanically derivable from the diff output.

**Declarative permissions as route annotations.** Instead of composing guards imperatively,
routes could carry a typed permission declaration directly:

```typescript
httpRoute(GetAdmin, 'GET', 'admin', {
  requires: ['admin'] as const,   // narrows ctx to include session with matching roles
  response: { 200: AdminData },
})
```

The `requires` annotation automatically narrows the handler's `ctx` type to include
`session: { roles: ['admin', ...] }` — no separate `withSession + withRbac` composition.
The framework enforces the check at runtime; the type proves the check was declared at
compile time. Undeclared requirements are type errors. This collapses the guard
composition model to zero boilerplate for the common RBAC case.

**Typed audit trail generation.** Every request maps to a typed route; every response is
a typed status code. A `createAuditLogger(router)` utility could derive a typed audit
event schema directly from the route tree — no per-handler instrumentation, no schema
maintenance. The audit schema IS the route schema. Every dispatched request automatically
emits a structured, type-verified audit event. This is genuinely novel: audit trails that
are type-proven to be complete by the framework, not by convention.

**Cross-language client generation from the route tree.** OpenAPI is already supported,
but OpenAPI is lossy: discriminated unions flatten to `oneOf`, optional response fields
lose their Zod refinements, status-code unions collapse to `default`. Because the route
tree is a first-class value with full Zod schema information, a `generateClient('go' |
'python' | 'rust')` function could emit idiomatic typed clients for other languages that
preserve more of the contract than OpenAPI allows — a Go client where each route returns
a typed struct union, not an `interface{}` or `map[string]any`.

**Route-level capability proof system.** Inspired by Rust's traits and Haskell's type
classes: each route could declare the side-effect *capabilities* it requires (`DBWrite`,
`ExternalAPI`, `SendEmail`), as part of the route type. The handler's type would then be
required to carry a proof that those capabilities were granted. A handler that tries to
write to the DB on a `[DBRead]` route would be a type error. This is different from
dependency injection (it is about *permission*, not injection) and different from guards
(it is about what the handler is allowed to *do*, not what the request is allowed to
*match*). No HTTP framework has attempted this; the closest precedents are Rust's borrow
checker proofs and Haskell's `IO` / `ST` monad separation.

---

## Subjective Assessment

**Fit for niche: strong, but narrow.**

The niche is: TypeScript-first REST APIs where URL structure matters, where you want the
type system to prevent entire classes of handler mistakes, and where you own both client
and server. Within that niche the library is genuinely impressive. The phantom-type route
tree with no codegen is technically non-trivial — the `FlattenChildrenImpl` depth-counter
approach (replacing mutual recursion that hit TS instantiation limits) is the kind of
compiler-friendly design that most libraries never reach. The guard enrichment model —
where `withSession` provably injects a session type into downstream handler context — is
more correct-by-construction than any middleware array I've seen in a TS HTTP framework.

**Where it is strong:**
- Internal APIs in TypeScript monorepos where client and server share the router definition.
- Applications where URL topology is first-class (navigation, breadcrumbs, link generation)
  not just request routing.
- Teams who want the compiler to prevent 400/401/403/404 logic errors, not just catch typos.
- OpenAPI generation from a single source of truth without a separate annotation pass.

**Where it is not the right tool:**
- Public APIs consumed by non-TypeScript clients (the type fidelity advantage disappears;
  tRPC/ts-rest/Hono are simpler choices).
- Real-time or streaming workloads (no WebSocket, SSE, or streaming response primitives).
- Teams who want `app.use()` middleware composability; the higher-order factory model is
  more powerful but has a steeper learning curve.
- Large existing Node/Express codebases; adoption requires rewriting the route layer.

**Maturity / production readiness:**
The library is pre-1.0 (`"version": "0.0.0"`) and clearly under active development with
~15 pending plans. The core is well-tested with both runtime and type-level assertions.
The pending correctness fixes (Plans 67–69: integer enforcement, wildcard type, optional
ordering) suggest the segment model is still being hardened. I would not recommend it for
a new greenfield project today unless the team is comfortable being early adopters and
can absorb breaking changes. The architecture is sound; the surface area is not yet stable.

**Verdict:** A thoughtful, technically rigorous router for a specific use case. It solves
real problems that tRPC, ts-rest, and Hono leave on the table — particularly the
bidirectional URL model and the type-safe guard enrichment chain. Whether those problems
are worth adopting a pre-1.0 library depends entirely on how much the URL hierarchy
matters to the application and how much the team values compile-time correctness over
ecosystem maturity.
