# Directory Structure

The following is the intended directory structure.

```text
src/
├── core/                       # Core mathematical engine (Platform-Agnostic)
│   ├── index.ts                # Re-exports core primitives
│   ├── segments.ts             # Path string token compile tools
│   ├── segments.test.ts
│   ├── walk.ts                 # Recursive tree descent parsers
│   ├── walk.test.ts
│   ├── route-node.ts           # RouteNode interface, Derive<N>, & Flattener types
│   ├── route-node.test.ts
│   ├── define-routes.ts        # central topology compiler & .stringify() loop
│   └── define-routes.test.ts
│
├── client/                     # Frontend state coordination & Fetch engines
│   ├── index.ts
│   ├── fetch-client.ts         # Global runtime fetch clients (w/ batch rules)
│   ├── fetch-client.test.ts
│   ├── lifecycle-store.ts      # Scoped Loader execution rigs & state bindings
│   └── lifecycle-store.test.ts
│
├── server/                     # WinterCG compliant HTTP engines
│   ├── index.ts
│   ├── server-runtime.ts       # WinterCG req/res parse engine loop
│   ├── server-runtime.test.ts
│   ├── content-demuxer.ts      # Multi-part stream parser and payload extractor
│   └── content-demuxer.test.ts
│
├── security/                   # Multi-layered protection factories & decorators
│   ├── index.ts
│   ├── transport.ts            # CORS headers and CSRF checking decorators
│   ├── transport.test.ts
│   ├── auth-factory.ts         # protectedRoute HOF and compile-time type modifiers
│   ├── auth-factory.test.ts
│   ├── rbac-guard.ts           # authorizedRoute role validation mechanics
│   └── rbac-guard.test.ts
│
├── contexts/                   # Pluggable context configurations
│   ├── index.ts
│   ├── http.ts                 # HttpContext definitions
│   ├── http.test.ts
│   ├── openapi.ts              # Swagger document schemas
│   ├── openapi.test.ts
│   ├── view.ts                 # UI component bindings (React/Solid)
│   └── view.test.ts
│
├── adapters/                   # Ecosystem bridge connections
│   ├── index.ts
│   ├── tanstack.ts             # adaptToTanStackTree dynamic adapter code
│   └── tanstack.test.ts
│
└── index.ts                    # Main entry point (Selective feature exports)
```

Key File Migration Mapping

1. **Move to `core/`**: Your path logic (`segments.ts`), graph navigation controllers (`walk.ts`), node primitives (`route-node.ts`), and route configurations (`define-routes.ts`) represent the protocol-agnostic brain. Isolating them here ensures they remain safe from web platform leakage.
2. **Move to `contexts/`**: Your context shapes (`http-context.ts`, `openapi-context.ts`) are decoupled into a dedicated plugin subdirectory. This clarifies that context shapes are extended parametrically.
3. **Move to `server/`**: Your existing `server.ts` handles standard `Request`/`Response`mechanics, so it forms the base of `server-runtime.ts`. This folder will host your upcoming Multi-part data demuxer routines.
4. **Move to `client/`**: Your existing client code (`client.ts`) handles frontend network transport execution frameworks and lives inside `fetch-client.ts`. This separates networking logic from future frontend lifecycle controllers (`lifecycle-store.ts`).
