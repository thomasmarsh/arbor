# Source Topology

Actual `src/` layout as of plan 62.

```text
src/
├── index.ts                        # Root barrel — public API surface
├── index.test.ts                   # Root export smoke tests
│
├── core/                           # Platform-agnostic type engine
│   ├── index.ts                    # Re-exports core primitives
│   ├── route-node.ts               # RouteNode<R,C,Context,SectionParams,Meta>, Derive<N>, FlattenChildrenImpl
│   ├── route-node.test.ts
│   ├── define-routes.ts            # defineRoutes(), route(), parse(), print(), stringify()
│   ├── define-routes.test.ts
│   ├── segments.ts                 # Path segment tokeniser and kind types
│   ├── segments.test.ts
│   ├── walk.ts                     # walkParse(), walkSpec() — recursive tree descent
│   ├── walk.test.ts
│   ├── edge-cases.test.ts          # Cross-cutting edge case tests
│   └── types.test.ts               # Type-level tests (expectTypeOf)
│
├── contexts/                       # Protocol-specific route factories (extend core via Meta)
│   ├── index.ts
│   ├── http-context.ts             # httpRoute(), HttpContextData, HttpResponseUnion, respond(), desc()
│   ├── http-context.test.ts
│   ├── openapi-context.ts          # openApiRoute(), OpenApiCtxData
│   └── openapi-context.test.ts
│
├── openapi/                        # OpenAPI spec generation
│   ├── index.ts
│   ├── generate-spec.ts            # generateSpec(router) → OpenAPI 3 object
│   └── generate-spec.test.ts
│
├── server/                         # WinterCG HTTP runtime
│   ├── index.ts
│   ├── server.ts                   # createServer(), handle(), executeRoute()
│   ├── server.test.ts
│   ├── guard.ts                    # withGuard(), composeGuards(), Guard<Ctx> type
│   ├── guard.test.ts
│   ├── parse-body.ts               # Content-type demux (JSON, multipart, form)
│   ├── parse-body.test.ts
│   ├── rate-limit.ts               # Per-route rate limiter
│   ├── rate-limit.test.ts
│   ├── with-api-key.ts             # withApiKey() guard
│   ├── with-api-key.test.ts
│   ├── with-cors.ts                # withCors() wrapper + per-route CORS
│   ├── with-cors.test.ts
│   ├── with-metrics.ts             # withMetrics() telemetry decorator
│   ├── with-metrics.test.ts
│   ├── with-rbac.ts                # withRbac() guard
│   ├── with-rbac.test.ts
│   ├── with-session.ts             # withSession() JWT/session guard
│   ├── with-session.test.ts
│   └── edge-cases.test.ts
│
├── client/                         # Typed fetch client
│   ├── index.ts
│   └── fetch-client.ts             # createClient(), TypedClient utility type
│   └── fetch-client.test.ts
│
└── security/                       # Security re-exports (barrel only for now)
    └── index.ts
```

## Module Dependency Rules

```text
core  ←  contexts  ←  server
                  ←  openapi
core  ←  client
```

`core/` must never import from `contexts/`, `server/`, `openapi/`, or `client/`. Violations are a type-safety hazard and break tree-shaking for library consumers.

## Key Types (quick reference)

| Symbol | File | Purpose |
| --- | --- | --- |
| `RouteNode<R,C,Ctx,SP,Meta>` | `core/route-node.ts` | Core route shape; `_type` is phantom |
| `FlattenChildrenImpl<C>` | `core/route-node.ts` | Depth-counted recursive type; replaces `_child` phantom |
| `Derive<N>` | `core/route-node.ts` | Union of all descendant route nodes |
| `httpRoute()` | `contexts/http-context.ts` | Creates an HTTP route node with method + status map |
| `HttpContextData` | `contexts/http-context.ts` | `_meta` shape for HTTP routes |
| `respond(status, body)` | `contexts/http-context.ts` | Type-safe response constructor |
| `createServer()` | `server/server.ts` | WinterCG request handler factory |
| `withGuard()` | `server/guard.ts` | Wraps a route handler with a pre-check guard |
| `createClient()` | `client/fetch-client.ts` | Typed fetch client factory |
| `generateSpec()` | `openapi/generate-spec.ts` | Walks route tree → OpenAPI 3 JSON |
