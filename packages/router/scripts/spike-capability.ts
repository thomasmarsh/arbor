#!/usr/bin/env tsx
/**
 * Spike: Typed capability / environment system (Plan 80)
 *
 * Validates whether TypeScript's conditional types + const generics are
 * sufficient to build a lean service injection system without Effect-TS.
 *
 * Run:       tsx scripts/spike-capability.ts
 * Typecheck: pnpm typecheck
 *
 * Five questions addressed below (Q1–Q5). @ts-expect-error marks are live
 * type proofs — tsc errors if the error disappears, proving the guard is real.
 */

// ── Service Registry ──────────────────────────────────────────────────────────
// An augmentable interface: application code adds service types via declaration
// merging (same pattern as TypeScript's lib.dom.d.ts / @types packages).
// The spike populates it inline; a real app would do:
//   declare module '@arbor/router' { interface ServiceRegistry { ... } }

interface ServiceRegistry {
  'db:read':  { query: (sql: string) => Promise<unknown[]> };
  'db:write': { exec:  (sql: string) => Promise<void> };
  'cache':    { get: (k: string) => Promise<string | null>; set: (k: string, v: string) => Promise<void> };
}

type ServiceKey = keyof ServiceRegistry;

// ── Shared context type ───────────────────────────────────────────────────────

interface ServiceCtx<Needs extends readonly ServiceKey[]> {
  services: Pick<ServiceRegistry, Needs[number]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Q1: Can we declare needs on a route and narrow ctx.services in the handler?
// Q3: Can TypeScript prevent access to undeclared services?
// ─────────────────────────────────────────────────────────────────────────────

// `const Needs` preserves literal tuple types at the call site.
function defineHandler<const Needs extends readonly ServiceKey[]>(
  _needs: Needs,
  handler: (ctx: ServiceCtx<Needs>) => unknown,
): typeof handler {
  return handler;
}

// Q1: ctx.services is Pick<ServiceRegistry, 'db:read' | 'cache'> — exactly
// the two declared services. TypeScript resolves this from the const literal.
const readHandler = defineHandler(['db:read', 'cache'], async (ctx) => {
  const rows = await ctx.services['db:read'].query('SELECT 1');
  const _hit = await ctx.services.cache.get('key');
  return rows;
});

// Q3: Attempting to access an undeclared service is a compile-time error.
// The Pick excludes 'db:write', so the property simply does not exist on the type.
// Proof: the conditional type is 'safe'; if 'db:write' crept into the type the
// conditional would flip to 'error' and the assignment below would fail at compile time.
defineHandler(['db:read'], (_ctx) => {
  const _proof: 'db:write' extends keyof typeof _ctx.services ? 'error' : 'safe' = 'safe';
  void _proof;
  return null;
});

console.log('Q1 ✓  ctx.services narrowed to declared needs via Pick');
console.log('Q3 ✓  accessing undeclared service is a tsc type error');

// ─────────────────────────────────────────────────────────────────────────────
// Q2: Can createServer enforce that all route needs are satisfied?
// ─────────────────────────────────────────────────────────────────────────────

interface RouteEntry {
  path:    string;
  needs:   readonly ServiceKey[];
  // Deliberately loose: contravariance would prevent concrete handlers
  // from being stored in a shared array. Runtime slices before calling.
  handler: (...args: never[]) => unknown;
}

// Key trick: index through the inferred tuple to collect all needs.
// Entries[number]['needs'] → union of needs tuples → [number] → union of keys.
// No Services type parameter needed: the Pick constraint applied directly to
// the `services` parameter is sufficient for TypeScript to catch missing keys.
function createServer<const Entries extends readonly RouteEntry[]>(
  routes: Entries,
  services: Pick<ServiceRegistry, Entries[number]['needs'][number]>,
): { dispatch: (path: string) => Promise<unknown> } {
  return {
    dispatch: (path) => {
      const entry = routes.find(r => r.path === path);
      if (!entry) return Promise.resolve(null);
      // Runtime slice: each handler only receives its declared services.
      const sliced = Object.fromEntries(
        entry.needs.map(k => [k, (services as Record<string, unknown>)[k]]),
      ) as ServiceCtx<typeof entry.needs>['services'];
      return Promise.resolve(entry.handler({ services: sliced } as never));
    },
  };
}

// ✓ Compiles: both 'db:read' and 'cache' are provided.
const _server = createServer(
  [{ path: '/users', needs: ['db:read', 'cache'] as const, handler: readHandler as never }],
  {
    'db:read': { query: () => Promise.resolve([]) },
    'cache':   { get: () => Promise.resolve(null), set: () => Promise.resolve() },
  },
);

// ✗ Compile error (uncomment to verify):
//   createServer(
//     [{ path: '/users', needs: ['db:read', 'cache'] as const, handler: readHandler as never }],
//     { 'db:read': { query: () => Promise.resolve([]) } },  // Missing 'cache' → TS2345
//   );

console.log('Q2 ✓  createServer requires every declared service to be provided');

// ─────────────────────────────────────────────────────────────────────────────
// Q4: Does this compose with the existing guard (withSession / withRbac) model?
// ─────────────────────────────────────────────────────────────────────────────

interface GuardSuccess<BaseCtx, AddedCtx> {
  ok: true;
  ctx: BaseCtx & AddedCtx;
}

interface GuardFailure {
  ok: false;
  response: Response;
}

type Guard<BaseCtx, AddedCtx> = (ctx: BaseCtx) => Promise<GuardSuccess<BaseCtx, AddedCtx> | GuardFailure>;

// withServices has the exact same Guard<BaseCtx, AddedCtx> shape as withSession.
// It slices the global service map per route and enriches ctx with `services`.
// The two guards are fully orthogonal — session adds { session } and services
// adds { services }; their ctx contributions never overlap.
function _withServices<
  const Needs extends readonly ServiceKey[],
  BaseCtx,
>(
  needs: Needs,
  allServices: Pick<ServiceRegistry, Needs[number]>,
): Guard<BaseCtx, ServiceCtx<Needs>> {
  const sliced = Object.fromEntries(
    needs.map(k => [k, (allServices as Record<string, unknown>)[k]]),
  ) as Pick<ServiceRegistry, Needs[number]>;

  return (ctx) => Promise.resolve({
    ok: true as const,
    ctx: { ...ctx, services: sliced },
  });
}

// Type-level proof: a context enriched by both a session guard and a services
// guard is simply the intersection of their contributions — no conflicts.
interface SessionCtx { userId: string }
type EnrichedCtx = SessionCtx & ServiceCtx<readonly ['db:read']>;
const _enriched: EnrichedCtx = {
  userId:   'u_123',
  services: { 'db:read': { query: () => Promise.resolve([]) } },
};
void _enriched;

// Limitation: BaseCtx cannot be inferred from _withServices() arguments alone
// (it doesn't appear in `needs` or `allServices`). Callers must pass it as an
// explicit type argument or accept `BaseCtx = unknown`. In the full
// implementation this is handled by the route builder carrying the BaseCtx
// through the .use() chain.

console.log('Q4 ✓  withServices guard composes cleanly with session / RBAC guards');

// ─────────────────────────────────────────────────────────────────────────────
// Q5 (stretch): Can effect tracking prevent mutating services on GET routes?
// ─────────────────────────────────────────────────────────────────────────────

// Tag services with a readonly/mutating marker at the type level.
// In a real system this would be part of ServiceRegistry itself.
interface TaggedRegistry {
  'db:read':  { _effect: 'readonly'; query: (sql: string) => Promise<unknown[]> };
  'db:write': { _effect: 'mutating'; exec:  (sql: string) => Promise<void> };
  'cache':    { _effect: 'readonly'; get: (k: string) => Promise<string | null>; set: (k: string, v: string) => Promise<void> };
}

type TaggedKey = keyof TaggedRegistry;

// Extract only the mutating service keys from a needs tuple.
type MutatingIn<Needs extends readonly TaggedKey[]> = {
  [K in Needs[number]]: TaggedRegistry[K] extends { _effect: 'mutating' } ? K : never;
}[Needs[number]];

// GET routes may only declare readonly services. AssertReadOnly<Needs> is
// `Needs` when safe and `never` when Needs contains a mutating service key —
// that makes the parameter type `never`, causing a type error at the call site.
type AssertReadOnly<Needs extends readonly TaggedKey[]> =
  MutatingIn<Needs> extends never ? Needs : never;

function defineGetHandler<const Needs extends readonly TaggedKey[]>(
  _needs: AssertReadOnly<Needs>,
  _handler: (services: Pick<TaggedRegistry, Needs[number]>) => unknown,
): void { /* spike: runtime is irrelevant, type safety is the proof */ }

// ✓ All declared services are readonly.
defineGetHandler(['db:read', 'cache'], (services) => {
  return services['db:read'].query('SELECT 1');
});

// ✗ 'db:write' is mutating → AssertReadOnly returns never → type error.
// @ts-expect-error: 'db:write' is mutating, not permitted on GET routes
defineGetHandler(['db:read', 'db:write'], (_services) => null);

console.log('Q5 ✓  _effect tags + conditional types block mutating services on GET routes');

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log(`
=== Spike Results (Plan 80) ===
Q1  FEASIBLE  const generic + Pick<ServiceRegistry, Needs[number]> narrows correctly
Q2  FEASIBLE  Entries[number]['needs'][number] collects all needs; Pick constraint enforces provision
Q3  FEASIBLE  Pick exclusion is enforced at compile time — no extra machinery required
Q4  FEASIBLE  withServices composes as a plain Guard; orthogonal to session / RBAC
Q5  FEASIBLE  _effect tag + conditional AssertReadOnly blocks mutating services at compile time

Shortcomings noted:
  - RouteEntry.handler must be typed loosely (never[]) to avoid contravariance breakage
    when collecting heterogeneous route entries into a shared array; runtime slices safely
  - ServiceRegistry is a global interface — no support for dynamic service registration
  - _effect tagging is at service-granularity, not method-granularity (CacheService.set
    is "mutating" at the method level but the whole service is tagged "readonly" here)
  - TypeScript cannot verify that the runtime slice actually matches the declared needs
    without an opaque phantom wrapper; that is a solvable implementation detail
  - BaseCtx cannot be inferred in withServices() — resolved by the .use() builder chain

Decision: PROCEED — no Effect-TS required. Proceed to Plan 81 for full implementation.
`);
