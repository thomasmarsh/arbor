# Spike Notes

## Plan 80 — Capability system spike (2026-05-30)

**Spike file**: `scripts/spike-capability.ts`  
**Decision**: PROCEED — no Effect-TS required.

### Q1: Can `needs` narrow `ctx.services`?
**Yes.** `const Needs extends readonly ServiceKey[]` at the call site + `Pick<ServiceRegistry, Needs[number]>` in the handler's `ctx` type gives exact narrowing. TypeScript resolves the Pick on concrete literal tuples eagerly.

### Q2: Can `createServer` type-check that all route needs are satisfied?
**Yes.** The expression `Entries[number]['needs'][number]` distributes through the route tuple to collect the union of all declared service keys. The constraint `Services extends Pick<ServiceRegistry, <that union>>` then enforces that every key is provided. A missing service produces TS2322 at the `createServer` call site.

### Q3: Can TypeScript prevent access to undeclared services?
**Yes.** `Pick<ServiceRegistry, Needs[number]>` is a closed set — properties not in `Needs` simply do not exist on the type. Any access produces a standard "Property does not exist" error. Confirmed via live `@ts-expect-error` directive in the spike.

### Q4: Does this compose with the existing guard model?
**Yes.** `withServices` returns `Guard<BaseCtx, ServiceCtx<Needs>>` — identical shape to `withSession`. The two enrich disjoint parts of `ctx` (`session` vs. `services`), so their intersection is conflict-free.

**Known limitation**: `BaseCtx` cannot be inferred from `withServices()` call-site arguments (it doesn't appear in `needs` or `allServices`). Defaults to `unknown` unless specified explicitly. In the full implementation this is resolved by the route builder carrying `BaseCtx` through the `.use()` chain.

### Q5: Can effect tracking prevent mutating services on GET routes?
**Yes.** A `_effect: 'readonly' | 'mutating'` tag on `ServiceRegistry` entries + a conditional `MutatingIn<Needs>` type + `AssertReadOnly<Needs> = MutatingIn<Needs> extends never ? Needs : never` makes the route-factory parameter type `never` when any mutating service is declared. Confirmed live in the spike.

**Coarseness**: tagging is service-granularity, not method-granularity. `CacheService.set` is mutating at the method level but the whole service is tagged `'readonly'` here. Finer-grained tracking would require per-method tagging, which is feasible but more complex.

### Other findings
- **Contravariance**: Storing heterogeneous handlers in a shared `RouteEntry[]` requires loosening the handler type to `(...args: never[]) => unknown`. The runtime slice delivers the correct subset of services; the type safety boundary is at the per-route handler definition, not the array.
- **Global interface**: `ServiceRegistry` being a module-level interface means all service names must be known at compile time. No dynamic registration. Acceptable for the target use case.
- **ServiceRegistry as augmentable**: Declaration merging lets application code add service types without modifying the library. Same pattern as TypeScript's `lib.dom.d.ts`.
