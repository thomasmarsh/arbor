# @arbor/router — Features, Roadmap, and Assessment

## What It Is

A TypeScript typed protocol framework: a single route definition tree drives URL parsing, URL
construction, HTTP server dispatch, typed SSE streams, typed WebSocket channels, typed HTTP clients,
and OpenAPI spec generation — all without codegen.

The unifying abstraction is **session types**: a formal type theory for communication protocols
where the server declares its channel type and the client automatically receives the mathematically
complementary (dual) type. Protocol compatibility is a compile-time guarantee, not a runtime
convention. This makes @arbor/router more than an HTTP router; it is a typed protocol layer across
all three major web communication families — request/response, server-sent events, and bidirectional
websocket channels.

Route types are a nested discriminated union derived at compile time via phantom types and a
depth-limited recursive mapped type (`FlattenChildrenImpl`). An O(1) compiled dispatch index
replaces the linear walk at runtime.

---

## Current Features

### Core routing

- **Route tree definition** — `defineRoutes()`, `route()`, `section()` compose a typed tree.
- **Segment kinds** — literal (`users`), string param (`:id`), numeric param (`#id`),
  optional string (`:id?`), optional numeric (`#id?`), wildcard (`*rest`).
- **`parse(url)`** — returns `Result<Route, string>`. Matched routes are nested
  discriminated union objects (`{ tag: 'users', child: { tag: 'user', id: '42', child: ... } }`).
- **Compiled dispatch** — Map-indexed O(1) route lookup replaces the linear `walkParse` scan.
- **`print(route)`** — reconstructs a URL from a route object; round-trips exactly.
- **Query parameter schemas** — per-route `z.ZodObject` validated and coerced separately
  from path params; arrives at `ctx.query`.
- **Full TypeScript inference** — no codegen; all route shapes, param names, response types
  derived from Zod schemas at compile time.
- **Recursive `CtxMap`** — section-nested routes participate in the `createServer` handler map;
  deep subtrees type-check without flattening.

### HTTP server

- **`httpRoute()`** — attaches HTTP method and typed request/response contracts to a node.
- **`createServer()`** — takes router + handler map; dispatches requests. Each tag's `ctx`
  is typed to that route's params, body, query, headers, cookies, and declared capabilities.
- **`respond(status, body[, opts])`** and **`desc(body[, opts])`** — typed response
  helpers that eliminate `status: N as const` boilerplate. `desc()` supports single-status
  routes where `InferSingleSuccessBody` extracts the body type directly.
- **`requires`** — declarative annotation on `httpRoute` that narrows handler `ctx` to
  include only the declared roles; enforced at runtime, typed at compile time.
- **Body parsing** — JSON and multipart/form-data (`Content-Type` demuxing).
- **WinterCG-compatible** — consumes and emits web-standard `Request`/`Response` primitives
  via `server.handleRequest()`; also exposes a lower-level `server.handle()`.
- **Validation error boundary** — Zod parse failures return 400 with structured errors before
  the handler runs.
- **Handler supervision** — every handler dispatch wrapped in a supervision boundary; uncaught
  exceptions map to 500 via the error mapper and emit a `RequestMetric` automatically. No
  per-handler `try/catch` required (Erlang OTP "let-it-crash" default).
- **Pluggable error mapper** — map exception types to typed status codes.
- **`Allow` header** — 405 responses include the `Allow` header per RFC 7231 §6.5.5.
- **Method/body type safety** — `GET`/`HEAD`/`DELETE` routes reject a `body` option at the type level.

### Guard / middleware system

- **`.use()` fluent builder** — `httpRoute(...).use(withSession).use(withRbac(['admin']))` —
  left-to-right guard composition; identical type output to the higher-order factory form.
- **`pipeline(...guards)`** — apply a fixed guard sequence to many routes at once, replicating
  the `router.use('/admin', auth)` pattern without implicit middleware arrays.
- **`withGuard()`, `composeGuards()`** — raw guard primitives for custom implementations.
- **`withSession()`** — JWT extraction/verification guard; typed session injected into ctx.
- **`withRbac()`** — role-based access control guard composed on top of session.
- **`withApiKey()`** — API key authentication guard.
- **`withCors()`** — per-server CORS wrapper with optional per-route overrides and CSRF protection.
- **`withRateLimit()`** — sliding-window rate limiting; pluggable store (built-in memory
  store; bring-your-own Redis adapter via `RateLimitStore` interface).
- **`withMetrics()`** — request telemetry decorator; emits structured `RequestMetric` per dispatch.

### Typed client

- **`createClient()`** — derives request method and response union from the router.
  `client.fetch(route)` returns the narrowed response union for that route.
- **`matchResponse(response, { 200: ..., 404: ... })`** — exhaustive combinator; TypeScript
  error if any declared status code is unhandled. The client-side mirror of `switch(route.tag)`.
- **`InferRouteBody<Router, Tag>`** — utility type that collapses `_ctxMap` drill-through
  into a single lookup for typed client usage.
- **Custom `fetch` injection** — swap the transport for testing or edge runtimes.
- **`TypedClient<R>` utility type** — for use in type-level declarations.

### Session types and real-time protocols

- **Session type primitives** — `Send<T, S>`, `Recv<T, S>`, `Branch<M>`, `Select<M>`, `End`;
  composable protocol descriptions with `Dual<S>` inversion.
- **`sessionRoute()`** — attaches a session type to a route node; the client automatically
  receives `Dual<S>`, proven at compile time with no runtime overhead.
- **`sseRoute()`** — typed server-sent events. Handler returns `AsyncIterable<EventType>`;
  server serializes to `text/event-stream`; typed `createSseClient()` returns the same
  `AsyncIterable<EventType>` derived from the declared schema.
- **`wsRoute()`** — typed bidirectional WebSocket channel with `{ in, out }` Zod schemas.
  Server type is `Recv<In, Send<Out>>` and the client automatically receives `Send<In, Recv<Out>>` —
  the dual. Mismatches are type errors. Transport is pluggable (`WsAdapter` interface).
- **`createSseServer()` / `createSseClient()`** — server dispatch + typed event client.
- **`createWsServer()` / `createWsClient()`** — server dispatch + typed channel client.
- **`wsSessionRoute()`** — structured, step-ordered send/recv protocol route. Unlike `wsRoute`
  (free-running `AsyncIterable` channel), each `ops.send()` / `ops.recv()` call advances the
  session by one step and supplies its schema at the call site. Suitable for handshakes,
  RPC-style request/response over a socket, and phase-gated workflows.
- **`createWsSessionServer()` / `createWsSessionClient()`** — server dispatch + client factory
  for `wsSessionRoute`. `client.connectSession(route)` returns `IxSessionOps` backed by a
  `WsAdapter` connection; the client drives the dual sequence (`send`↔`recv` swapped relative
  to the server handler).
- **HTTP session annotation** — `HttpSession<Res>` as a uniform `_meta` phantom annotation
  on `httpRoute`, unifying all three protocol families under the same `Branch`/`Dual` algebra.
  Proves that `matchResponse` is formally the `Branch` combinator for HTTP sessions.

### OpenAPI

- **`openApiRoute()`** — wraps `httpRoute()` with OpenAPI metadata (summary, description,
  tags, operationId, security schemes).
- **`generateSpec()`** — emits a compliant `openapi.json` / object from the route tree;
  Zod schemas converted to JSON Schema automatically.

### Testing infrastructure

- **`createTestClient()`** — in-memory server + typed client in a single call; no network
  required; full pipeline exercised including guards and validation.
- **Property-based testing** — `@arbor/router-test` generates arbitrary valid inputs from
  Zod schemas and asserts responses match declared contracts; `fast-check` powered.

---

## Active Development

### Wave 30 — Section composition and API unification

| Plan | Topic | Status |
| ---- | ----- | ------ |
| 155  | Monorepo restructuring — `framework/` and `apps/` layers, CI test isolation | **next** |
| 153  | `section()` overload accepting `RouterContract` — `EmbeddedMap` phantom threads precise `CtxMap` through section nodes | todo |
| 154  | Relative route paths + section composition — single `createServer` in `@arbor/api`, context-free sub-routers | todo |

### Wave 32 — Native schema

The Zod dependency is removed from the core routing path. Router-controlled positions (segment
params, query schemas) move to a lightweight native schema vocabulary. User-controlled positions
(body, response) accept any Standard Schema–compatible library.

| Plan | Topic | Status |
| ---- | ----- | ------ |
| 163  | Native schema scratch proof — `ObjectSchema<T>`, `Infer<S>`, factory functions, tsc diagnostics gate | done |
| 164  | Native schema core threading — `RouteNode.schema`, `route()`, `walk.ts`, OpenAPI generation | todo |
| 165  | Standard Schema for body/response — `http-context.ts` accepts `UserSchema<T>` | todo |
| 166  | Trailing slash normalization — prove equivalence in tests, extend PBT, update JSDoc | todo |
| 169  | Segment grammar specification — consistent grammar for all segment kinds | todo |

### Other queued tasks

| Plan | Topic | Status |
| ---- | ----- | ------ |
| 70   | Pattern segments — native regex-backed segment matching | **next** |
| 91   | Spike — multi-party session type projections (MPST, N-participant protocols) | todo |
| 92   | `ServiceRegistry` injection — capability/effects system implementation | todo |

---

## Roadmap

### Browser integration (Waves 19–26)

A thin reactive wrapper around the route tree's `parse`/`print` primitives. No separate route
definition objects; the discriminated union is the component-switch interface. See [BROWSER.md](BROWSER.md)
for the full wave-by-wave plan.

```
framework/router-browser   ← History API adapter; no React dependency
framework/router-react     ← RouterProvider, useRoute, useNavigate, <Link>
framework/router-tanstack  ← TanStack Router bridge (spike-gated, plan 106)
framework/router-devtools  ← Browser DevTools overlay / inspector panel
```

Two integration paths, both supported:

```
Hooks path (Waves A–F):
  BrowserRouter → RouterProvider → useRoute / useNavigate / <Link>

TCA path (Wave G, opt-in):
  BrowserRouter → routerReducer → RouterStoreProvider → same hooks
  Adds: time-travel devtools, streaming SSE/WS effects, loader dispatch
```

Key planned packages and milestones:

| Wave | Plans | Milestone |
| ---- | ----- | --------- |
| A — Foundation | 95, 96 | `BrowserRouter`, History API, typed search params |
| B — React bindings | 97–99 | `useRoute`, `useNavigate`, `<Link>`, `<RouteLayout>` |
| C — Data layer | 100–104 | Route-attached loaders, navigation lifecycle, prefetch, code splitting |
| D — Real-time | 107–108 | `useSSE()`, `useWebSocket()` hooks with lifecycle cleanup |
| E — UX polish | 109, 111–112 | History stack, route meta tags, scroll restoration |
| F — Ecosystem | 105, 106, 110 | TanStack Query/Router bridges, DevTools panel |
| G — TCA opt-in | 113–118 | `routerReducer`, `RouterStoreProvider`, streaming effects, time-travel |
| H — SSR | 119–126 | `StaticRouter`, loader dehydration, streaming SSR, BFF wiring |

### Future bets

| Plan | Topic |
| ---- | ----- |
| 91   | MPST — multi-party session types: N-participant global type projections |
| 92   | Capability system — `ServiceRegistry`, route-level side-effect proofs |
| 129  | `routerDiff()` — typed breaking-change manifest; mechanically derivable semver |
| 130  | Type-driven audit trail — typed audit events derived from the route tree, not per-handler |
| 131  | Supervision metrics — `RequestMetric` error-boundary statistics to Prometheus |
| 128  | `liveRoute()` — typed server-driven UI transitions over `wsRoute` channels |
| 133+ | Schema-agnostic core — eliminate Zod from all router-controlled positions |

---

## Framework Comparison

| Capability                       | @arbor/router                        | tRPC                 | ts-rest                | Hono                    | Express + Zod     |
| -------------------------------- | ------------------------------------ | -------------------- | ---------------------- | ----------------------- | ----------------- |
| **Primary model**                | URL tree → typed protocol dispatch   | Procedure router     | Contract-first REST    | Web-standard middleware | Imperative routes |
| **Type source**                  | Zod schemas in route tree            | TypeScript functions | Shared contract object | TypeScript, Zod plugins | Manual            |
| **Codegen required**             | No                                   | No                   | No                     | No                      | No                |
| **URL parse + print**            | Yes (bidirectional)                  | No                   | No                     | No                      | No                |
| **Nested route union**           | Yes (structural parent/child)        | No                   | No                     | No                      | No                |
| **HTTP server**                  | Yes                                  | Via adapter          | Via adapter            | Yes (core)              | Yes               |
| **Typed client**                 | Yes                                  | Yes (core)           | Yes (core)             | Partial                 | No                |
| **Exhaustive response matching** | Yes (`matchResponse`)                | No                   | No                     | No                      | No                |
| **OpenAPI output**               | Yes                                  | Via plugin           | Yes (core)             | Via plugin              | Via plugin        |
| **Guards / middleware**          | Typed HO factories + fluent `.use()` | Middleware array     | Middleware array        | Middleware chain         | Middleware array   |
| **Rate limiting**                | Built-in (`withRateLimit`)           | External             | External               | Plugin                  | External          |
| **CORS / CSRF**                  | Built-in                             | External             | External               | Plugin                  | External          |
| **JWT / RBAC**                   | Built-in guards                      | External             | External               | External                | External          |
| **Handler supervision**          | Built-in (let-it-crash boundary)     | No                   | No                     | No                      | No                |
| **Runtime**                      | WinterCG (any)                       | Node + adapters      | Node + adapters        | WinterCG                | Node only         |
| **Query param schemas**          | Yes (per-route Zod)                  | Yes                  | Yes                    | Partial                 | Manual            |
| **Body type safety (GET)**       | Yes                                  | N/A                  | Yes                    | N/A                     | No                |
| **Test client (in-memory)**      | Yes (`createTestClient`)             | Included             | No                     | No                      | No                |
| **Property-based testing**       | Yes                                  | No                   | No                     | No                      | No                |
| **SSE with typed events**        | Yes (`sseRoute`)                     | No                   | No                     | No                      | No                |
| **WebSocket typed channels**     | Yes (`wsRoute` + `wsSessionRoute`)   | No                   | No                     | Partial                 | No                |
| **Session type duality**         | Yes (compile-time `Dual<S>`)         | No                   | No                     | No                      | No                |
| **Browser navigation**           | Planned (Wave A–H)                   | No                   | No                     | No                      | No                |
| **MPST (multi-party protocols)** | Planned (Plan 91 spike)              | No                   | No                     | No                      | No                |
| **Capability / effects system**  | Planned (Plan 92)                    | No                   | No                     | No                      | No                |

### Gap analysis vs. peers

**vs. tRPC**: tRPC is procedure-oriented, not REST-URL-oriented. It wins on DX for internal RPC
(no URL design required, seamless React Query integration, subscriptions via the trpc-ws adapter).
@arbor/router has a real-time story — SSE and WebSocket with compile-time duality — but no
TanStack/React integration yet (Wave B, plan 97). tRPC has no bidirectional URL parse/print; URL
shape is opaque to the caller. tRPC has no OpenAPI output without a plugin, and no exhaustive
client-side response handling. @arbor/router fits REST APIs with real URL hierarchies; tRPC fits
internal service calls where URL shape doesn't matter.

**vs. ts-rest**: ts-rest is contract-first: you define an interface object, then implement it on
server and client separately. The contract is the source of truth. @arbor/router embeds the
contract in the route tree itself — definition and contract are the same thing. ts-rest has no
routing engine (it delegates to Express/Hono/Fastify); @arbor/router owns the entire dispatch
stack. ts-rest has no URL parse/print, no real-time support, and no exhaustive response matching.
The key difference: ts-rest is a contract layer on top of an existing framework; @arbor/router is
a full stack from URL to protocol.

**vs. Hono**: Hono is a fast, thin, WinterCG web framework with a conventional middleware chain
and route registration API. It has good TypeScript inference for path params but no bidirectional
URL model, no shared client type, no exhaustive response matching, and limited OpenAPI support.
@arbor/router is not a web framework — it is a typed dispatch layer. Hono wins on ecosystem
maturity, performance tooling, and familiarity. @arbor/router wins on type fidelity (full response
union typing, guard enrichment, session type duality across HTTP/SSE/WebSocket).

**Remaining gaps vs. peers:**

- No browser integration yet — the largest adoption gap for frontend teams. Wave A–H (plans
  95–126) ships this; Wave A is unblocked.
- No middleware arrays — intentional design; cross-cutting concerns must be higher-order
  factories or guard composition. More explicit but more verbose than `app.use()` for teams
  coming from Express.
- Capability/effects system spiked but not yet integrated (Plan 92 todo).
- MPST (multi-party session types) — spike todo, no implementation plan yet.

---

## Novel Ideas from Other Ecosystems

### From Haskell / PureScript

**Servant-style type-level API descriptions.** Haskell's Servant library encodes the entire
API as a type. @arbor/router is already philosophically Servant-adjacent — but with session
types now live, the analogy goes deeper: `wsRoute` with `Dual<S>` is structurally identical
to Servant's `WebSocket` combinator. Plan 127 (done) proved that the route tree and OpenAPI
output are structurally isomorphic — type-level changes automatically invalidate outdated
client code.

**Effect-tracked handlers.** Haskell tracks IO effects in types. In TypeScript, Plan 92's
capability system is a working approximation: handlers declare their dependencies as part
of the type signature, and the server resolves them from a service map at startup. This is
compile-time dependency injection: the type proves the handler cannot run without its
declared services.

**QuickCheck-style property testing from Zod schemas.** Because every route has a Zod
schema, valid inputs can be generated automatically. Plan 79 shipped this as
`@arbor/router-test` using fast-check + zod-mock. It fires randomly generated valid inputs
at every handler and asserts the response structure matches the declared schema — finding
edge cases that no manually written test would cover.

### From Rust

**Axum's extractor model.** In Axum, handler arguments are typed extractors, each
independently pulling a piece of the request context:

```rust
async fn get_user(Path(id): Path<String>, State(db): State<Db>) -> impl IntoResponse { }
```

Applied to @arbor/router: instead of (or alongside) the monolithic `ctx` object, handlers
could declare named typed extractors as positional arguments — `handler(path: Path<{ id:
string }>, session: Session<UserSession>)` — where each extractor knows how to pull itself
from the resolved route. Handlers become pure functions of typed values.

### From Erlang / Elixir

**Let-it-crash handler supervision** (Plan 81, shipped). In OTP, every process is supervised;
crashes are isolated and the supervisor decides the recovery strategy. `createServer()` now
wraps every handler dispatch in a supervision boundary — uncaught exceptions map to 500 with
automatic `RequestMetric` emission. Zero per-handler `try/catch` required.

**Phoenix LiveView — server-driven typed UI transitions.** @arbor/router's discriminated union
route tree is structurally perfect for a typed variant: route state transitions are discrete
and typed. A `liveRoute()` factory (Plan 128) could associate a route node with a server
render function, and the `wsRoute` channel type infrastructure provides the typed bidirectional
transport. Advantage over Phoenix: event types are statically verified against the route schema.

### From F# / Swift

**Computation expressions for guard pipelines.** The `.use()` fluent builder shipped in Plan 76
addresses the inside-out readability problem. A generator-based pipeline would let each `yield*`
be a guard check that short-circuits on failure and enriches context on success:

```typescript
const handler = pipeline(function* (ctx) {
  const session = yield* withSession(ctx); // 401 if missing, typed session if present
  const user = yield* withRbac(['admin'])(session); // 403 if unauthorized
  return respond(200, { id: user.id });
});
```

### Novel ideas with no precedent in any framework

**Compile-time contract diffing for CI** (Plan 129). The route tree is a first-class value;
it can be serialized and diffed. A `routerDiff(oldRouter, newRouter)` utility would produce a
typed manifest of breaking changes: removed status codes, new required fields, changed response
shapes, dropped route tags. Integrated into CI: "this PR introduces N breaking client changes,
here are the specific routes." Semver becomes mechanically derivable from the diff output.
This is strictly better than OpenAPI change detection because the Zod schemas — not a
serialized JSON document — are the ground truth.

**Typed audit trail generation** (Plan 130). Every request maps to a typed route; every
response is a typed status code. A `createAuditLogger(router)` utility could derive a typed
audit event schema directly from the route tree — no per-handler instrumentation, no schema
maintenance. The audit schema IS the route schema. Audit trails that are type-proven to be
complete by the framework, not by convention.

**Route-level capability proof system** (Plan 92). Inspired by Rust's traits and Haskell's
`IO`/`ST` monad separation: each route declares the side-effect capabilities it requires
(`DBWrite`, `ExternalAPI`, `SendEmail`) as part of the route type. A handler that tries to
write to the DB on a `[DBRead]` route is a type error. This is different from dependency
injection (it is about _permission_, not injection) and different from guards (it is about
what the handler is allowed to _do_, not what the request is allowed to _match_).

**Session type duality as a unified framework abstraction** (Plans 87–93, complete). The
current session type foundations prove that HTTP `matchResponse`, SSE event streams, and
WebSocket bidirectional channels are all instances of the same underlying `Branch`/`Dual`
type algebra. Plan 93 formally annotates `httpRoute` to prove this isomorphism. @arbor/router
is the only framework where HTTP, SSE, and WebSocket are all governed by the same compile-time
protocol calculus — not three separate typed libraries bolted together.

---

## Subjective Assessment

**Fit for niche: strong, deepening.**

The niche is: TypeScript-first APIs where URL structure matters, where you want the type
system to prevent entire classes of handler mistakes, and where you own both client and
server. That niche now extends to real-time: with SSE and typed WebSocket channels shipped,
@arbor/router is no longer HTTP-only. The session type duality model is something no other
TypeScript framework has attempted.

**Where it is strong:**

- Internal APIs in TypeScript monorepos where client and server share the router definition.
- Applications where URL topology is first-class (navigation, breadcrumbs, link generation)
  not just request routing.
- Teams who want the compiler to prevent 400/401/403/404 logic errors, not just catch typos.
- OpenAPI generation from a single source of truth without a separate annotation pass.
- Real-time features (SSE feeds, WebSocket channels) where typed event contracts and
  protocol duality matter.

**Where it is not the right tool:**

- Public APIs consumed by non-TypeScript clients (the type fidelity advantage disappears;
  tRPC/ts-rest/Hono are simpler choices with larger ecosystems).
- Frontend-heavy applications where TanStack Router or Remix drive navigation — browser
  integration is planned (Wave A unblocked) but not yet shipped.
- Large existing Node/Express codebases; adoption requires rewriting the route layer.

**Maturity / production readiness:**

The library is pre-1.0 (`"version": "0.0.0"`) and under active development. The core routing
engine, HTTP dispatch layer, guard system, and real-time protocol layer are all well-tested
with both runtime and type-level assertions including property-based testing. The session type
foundations and real-time layers (plans 87–93) are newer — treat them as advanced/experimental.
The capability system is spiked but not yet integrated. The browser integration epic (plans
94–126) is starting Wave A now.

**Verdict:** A technically rigorous typed protocol framework with a clear architectural vision.
The phantom-type route tree with bidirectional URL model, the guard enrichment chain, the
exhaustive `matchResponse` combinator, the let-it-crash supervision boundary, and the session
type duality across HTTP/SSE/WebSocket are all things no other TypeScript framework does.
The library solves real problems at the cost of a steep adoption curve and pre-1.0 surface
instability. Best suited for teams who value compile-time correctness over ecosystem maturity
and who own both client and server.
