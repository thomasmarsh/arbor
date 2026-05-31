# Browser Integration — Master Plan

_Top-level planning document. Individual plan files live in `plan/`. Update this file when
plan status changes. Numbers start at 94 (first unused after current server-side wave).
Plans 113–118 cover the opt-in TCA layer (Wave G)._

---

## Vision

`@arbor/router` produces a typed discriminated-union route tree. That same tree is the
perfect primitive for browser navigation: `parse(url)` yields a narrowed route object;
`print(route)` yields a URL; the union is the component-switch interface. No separate
"route definition" objects, no string-based `to` props that drift from the server, no
codegen. The browser integration is a thin reactive wrapper around primitives that already
exist.

The browser story is structured in three layers:

```
packages/router-browser   ← framework-agnostic History API adapter (+ opt-in TCA reducer)
packages/router-react     ← React hooks + components (depends on router-browser)
packages/router-tanstack  ← TanStack Router bridge (spike-gated, plan 106)
```

`packages/router` and `packages/common` are unchanged. The browser packages are
consumers, not extensions.

### Two integration paths (both supported, choose one at the app level)

```
Hooks path (Waves A–F):
  BrowserRouter → RouterProvider → useRoute / useNavigate / <Link>
  Simple, no TCA dependency, good for greenfield React apps.

TCA path (Wave G, opt-in):
  BrowserRouter → routerReducer + routerStore → RouterStoreProvider → same hooks
  For teams already using Store/Reducer/Effect from @arbor/common.
  Adds: withLogging, time-travel devtools, mockRouterEnv for tests,
        streaming effects for SSE/WS, unified meta/scroll/loader dispatch.
```

All React hooks (`useRoute`, `useNavigate`, `useMatch`, `<Link>`, `<RouteLayout>`) are
identical regardless of which path is used at the root. No component rewrites required
when switching between paths.

---

## Package Map

| Package | Contents | Peer deps |
| --- | --- | --- |
| `@arbor/router-browser` | `BrowserRouter`, `navigate()`, `subscribe()`, search-param helpers, `routerReducer` (TCA opt-in) | — |
| `@arbor/router-react` | `RouterProvider` (hooks), `RouterStoreProvider` (TCA), `useRoute`, `useNavigate`, `<Link>`, `<RouteLayout>`, SSE/WS hooks | React 18+ |
| `@arbor/router-tanstack` | `adaptToTanStack()` bridge, loader wiring | TanStack Router v1+ |
| `@arbor/router-devtools` | Browser DevTools panel / overlay; action-log + time-travel when TCA path is used | React 18+ |

---

## Wave Plan

### Wave A — Foundation (plans 94–96)

Establish the browser packages with zero React dependency. All primitives are plain
TypeScript. Testing via `jsdom` + `vitest`.

| Plan | Topic | Mode |
| --- | --- | --- |
| [94](plan/94.spike-browser-package-scaffold.md) | Spike — package scaffold, jsdom vs. browser-mode vitest | Spike |
| [95](plan/95.browser-navigation-core.md) | `packages/router-browser` — `BrowserRouter`, History API, `subscribe()` | Deliver |
| [96](plan/96.browser-search-params.md) | Typed URL search params — `parseSearch` / `printSearch` with Zod | Deliver |

### Wave B — React bindings (plans 97–99)

`packages/router-react` — the primary consumer API. Zero routing magic: the route type
IS the component interface.

| Plan | Topic | Mode |
| --- | --- | --- |
| [97](plan/97.react-router-bindings.md) | `RouterProvider`, `useRoute`, `useNavigate`, `useMatch` | Deliver |
| [98](plan/98.link-component.md) | `<Link to={route}>` typed link, modifier-key aware | Deliver |
| [99](plan/99.route-layouts.md) | `<RouteLayout>` nested layouts, parent-mount stability | Deliver |

### Wave C — Data layer (plans 100–104)

Attach loaders to the route tree; execute them in parallel before mounting new routes.

| Plan | Topic | Mode |
| --- | --- | --- |
| [100](plan/100.spike-data-loaders.md) | Spike — loader API design (route-attached vs. separate map, Suspense vs. explicit) | Spike |
| [101](plan/101.data-loaders-impl.md) | Full loader implementation (post-spike) | Deliver |
| [102](plan/102.navigation-lifecycle.md) | Pending / committed / error navigation states; React Suspense integration | Deliver |
| [103](plan/103.optimistic-prefetch.md) | Hover-prefetch, loader cache keyed by serialized route | Deliver |
| [104](plan/104.code-splitting.md) | `lazyRoute()` — parallel module-load + loader on navigation | Deliver |

### Wave D — Real-time in browser (plans 107–108)

SSE and WebSocket hooks tied to React component lifecycle. The clients already exist in
`@arbor/router`; this wave wraps them with connection lifecycle management.

| Plan | Topic | Mode |
| --- | --- | --- |
| [107](plan/107.sse-browser-lifecycle.md) | `useSSE()` hook — typed subscription, reconnect, cleanup on unmount | Deliver |
| [108](plan/108.ws-browser-lifecycle.md) | `useWebSocket()` hook — typed send/receive, connection state | Deliver |

### Wave E — UX polish (plans 109, 111–112)

Quality-of-life features that depend on the navigation core being stable.

| Plan | Topic | Mode |
| --- | --- | --- |
| [109](plan/109.navigation-history.md) | `useRouteHistory()` — typed back/forward stack, undo/redo | Deliver |
| [111](plan/111.route-meta-tags.md) | Route-level `<title>` + `<meta>` synchronisation | Deliver |
| [112](plan/112.scroll-restoration.md) | Scroll save/restore on back/forward; per-route scroll config | Deliver |

### Wave F — Ecosystem bridges (plans 105–106, 110)

Ecosystem integrations that require their own spikes before committing.

| Plan | Topic | Mode |
| --- | --- | --- |
| [105](plan/105.spike-tanstack-query.md) | Spike — route as TanStack Query key; typed query invalidation | Spike |
| [106](plan/106.spike-tanstack-router-bridge.md) | Spike — undefer plan 24; type compat + path syntax mapping | Spike |
| [110](plan/110.devtools.md) | `@arbor/router-devtools` — route inspector, loader status, SSE/WS panel | Deliver |

### Wave G — TCA opt-in layer (plans 113–118)

Opt-in integration for teams already using `Store / Reducer / Effect` from
`@arbor/common`. Navigation state becomes a TCA state machine. All hooks from waves
A–F remain available and work identically under either provider.

| Plan | Topic | Mode |
| --- | --- | --- |
| [113](plan/113.spike-router-store.md) | Spike — router as TCA `Store`; streaming effects; teardown (Q1–Q5) | Spike |
| [114](plan/114.router-reducer.md) | `routerReducer`, `RouterState`, `RouterAction`, `RouterEnv`, `createRouterStore` | Deliver |
| [115](plan/115.react-tca-bindings.md) | `RouterStoreProvider` — TCA provider; same hooks as Wave B | Deliver |
| [116](plan/116.effect-streaming.md) | `Effect.stream<A>` with teardown; SSE + WS as long-lived `RouterEnv` effects | Deliver |
| [117](plan/117.router-store-loaders.md) | Loaders, meta, scroll as `RouterEnv` capabilities + `RouterAction` branches | Deliver |
| [118](plan/118.store-devtools-integration.md) | DevTools action log + time-travel for TCA path; `withDevtools` middleware | Deliver |

### Wave H — Server-Side Rendering (plans 119–126)

SSR replaces the BFF's `index.html` catch-all with a streaming React render.
`@arbor/router` is already WinterCG-compatible and has zero browser globals —
the entire server-side dispatch stack works on Node.js today.

⚠️ **Plan 120 is an early foundation**: it defines `RouterAdapter<Route>` which plan 97
(`RouterProvider`) must be typed against. Plan 120 should be executed before or alongside
plan 97 — not after.

| Plan | Topic | Mode | Blocks |
| --- | --- | --- | --- |
| [119](plan/119.spike-ssr-foundations.md) | Spike — `RouterAdapter`, valtio server safety, React SSR API, head management | Spike | 120–126 |
| [120](plan/120.router-adapter-static-router.md) | `RouterAdapter` interface + `StaticRouter` (⚠️ early — before plan 97) | Deliver | 97, 123 |
| [121](plan/121.loader-dehydration.md) | Loader dehydration (server→HTML) + rehydration (HTML→cache) | Deliver | 123 |
| [122](plan/122.head-management.md) | Server-safe `<title>` / `<meta>` collection; React 18 vs 19 path | Deliver | 123 |
| [123](plan/123.render-route.md) | `renderRoute()` — WinterCG streaming render; `@arbor/router-react/server` | Deliver | 124, 125 |
| [124](plan/124.bff-ssr-integration.md) | Wire `renderRoute` into BFF Hono catch-all; Vite manifest; dev vs prod | Deliver | — |
| [125](plan/125.streaming-ssr.md) | Streaming SSR — deferred loaders, selective hydration, `hydrateRoot` | Deliver | — |
| [126](plan/126.ssr-tca-path.md) | `staticRouterEnv`, `dehydrateStore` — SSR for TCA path | Deliver | — |

---

## Core Design Constraints

**No magic URL strings.** `<Link to="/users/42">` is banned. Every navigation is typed:
`<Link to={{ tag: 'user', id: '42' }}>`. The compiler catches broken links.

**`@arbor/router` is unchanged.** Browser packages are pure consumers. The route tree API
(`parse`, `print`, the `RouterContract` interface) is already the right abstraction.

**Framework-agnostic core.** `packages/router-browser` has zero framework imports.
`packages/router-react` depends on it. A future `packages/router-solid` or
`packages/router-vue` would share the same core.

**Loaders are typed by route.** A loader attached to route `{ tag: 'user', id: string }`
receives `{ id: string }` as its argument. The compiler enforces this. No `params: any`.

**Real-time lifecycle matches component lifecycle.** `useSSE` / `useWebSocket` hooks
(hooks path) subscribe on mount and unsubscribe on unmount. In the TCA path, SSE/WS
connections are `Effect.stream` values in `RouterEnv`; teardown fires on fiber interruption.

**TCA path is additive, not replacement.** The hooks layer (plans 97–112) ships first and
is complete on its own. Wave G (plans 113–118) layers the TCA store on top. The `Store /
Reducer / Effect` pattern from `@arbor/common` is the integration point; nothing in
`@arbor/router` or `packages/router-browser` depends on it.

**SSR must not require `window` at module load time.** Any planned code that calls
`window.*` must do so inside method bodies, never at the top level. `BrowserRouter`
being imported in a Node.js SSR context must not crash. This is an invariant to maintain
across all plans in waves A–G.

---

## Non-Goals

- Framework-specific routing conventions (file-based routing, Remix loaders, Next.js pages)
  — we are building a typed primitive layer, not a framework opinion.

---

## Open Questions

1. **Loader placement**: should a loader be attached to the route node (via `.withLoader()`)
   or maintained in a separate map keyed by route tag? Attachment is ergonomic but couples
   a UI concern to a shared definition; a separate map is explicit but requires keeping two
   structures in sync. Plan 100 (spike) answers this.

2. **Suspense vs. explicit loading state**: React Suspense works well for initial load but
   is awkward for transitions. An explicit `pending` state from `useRoute()` gives more
   control. Plan 100 explores both.

3. **TanStack Router feasibility**: arbor uses `:param` / `#param`; TanStack uses `$param`.
   Optional segments and wildcards may not map mechanically. Plan 106 (spike) answers this.

4. **Search param ownership**: the server `httpRoute` already has `query` schema on routes.
   Can the browser reuse those schemas for search-param parsing, or do browser routes
   need separate search schemas? Plan 96 investigates.

5. **DevTools packaging**: standalone `<script>` overlay vs. Chrome Extension vs.
   React-rendered panel. Plan 110 decides.
