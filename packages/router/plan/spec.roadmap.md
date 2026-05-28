# Comprehensive Engineering Roadmap: Project Nexus 🪐

## 1. Architectural Mandate

Nexus must remain completely agnostic to the underlying runtime environment by strictly consuming and emitting **WinterCG web-standard primitives** (`Request`, `Response`, `File`, `FormData`, `URLSearchParams`).

To preserve type lineage and clean tracking, **implicit middleware arrays are explicitly forbidden**. Cross-cutting concerns are handled via **Higher-Order Route Factories** (to mutate schema contracts at compile time) and **Functional Decorators** (to wrap execution loops at runtime).

---

## 2. Client-Side Engineering Backlog (The UI Lifecycle Gap)

### Phase C1: Parallel Async Data Fetching (`loaders`)

- **The Problem**: Traditional UI routers use sequential component-level fetching, causing network waterfalls. Nexus needs to trigger parallel data-fetching the moment a structural navigation change begins, before the view component mounts.
- **Contract Extension**: Update the pluggable route creation options to accept an optional `loader` function. The loader’s input parameters must automatically inherit the type-narrowed properties inferred from that specific route's schema.
  ```typescript
  // Inferred type argument ensures type-safe parameter lookup
  loader: async ({ params }) => { ... }
  ```
- **Execution Engine**: Implement a client-side navigation runner. When a target state object is dispatched, the runner recursively searches the active branch in the topology, collects all matching `loader` promises across parent and child nodes, and fires them concurrently using `Promise.all`.
- **State Store Synchronization**: The resolution of the loader pipeline must yield a unified data payload object that is pushed directly into the global state store (e.g., TCA / Redux slice) alongside the parsed route object, ensuring layout components never mount without their data dependencies.

### Phase C2: Structural Lifecycle Tracking (Pending & Error Boundaries)

- **The Problem**: Web applications need UI feedback during slow network operations and must gracefully isolate layout-level crashes.
- **State Extensions**: Expand the global routing state shape to explicitly track async transition metadata:

  ```typescript
  type RoutingLifecycle<T> =
    | { status: 'idle'; data: T }
    | { status: 'pending'; previousData: T; target: string }
    | { status: 'error'; error: Error };
  ```

- **Layout Switching Mechanics**: In the frontend layout switch loop (`switch(route.tag)`), update the view boundaries to evaluate this metadata. If a branch is marked `pending`, the parent view shell remains active while rendering an inline loading placeholder where the `.child` view would normally mount.
- **Error Isolation**: Wrap sub-layout switches in functional error-boundary catch states. If a specific node child crashes or its loader rejects, the application catches the failure locally, keeping parent layouts (like the main sidebar or workspace navigation header) fully responsive.

### Phase C3: Search Parameter Structural Inheritance

- **The Problem**: Global query states (e.g., `?theme=dark`, `?debug=true`) are easily lost when navigating between deeply nested sub-routes using structural state updates.
- **Inheritance Engine**: Modify the navigation engine (`useNavigator` and `<Link>`) to automatically read the active global `URLSearchParams` object from the browser window prior to triggering a state transition.
- **Merge Logic**: Provide an explicit merge configuration. Global structural parameters declared at the root topology layer must persist and be automatically appended to the newly compiled `stringify` string path, unless the navigation payload explicitly overrides them.

---

## 3. Server-Side Engineering Backlog (The Infrastructure Gap)

### Phase S1: Advanced Content-Type Demuxing (Multipart / Stream Validations)

- **The Problem**: Standard JSON parsing fails when handling heavy binary buffers, large file uploads, or multipart form payloads.
- **Zod Schema Type Guarding**: Integrate `z.instanceof(File)` or `z.instanceof(Blob)` validations inside the core schema property boundaries.
- **The Parser Interceptor**: Inside the core `createServer` WinterCG request listener, inspect the incoming `Content-Type` header:
  - If it matches `application/json`, populate the payload object using `await req.json()`.
  - If it contains `multipart/form-data`, read the streams using `await req.formData()`. Iterate through the entries, unpack the files/fields into a raw key-value object, and feed it straight into the Zod `.safeParse()` validation engine.
- **Streaming Backpressure Safeguards**: Provide a configuration parameter on the server option layer to enforce explicit execution limits (e.g., max payload size constraints) before parsing incoming streams to prevent memory-exhaustion exploits.

### Phase S2: Parametric Operational Policies (Rate Limiting & Telemetry)

- **The Problem**: Infrastructure concerns like tracking endpoint hit rates and preventing denial-of-service spikes should be declared at the contract level but managed outside the core business logic.
- **Rate-Limiting Structure**: Add a parametric configuration property to the pluggable context: `rateLimit?: { windowMs: number; maxRequests: number }`.
- **The Interceptor Hook**: Inside `createServer`, if the matched route topology exhibits a `rateLimit` contract, extract a unique request identifier (e.g., `x-forwarded-for` header or user token hash). Query an abstracted cache layer (e.g., memory map, Redis instance) against the policy bounds. If validation fails, drop the request instantly and return a clean WinterCG `429 Too Many Requests` Response.
- **Metrics Decoration**: Wrap the final generated `createServer` request processing loop inside a functional telemetry decorator function (`withMetrics`). The decorator intercepts the execution lifecycle, measures the nanosecond duration between input and execution output, and emits structured logs using the matched node's unique `tag` identifier.

---

## 4. Layered Security Architecture Backlog

### Phase SEC1: Transport Layer Defenses (CORS & CSRF)

- **The Problem**: Web applications must lock down resource access across origins and defend against malicious cross-site scripting handshakes.
- **Functional CORS Wrapper**: Create an autonomous server-level wrapper that sits completely outside the internal routing loop. This function reads incoming requests, checks origins against a secure whitelist registry, and automatically returns the necessary headers (`Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`). It also intercepts HTTP `OPTIONS` pre-flight requests, returning a fast `204 No Content` block before the route parser ever runs.
- **Cryptographic CSRF Validation**: Implement an anti-CSRF token verification system. For mutating request methods (`POST`, `PUT`, `DELETE`), the server decorator extracts a specialized token from custom request headers (e.g., `x-csrf-token`) and matches it against a secure, HTTP-only cookie signature. If a validation mismatch is detected, execution halts with a `403 Forbidden` response.

### Phase SEC2: Compile-Time Authentication Contracts (JWT / Session Extraction)

- **The Problem**: Compilers should prevent developers from writing code that handles private data without proving authentication checks have occurred.
- **Higher-Order Route Factories**: Implement a pure composition wrapper function `protectedRoute(node)` that safely mutates the pluggable context parameters of a given route tree node at compile time:
  ```typescript
  export function protectedRoute<R, Child, C extends RouteNode<any, any, any, any>[], Q>(
    node: RouteNode<R, Child, C, any, Q>,
  ): RouteNode<R, Child, C, { authenticated: true }, Q>;
  ```
- **Context Mutation Signatures**: Update the global server handler dictionary mapping engine (`ServerHandlers`). Use a conditional ternary mapping loop to check for the presence of `{ authenticated: true }`. If detected, modify the request handler's arguments, rendering the `session: UserSession` object **completely mandatory** at compile time.
- **Runtime Token Evaluation**: Inside `createServer`, if a route resolves with an `authenticated` contract constraint, the system calls a user-supplied async hook (`resolveSession(req)`). This hook decodes and cryptographically verifies the bearer JWT from the `Authorization` header. If the signature is valid, the resulting `UserSession` payload is injected into the context argument of the endpoint handler. If validation fails, it outputs an explicit `401 Unauthorized` block.

### Phase SEC3: Fine-Grained Authorization Policies (RBAC)

- **The Problem**: Different endpoints require distinct user clearances (e.g., a standard employee cannot access administrative endpoints).
- **Parametric Access Controls**: Extend the composition layer to accept specific role strings: `authorizedRoute(node, ['admin', 'super-user'])`. This modifies the node's pluggable context to enforce a specific `requiredRoles` string array interface.
- **The Authorization Guard**: Expand the runtime authentication processor block. After extracting a verified `UserSession` object during Phase SEC2, the server execution engine checks the user's `roles: string[]` collection against the route node's `requiredRoles` array constraint. If the required clearance rules are not met, the pipeline short-circuits instantly, providing a secure `403 Forbidden` standard web response to the client.
