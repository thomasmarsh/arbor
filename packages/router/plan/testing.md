# Testing Philosophy

Treat testing as a tool to **understand and stabilize** the system, not just to check
boxes. The goal is maximal insight and confidence, not maximal line coverage.

## 1. Five Tiers for This Codebase

This router has distinct correctness concerns at different levels. Each tier catches
failures the others cannot.

| Tier | Tool | What it catches |
| --- | --- | --- |
| **Type-level** | `expectTypeOf` / `@ts-expect-error` | Inference regressions, phantom type contracts, discriminated union correctness |
| **Unit / example** | `expect` + Vitest | Algorithm correctness: segment parsing, walk logic, server primitives |
| **Diagnostic** | inline snapshots | Error message quality, `ParseDiag` output, structured failure paths |
| **Integration** | `createTestClient` | Whole-pipeline coherence: route → parse → dispatch → response |
| **Property-based** | `fast-check` | Invariants at scale: round-trips, monotonicity, never-throw guarantees |

Never let tiers substitute for each other. A type test that passes does not guarantee
the runtime works. A happy-path unit test does not reveal invariant violations at the
boundary.

---

## 2. Type-Level Tests

Use `expectTypeOf` for phantom type contracts, inference regression, and discriminated
union narrowing. Use `@ts-expect-error` for compile-time rejection proofs.

```typescript
// Equality — most precise; prefer over toMatchTypeOf
expectTypeOf<Result>().toEqualTypeOf<Expected>();

// Structural subset — useful when you care about a sub-shape
expectTypeOf<Result>().toExtend<{ tag: string }>();

// Negative proof
expectTypeOf<Result>().not.toExtend<{ query: unknown }>();

// Compile-time rejection
// @ts-expect-error — 'nonexistent' is not a valid route tag
router.print({ tag: 'nonexistent' });
```

**Regression targets:** any refactor to `FlattenChildrenImpl`, `Derive`, `ChildUnion`,
`InferRoute`, or `ResponseUnion` must be accompanied by a type test that would fail if
the change widened the inferred type to `any` or `never`.

**Pitfall:** `toMatchTypeOf` accepts subtypes; `toEqualTypeOf` requires exact equality.
Default to `toEqualTypeOf` unless a subtype check is the intent.

---

## 3. Example-Based Tests (Unit & Integration)

### Naming and grouping

- Test names state business outcomes: `'trailing slash in URL matches route defined
  with trailing slash'`, not `'matchSegments case 3'`.
- Group by feature boundary, not by file. If a feature spans two files, prefer a single
  test file at the higher-level boundary.

### Table-driven format with `it.each`

When ≥ 3 tests share an identical assertion shape with varying data, use `it.each` to
keep the data visible and eliminate boilerplate:

```typescript
it.each([
  ['single literal',  'users/',    [{ kind: 'lit', value: 'users' }]],
  ['string param',    ':id/',      [{ kind: 'str', name: 'id' }]],
  ['number param',    '#id/',      [{ kind: 'num', name: 'id' }]],
  ['optional string', ':id?/',     [{ kind: 'opt-str', name: 'id' }]],
  ['wildcard',        '*rest/',    [{ kind: 'wildcard', name: 'rest' }]],
] satisfies [string, string, Segment[]][])(
  '%s',
  (_, input, expected) => expect(parseSegments(input)).toEqual(expected),
);
```

The `satisfies` annotation keeps the type checker honest without losing row inference.

### Test fixture infrastructure

Building `RouteNode` trees inline is boilerplate that obscures test intent. A
`src/test-utils/fixtures.ts` module (not exported from `src/index.ts`) owns canonical
tree shapes shared across test files:

```typescript
export const routeFixtures = {
  userTree: () => defineRoutes([
    route(z.object({ tag: z.literal('users') }), 'users/', [
      route(z.object({ tag: z.literal('user'), id: z.string() }), ':id/', [
        route(z.object({ tag: z.literal('settings') }), 'settings/'),
      ]),
    ]),
  ]),
};
```

Tests call `routeFixtures.userTree()` rather than reconstructing the tree. Fixture
files become the single source of truth.

---

## 4. Diagnostic Tests — Inline Snapshots

`ParseDiag`, server error bodies, and OpenAPI output are structured data that must not
silently drift. Snapshot them **inline** with `toMatchInlineSnapshot`:

```typescript
it('returns diagnostic for no matching route', () => {
  const result = router.parse(new URL('https://h/unknown'));
  expect(result.isErr() && result.getErr()).toMatchInlineSnapshot(`
    {
      "kind": "no-match",
      "path": "/unknown",
    }
  `);
});
```

**Rules:**

- **Inline over external.** External `.snap` files are opaque to PR review; inline keeps
  the assertion next to the test.
- **Snapshots ≤ 30 lines.** Longer means the test covers too much — split it.
- **Snapshot structure, not prose.** Error messages can be reworded; structural shape is
  the contract. Never snapshot a full stack trace.
- **Never snapshot dynamic data** — no timestamps, UUIDs, random IDs.
- Update snapshots deliberately (`pnpm test -u`) after intentional structural changes.

---

## 5. Property-Based Tests (PBT)

Use `fast-check` for invariants that hold across a large input space. It lives as a
`devDependency` of `@arbor/router` for testing the framework's own core. The user-facing
`createRouteTests` API (Plan 79 / `@arbor/router-test`) is a separate concern.

### Invariant taxonomy

**Round-trip:**

- `parse(print(route)) === route` — any route that prints must parse back unchanged
- `print` on any valid route must produce a URL that `parse` accepts

**Never-throw:**

- `parseSegments(anyString)` never throws — it always returns a valid segment array
- `walkParse(anyURL, anyTree)` never throws — it returns a match or a clean `ParseDiag`
- `validateInput(schema, anyInput)` never throws — Zod errors are wrapped, never raised

**Structural:**

- Every tagged node in a tree has a unique path from root
- `forEachTaggedNode` visits exactly the number of tagged schemas in the tree

**Boundary:**

- A `#num` path segment with a non-integer string always fails parse cleanly
- An optional segment after a required one is rejected at definition time (Plan 69)

### PBT test shape

```typescript
import fc from 'fast-check';

it('walkParse never throws on arbitrary URLs', () => {
  fc.assert(
    fc.property(fc.webPath(), (path) => {
      const url = new URL(`https://example.com${path}`);
      expect(() => router.parse(url)).not.toThrow();
    }),
    { numRuns: 500 },
  );
});

it('print/parse round-trip', () => {
  fc.assert(
    fc.property(validRouteArb(router), (route) => {
      const url = new URL(`https://h${router.print(route)}`);
      expect(router.parse(url).getOrThrow()).toEqual(route);
    }),
  );
});
```

---

## 6. Integration Tests via `createTestClient`

Once Plan 72 (`createTestClient`) lands, every test that exercises a full
request → dispatch → response cycle should use it instead of manually wiring
`createServer` + `createClient`. It is the integration tier.

**Use `createTestClient` when:**

- Testing guard/middleware behavior end-to-end (auth, rate-limit, CORS)
- Verifying the response type the client receives matches what the handler declares
- Checking error paths (400, 403, 404, 405, 500) from the *caller's* perspective

**Do not use** it for unit-testing internal helper functions (`validateInput`,
`resolveHandler`) — those stay as direct unit tests against the exported primitives.

---

## 7. Adversarial / Edge-Case Testing

The system must never crash on malformed input — it must degrade to a clean error
response. Cover these cases in `edge-cases.test.ts` with example-based tests (not PBT)
because the interesting cases are discrete and known:

- Empty string URL path (`''`, `'/'`)

- URL paths with percent-encoded characters (`%2F`, `%00`)
- Deeply nested route trees (depth ≥ 14, near the `FlattenChildrenImpl` depth cap)
- Route schemas with `z.never()` fields
- Query strings with arbitrary special characters — parser treats them as opaque

These are not fuzz tests; they are specific regression guards for known fragile zones.

---

## 8. Testing Principles

- **Triangulation:** Triangulate truth from multiple angles. Examples show *intent*,
  properties reveal *invariants*, snapshots capture *structure*, integration proves
  *cohesion*.
- **Justification (inline):** Every test file must begin with a 1-sentence comment
  stating why that testing strategy was chosen for this file.
- **Minimal but expressive:** Prefer the smallest set of tests that fully bounds the
  system's behavior. Strip away redundant assertions.
- **Deterministic execution:** Zero tolerance for flakiness. Rewrite or delete tests
  that fail intermittently due to ordering or timing.
- **No cast-and-hope:** A test that uses `as any` to satisfy the type checker is not
  testing anything at the type level.
- **Tests are production code.** Apply the same standards: no duplication, clear naming,
  no commented-out assertions left behind.
