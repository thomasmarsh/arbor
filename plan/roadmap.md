# Roadmap

## Architectural Mandate

`@arbor/router` is a runtime-agnostic URL router with full TypeScript type inference — no codegen required. The route type is a nested discriminated union built from phantom types; handlers receive a fully typed context derived entirely from the route tree definition.

**Invariants that must never be violated:**

- Consume and emit only **WinterCG web-standard primitives** (`Request`, `Response`, `FormData`, `URLSearchParams`). No platform-specific imports in `core/` or `server/`.
- Implicit middleware arrays are forbidden. Cross-cutting concerns are handled via **Higher-Order Route Factories** (compile-time schema mutation) and **Guard decorators** (runtime wrap).
- `core/` must not import from `contexts/` or `server/`. Dependency flow is strictly one-way: `core → contexts → server`.

---

## In Scope

Active work is tracked numerically in `plan/work-order.md`. Current target areas:

| Area | Plans | Status |
| --- | --- | --- |
| Segment correctness (int-only num, optional ordering, wildcard as string) | 67, 69, 68 | ✓ |
| Feature completeness (method/body safety, Allow header, test client) | 71, 73, 72 | ✓ |
| Client correctness (`matchResponse` combinator) | 75 | ✓ |
| Ergonomics (`use()` builder, declarative `requires`) | 76, 77 | ✓ |
| Handler ergonomics (`IntoResponse`) | 78 | ✓ |
| Structural cleanup (barrel, OpenAPI decompose, rate-limit decouple) | 63, 64, 65, 66 | ✓ |
| Testing automation (property-based, fuzz) | 79 | queued |
| Architecture spikes (capability system spike, radix tree, handler supervision) | 80, 74, 81 | deferred/spike |
| **Capability system implementation — `ServiceRegistry`, `needs` on HTTP/SSE/WS** | **92** | **queued (post-80)** |
| Lint rules and suppressions | 86 | queued |
| **Session types — feasibility spike + core foundations** | **87, 88** | **queued** |
| **Real-time protocols — SSE + WebSocket** | **89, 90** | **queued (post-88)** |
| **MPST — multi-party session type spike** | **91** | **spike/deferred** |

---

## Browser Integration (new packages — Wave 20)

The browser integration story is now active. See `BROWSER.md` at the workspace root for
the full master plan and wave breakdown (plans 94–112).

**Package structure:**

| Package | Contents |
| --- | --- |
| `packages/router-browser` | Framework-agnostic `BrowserRouter`, History API, search params, loaders, scroll restoration |
| `packages/router-react` | React hooks + components: `RouterProvider`, `useRoute`, `<Link>`, `<RouteLayout>`, SSE/WS hooks |
| `packages/router-tanstack` | TanStack Router bridge (spike 106 must go first) |
| `packages/router-devtools` | Browser DevTools overlay (plan 110) |

**`@arbor/router` is unchanged.** Browser packages are pure consumers. The constraint
from wave 4–6 holds: `core/` must not import from any browser package.

## Out of Scope for `@arbor/router`

These items must not be implemented in the core router package:

- **Browser-side navigation runtime** — in `packages/router-browser` (plans 94–96, 100–104, 109, 111–112).
- **React components / hooks** — in `packages/router-react` (plans 97–99, 105, 107–109).
- **TanStack Router bridge** — in `packages/router-tanstack` (plan 106 spike first).
- **E2E integration test rig** — CI/developer tooling concern; no plan until feature surface stabilises.

---

## Deferred (benchmark- or dependency-gated)

- **Plan 70** — Pattern/regex segment kind (`~name:regex`). Do after segment correctness wave (67–69) settles.
- **Plan 74** — Radix tree router. Benchmark O(N) against real workloads first; implement only if measurable.
- **Plan 24** — TanStack bridge. Superseded by plan 106 (spike); will decide go/no-go there.

---

## Long-Horizon Directions

### Session Types & Real-Time Protocols

Session types are a formal type theory for communication protocols. The key property is
*duality*: the server declares its channel type; the client automatically receives the
mathematically complementary type. Protocol compatibility is a compile-time guarantee, not
a runtime convention.

For @arbor/router, this unlocks everything beyond atomic REST:

- **SSE** (`sseRoute()`, plan 89) — typed server→client event stream; handler returns
  `AsyncIterable<EventType>`; client receives `AsyncIterable<EventType>` from the same
  schema. No casting, no `any`, event shape is known at compile time.
- **WebSocket** (`wsRoute()`, plan 90) — bidirectional typed channel; `{ in, out }` Zod
  schemas on the server; client automatically receives the dual (server's `in` = client's
  `out`, and vice versa). Mismatches are type errors.
- **Structured RPC** — typed protocol sequences beyond single request/response; encoding
  via `Send<T, Recv<U, End>>` session type primitives (plan 88 foundations).
- **MPST** — multi-party session types (plan 91 spike); global protocol describes all
  N-participant interactions; each participant's local type is derived by projection.

**Feasibility path:**

1. Plan 87 (spike) — validates that TypeScript can encode `Dual<S>`, `Channel<S>`, and
   recursive session trees without hitting instantiation limits.
2. Plan 88 (foundations) — ships `Send/Recv/Branch/Select/End`, `Dual<S>`, `Channel<S>`,
   `sessionRoute()` factory; de-risks core type system before any runtime code lands.
3. Plan 89 (SSE) — first practical implementation, unidirectional.
4. Plan 90 (WebSocket) — bidirectional, pluggable transport adapter.
5. Plan 93 (HTTP annotation) — closes the loop: adds `SessionMeta<HttpSession<Res>>` phantom
   to `httpRoute` so all three protocol families expose a uniform session type in `_meta`.
   Proves `BranchToUnion<Dual<HttpSession<Res>>> ≡ HttpResponseUnion<Res>` and documents
   that `matchResponse` is the `Branch` combinator for HTTP sessions.
5. Plan 91 (MPST spike) — validates multi-party projection; long-horizon.

The phantom-type architecture that powers HTTP route discrimination is structurally
well-suited for session types. `_meta` already carries typed per-route metadata;
`createClient()` already inverts the route type. Session type duality is the same
inversion, generalized from HTTP method/response to arbitrary protocol steps.

No other TypeScript HTTP framework has a session type story. This is a genuine
differentiator that turns @arbor/router from an HTTP-only library into a unified
typed protocol framework.

---

### Other Long-Horizon Items

- **Typed capability / environment system** (Plan 80 spike) — model service injection and capability proofs in TypeScript's type system without Effect-TS.
- **`@arbor/router-test` package** — property-based testing from Zod schemas using `createTestClient`; generates arbitrary valid inputs and asserts responses match declared schemas.
- **TypeScript compiler performance** — as route trees grow, benchmark and simplify utility types to keep IDE autocomplete snappy. Plan 43 established the baseline; revisit when trees exceed ~50 routes.
