# @arbor/router — Features, Comparison, and Assessment

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
depth-limited recursive mapped type (`FlattenChildrenImpl`).

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

## Planned / In-Progress Features

| Plan | Topic                                                                              | Status                           |
| ---- | ---------------------------------------------------------------------------------- | -------------------------------- |
| 75   | `matchResponse` exhaustive combinator                                              | ✓                                |
| 76   | `.use()` fluent builder + `pipeline()` combinator                                  | ✓                                |
| 77   | Declarative `requires` annotation on `httpRoute`                                   | ✓                                |
| 78   | `desc()` / `IntoResponse` — direct body return from handlers                       | ✓                                |
| 79   | Property-based / fuzz testing from Zod schemas                                     | ✓                                |
| 80   | Spike — typed capability / environment system                                      | ✓ (spike: proceed, no Effect-TS) |
| 81   | Default handler supervision (let-it-crash safety net)                              | Queued                           |
| 86   | Lint rules and exhaustiveness-check suppressions                                   | Queued                           |
| 87   | Spike — session types feasibility: `Dual<S>`, `Channel<S>`, depth limits           | ✓                                |
| 88   | Session type foundations: `Send/Recv/Branch/Select/End`, `sessionRoute()`          | ✓                                |
| 89   | `sseRoute()` — typed SSE; handler `AsyncIterable<E>`; dual client                  | ✓                                |
| 90   | `wsRoute()` — typed WebSocket; `{ in, out }` Zod schemas; dual client              | ✓                                |
| 91   | Spike — MPST global type projection, N-participant protocols                       | Queued                           |
| 92   | Capability system: `ServiceRegistry`, `needs` on HTTP/SSE/WS                       | Queued (post-80)                 |
| 93   | `HttpSession` annotation — uniform `_meta` session type across all three protocols | Queued                           |

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
| **Guards / middleware**          | Typed HO factories + fluent `.use()` | Middleware array     | Middleware array       | Middleware chain        | Middleware array  |
| **Rate limiting**                | Built-in (`withRateLimit`)           | External             | External               | Plugin                  | External          |
| **CORS / CSRF**                  | Built-in                             | External             | External               | Plugin                  | External          |
| **JWT / RBAC**                   | Built-in guards                      | External             | External               | External                | External          |
| **Runtime**                      | WinterCG (any)                       | Node + adapters      | Node + adapters        | WinterCG                | Node only         |
| **Query param schemas**          | Yes (per-route Zod)                  | Yes                  | Yes                    | Partial                 | Manual            |
| **Body type safety (GET)**       | Yes                                  | N/A                  | Yes                    | N/A                     | No                |
| **Test client (in-memory)**      | Yes (`createTestClient`)             | Included             | No                     | No                      | No                |
| **Property-based testing**       | Yes                                  | No                   | No                     | No                      | No                |
| **SSE with typed events**        | Yes (`sseRoute`)                     | No                   | No                     | No                      | No                |
| **WebSocket typed channels**     | Yes (`wsRoute`, dual)                | No                   | No                     | Partial                 | No                |
| **Session type duality**         | Yes (compile-time `Dual<S>`)         | No                   | No                     | No                      | No                |
| **MPST (multi-party protocols)** | Spike todo (Plan 91)                 | No                   | No                     | No                      | No                |
| **Capability / effects system**  | Spike done, impl todo(Plan 92)       | No                   | No                     | No                      | No                |

### Gap analysis vs. peers

**vs. tRPC**: tRPC is procedure-oriented, not REST-URL-oriented. It wins on DX for
internal RPC (no URL design required, seamless React Query integration, subscriptions via
the trpc-ws adapter). @arbor/router now has a real-time story — SSE and WebSocket with
compile-time duality — but no TanStack/React integration (deferred spike, plan 24).
tRPC has no bidirectional URL parse/print; URL shape is opaque to the caller. tRPC has no
OpenAPI output without a plugin, and no exhaustive client-side response handling.
@arbor/router fits REST APIs with real URL hierarchies; tRPC fits internal service calls
where URL shape doesn't matter.

**vs. ts-rest**: ts-rest is contract-first: you define an interface object, then implement
it on server and client separately. The contract is the source of truth. @arbor/router
embeds the contract in the route tree itself — definition and contract are the same thing.
ts-rest has no routing engine (it delegates to Express/Hono/Fastify); @arbor/router owns
the entire dispatch stack. ts-rest has no URL parse/print, no real-time support, and no
exhaustive response matching. The key difference: ts-rest is a contract layer on top of an
existing framework; @arbor/router is a full stack from URL to protocol.

**vs. Hono**: Hono is a fast, thin, WinterCG web framework with a conventional middleware
chain and route registration API. It has good TypeScript inference for path params but no
bidirectional URL model, no shared client type, no exhaustive response matching, and limited
OpenAPI support. @arbor/router is not a web framework — it is a typed dispatch layer.
Hono wins on ecosystem maturity, performance tooling, and familiarity. @arbor/router wins
on type fidelity (full response union typing, guard enrichment, session type duality across
HTTP/SSE/WebSocket).

**Gaps remaining vs. peers:**

- No TanStack Router / React integration (deferred spike, plan 24). This is the largest
  adoption gap for frontend-heavy teams.
- No built-in body size limits on `createServer` (multipart safeguard; roadmap item).
- No middleware arrays — intentional design; cross-cutting concerns must be higher-order
  factories or guard composition. More explicit but more verbose than `app.use()` for
  teams coming from Express.
- Radix tree dispatch not yet done (Plan 74, deferred pending benchmark).
- Capability/effects system spiked but not yet integrated (Plan 92 todo).
- MPST (multi-party session types) — spike todo, no implementation plan yet.

---

## Closing the Gaps

### 1. TanStack / React integration

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

### 2. Capability / effects system (Plan 92)

The spike (Plan 80) confirmed that TypeScript can encode capability proofs without Effect-TS.
The implementation (Plan 92) will add a `ServiceRegistry` and a `needs` annotation on HTTP,
SSE, and WebSocket routes. Handlers will receive only the services they declared, and the
server will enforce provision at startup — a compile-time dependency proof.

This is an area where no other HTTP framework competes. The closest precedents are Rust's
trait bounds and Haskell's `IO`/`ST` monad separation. Once implemented, a route that
tries to use a DB write service on a read-only route is a type error at the callsite.

### 3. Default handler supervision (Plan 81)

Currently, uncaught exceptions propagate past the error mapper if not explicitly caught.
Plan 81 wraps every handler dispatch in a supervision boundary that catches uncaught
exceptions, maps them to 500 via the error mapper, and emits a `RequestMetric` — zero
per-handler `try/catch` required. This makes the Erlang OTP "let-it-crash" pattern
a zero-config default, not a convention.

### 4. MPST — multi-party session types (Plan 91 spike)

The session type foundations (Plans 87/88) prove pairwise duality. The next frontier is
N-participant protocols where a global protocol type is defined once and each participant's
local type is derived by projection. The spike (Plan 91) validates TypeScript feasibility
before committing to an implementation plan. If it succeeds, @arbor/router will be the
only HTTP framework with a multi-party typed protocol story.

### 5. HTTP session annotation (Plan 93)

Plans 88–90 established session types for `sessionRoute`, `sseRoute`, and `wsRoute`. Plan
93 closes the loop by adding `SessionMeta<HttpSession<Res>>` as a phantom annotation on
`httpRoute`, making all three protocol families expose a uniform session type in `_meta`.
It also proves that `BranchToUnion<Dual<HttpSession<Res>>> ≡ HttpResponseUnion<Res>` —
i.e., `matchResponse` is formally the `Branch` combinator for HTTP sessions. This unifies
the type theory across the entire framework.

---

## Novel Ideas from Other Ecosystems

### From Haskell / PureScript

**Servant-style type-level API descriptions.** Haskell's Servant library encodes the entire
API as a type. @arbor/router is already philosophically Servant-adjacent — but with session
types now live, the analogy goes deeper: `wsRoute` with `Dual<S>` is structurally identical
to Servant's `WebSocket` combinator. The next step is making the inferred route type truly
isomorphic to the OpenAPI output, so type-level changes automatically invalidate outdated
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
edge cases that no manually written test would cover. This is structurally unique to
schema-first frameworks; frameworks that declare routes imperatively cannot do this without
code introspection.

### From Rust

**Axum's extractor model.** In Axum, handler arguments are typed extractors, each
independently pulling a piece of the request context:

```rust
async fn get_user(Path(id): Path<String>, State(db): State<Db>) -> impl IntoResponse { }
```

Applied to @arbor/router: instead of (or alongside) the monolithic `ctx` object, handlers
could declare named typed extractors as positional arguments — `handler(path: Path<{ id:
string }>, session: Session<UserSession>)` — where each extractor knows how to pull itself
from the resolved route. Handlers become pure functions of typed values. Partial extraction
makes unit testing trivial.

**Zero-cost route compilation.** Rust macros generate specialized code at compile time. At
route definition time, the complete tree structure is statically known. A build-time script
(or a future TS Language Service plugin) could emit a specialized dispatch function for the
exact tree shape — no generic tree walk, no `matchSegments` loop. For large route trees
this collapses the O(N) walk to a cascaded `if/switch` with no allocation. This is more
radical than Plan 74's radix tree and complementary to it.

### From Erlang / Elixir

**Let-it-crash handler supervision** (Plan 81). In OTP, every process is supervised;
crashes are isolated and the supervisor decides the recovery strategy. Plan 81 brings this
to `createServer()`: every handler dispatch wrapped in a supervision boundary that catches
uncaught exceptions, maps them to 500, and emits a `RequestMetric` — with no per-handler
`try/catch`. Making it the default with automatic metric emission would dramatically reduce
boilerplate and ensure no unhandled rejection silently kills the process.

**Phoenix LiveView — server-driven typed UI transitions.** Phoenix LiveView pushes HTML
diffs over a persistent WebSocket; the client applies patches without a full re-render.
@arbor/router's discriminated union route tree is structurally perfect for a typed variant
of this: route state transitions are discrete and typed. A `liveRoute()` factory could
associate a route node with a server render function, and the `wsRoute` channel type
infrastructure already provides the typed bidirectional transport. The key advantage over
Phoenix: event types are statically verified against the route schema.

### From F# / Swift

**Computation expressions for guard pipelines.** F#'s computation expressions make monadic
sequencing readable. The `.use()` fluent builder shipped in Plan 76 addresses the
inside-out readability problem. The next step — generator-based pipelines — would let each
`yield*` be a guard check that short-circuits on failure and enriches context on success:

```typescript
const handler = pipeline(function* (ctx) {
  const session = yield* withSession(ctx); // 401 if missing, typed session if present
  const user = yield* withRbac(['admin'])(session); // 403 if unauthorized
  return respond(200, { id: user.id });
});
```

Each yield point narrows the type of the value it produces. No explicit `if (result.ok ===
false) return result` chains. This is achievable today with a small generator-driving
utility; no new runtime infrastructure required.

### Novel ideas with no precedent in any framework

**Compile-time contract diffing for CI.** The route tree is a first-class value; it can be
serialized and diffed. A `routerDiff(oldRouter, newRouter)` utility would produce a typed
manifest of breaking changes: removed status codes, new required fields, changed response
shapes, dropped route tags. Integrated into CI: "this PR introduces N breaking client
changes, here are the specific routes." This is strictly better than OpenAPI change
detection because the Zod schemas — not a serialized JSON document — are the ground truth.
Semver becomes mechanically derivable from the diff output.

**Typed audit trail generation.** Every request maps to a typed route; every response is a
typed status code. A `createAuditLogger(router)` utility could derive a typed audit event
schema directly from the route tree — no per-handler instrumentation, no schema maintenance.
The audit schema IS the route schema. Every dispatched request automatically emits a
structured, type-verified audit event. Audit trails that are type-proven to be complete by
the framework, not by convention.

**Cross-language client generation from the route tree.** OpenAPI is already supported, but
OpenAPI is lossy: discriminated unions flatten to `oneOf`, optional response fields lose
their Zod refinements, status-code unions collapse to `default`. Because the route tree is
a first-class value with full Zod schema information, a `generateClient('go' | 'python' |
'rust')` function could emit idiomatic typed clients for other languages that preserve more
of the contract than OpenAPI allows.

**Route-level capability proof system** (Plan 92). Inspired by Rust's traits and Haskell's
`IO`/`ST` monad separation: each route declares the side-effect capabilities it requires
(`DBWrite`, `ExternalAPI`, `SendEmail`) as part of the route type. The handler's type is
required to carry a proof that those capabilities were granted. A handler that tries to
write to the DB on a `[DBRead]` route is a type error. This is different from dependency
injection (it is about _permission_, not injection) and different from guards (it is about
what the handler is allowed to _do_, not what the request is allowed to _match_). The spike
(Plan 80) confirmed TypeScript feasibility without Effect-TS; Plan 92 ships it.

**Session type duality as a unified framework abstraction** (Plans 87–93). The current
session type foundations prove that HTTP `matchResponse`, SSE event streams, and WebSocket
bidirectional channels are all instances of the same underlying `Branch`/`Dual` type algebra.
Plan 93 will formally annotate `httpRoute` to prove this isomorphism. Once complete,
@arbor/router will be the only framework where HTTP, SSE, and WebSocket are all governed
by the same compile-time protocol calculus — not three separate typed libraries bolted
together.

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
- Teams building polyglot services who need cross-language clients generated from a
  higher-fidelity source than OpenAPI.

**Where it is not the right tool:**

- Public APIs consumed by non-TypeScript clients (the type fidelity advantage disappears;
  tRPC/ts-rest/Hono are simpler choices with larger ecosystems).
- Frontend-heavy applications where TanStack Router or Remix drive navigation; the browser
  integration story does not exist yet (deferred to a separate package).
- Large existing Node/Express codebases; adoption requires rewriting the route layer.

**Maturity / production readiness:**

The library is pre-1.0 (`"version": "0.0.0"`) and under active development. The core
routing engine is well-tested with both runtime and type-level assertions, including
property-based testing. The session type foundations and real-time protocol layers shipped
in recent waves and are newer — treat them as advanced/experimental. The capability system
is spiked but not yet integrated. The pending plans (81, 86, 91, 92, 93) are cleanup and
architecture extensions, not correctness fixes, which suggests the surface area is
stabilizing.

**Verdict:** A technically rigorous typed protocol framework with a clear architectural
vision. The phantom-type route tree with bidirectional URL model, the guard enrichment chain,
the exhaustive `matchResponse` combinator, and the session type duality across HTTP/SSE/WebSocket
are all things no other TypeScript framework does. The library solves real problems at the
cost of a steep adoption curve and pre-1.0 surface instability. Best suited for teams who
value compile-time correctness over ecosystem maturity and who own both client and server.
