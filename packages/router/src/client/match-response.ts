// # TypeScript design notes for `matchResponse`
//
// ## Why `H extends ExhaustiveConstraint<R>` instead of a typed index signature
//
// Our first instinct was to add a numeric index signature to allow extra handler
// keys without triggering excess-property errors:
//
//   type ExhaustiveHandlers<R, Ret> =
//     { [S in R['status']]: (body: ...) => Ret } & Record<number, (body: ???) => Ret>
//
// Two variants were tried for the index-signature body type, both broken:
//
//   Record<number, (body: never) => Ret>
//     TypeScript INTERSECTS index-signature types with specific-key types.
//     The intersection of `(body: T) → R` and `(body: never) → R` computes the
//     callable parameter as T ∩ never = never.  Every handler lambda ends up
//     with `body: never`, blocking any property access.
//
//   Record<number, (body: unknown) → Ret>
//     The parameter of the intersection is T ∩ unknown = T (correct), but
//     TypeScript's function-subtyping rules (strictFunctionTypes, contravariance)
//     make `(body: { id: number }) => string` NOT assignable to
//     `(body: unknown) => unknown`, because `unknown` is not a subtype of
//     `{ id: number }`.  So the user's specific handlers fail the index check.
//
// Solution: use a **generic constraint** `H extends ExhaustiveConstraint<R>`.
// TypeScript does NOT apply excess-property checking to generic `extends`
// constraints — only to fresh object literals checked against a concrete type.
// Extra handler keys (e.g., a 500 handler on a 200|404 route) pass silently.
// Missing required keys (e.g., no 404 handler) still produce a type error.
//
// ## Why `R = Res` must not be narrowed (and what breaks when it is)
//
// TypeScript performs assignment narrowing on `const` declarations:
//
//   const ok: Res = { status: 200, body: { id: 1 } }
//                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//   TypeScript narrows `ok` to `{ status: 200; body: { id: number } }` here,
//   even though the declared type is the full union `Res`.
//
// When `ok` is passed to a generic function, TypeScript infers
// `R = { status: 200; body: { id: number } }` (the narrowed type), not `Res`.
// With that narrowed `R`, `ExhaustiveConstraint<R>` only requires key `200`.
// The `404` handler then has no constraint source, so body is inferred `any`.
//
// Fix (in tests / real call sites): obtain the response from a function whose
// return type annotation is the full union, e.g. `await client.fetch(route)` or
// a helper `function makeOk(): Res { ... }`.  A function's declared return type
// is used verbatim — TypeScript cannot narrow through a call boundary.
//
// ## Why the return type uses `H[Extract<keyof H, R['status']>] extends (...args: never[]) => infer Ret`
//
// We capture per-handler return types by using a second generic `H` (the actual
// handler map) rather than a single `Ret` shared across all handlers.  A single
// `Ret` causes TypeScript to lock onto the first handler's return type (e.g. `1`)
// and then reject the second handler's different type (e.g. `"two"`).
//
// `H[Extract<keyof H, R['status']>]` indexes `H` by the response's status codes,
// yielding a union of the individual handler function types.  TypeScript
// distributes the conditional `extends (...args: never[]) => infer Ret` over
// that union, inferring `Ret` per member and then unioning the results:
//   H[200] → 1,  H[404] → "two"  →  return type 1 | "two"
//
// `(...args: never[]) → infer Ret` is the widest function shape: because `never`
// is a bottom type, every function `(x: T) => R` is assignable to it
// (contravariance: `never extends T` always holds).  This avoids `any` in the
// source while still matching all user-supplied handlers.
//
// ## Overload order and catch-all contextual typing
//
// TypeScript uses the FIRST overload for contextual typing of lambda parameters.
// If the exhaustive overload (overload 1) fails during resolution, TypeScript
// attempts the catch-all overload, but lambda parameter types inferred under
// the failed overload 1 attempt may have been set to `any` and are not
// re-derived in all cases.
//
// Consequence: in catch-all calls (`{ 200: f, _: g }`) do not reference `body`
// in the partial handler `f` if you rely on implicit body-type inference —
// TypeScript may not contextually type it correctly after overload 1 falls
// through.  The exhaustive overload reliably infers body types; the dedicated
// `infers body types for each status` test exercises that path.

type ExhaustiveConstraint<R extends { status: number; body: unknown }> = {
  [S in R['status']]: (body: Extract<R, { status: S }>['body']) => unknown;
};

type CatchAllConstraint<R extends { status: number; body: unknown }> = Partial<{
  [S in R['status']]: (body: Extract<R, { status: S }>['body']) => unknown;
}> & { _: (response: R) => unknown };

export type MatchHandlers<R extends { status: number; body: unknown }> =
  | ExhaustiveConstraint<R>
  | CatchAllConstraint<R>;

// Exhaustive overload: every status code must have a handler.
// Generic H captures per-handler return types so the result is their union.
export function matchResponse<
  R extends { status: number; body: unknown },
  H extends ExhaustiveConstraint<R>,
>(
  response: R,
  handlers: H,
): H[Extract<keyof H, R['status']>] extends (...args: never[]) => infer Ret ? Ret : never;
// Catch-all overload: a _ fallback covers any unhandled status codes.
export function matchResponse<R extends { status: number; body: unknown }>(
  response: R,
  handlers: CatchAllConstraint<R>,
): unknown;
export function matchResponse(
  response: { status: number; body: unknown },
  handlers: Record<number, ((body: unknown) => unknown) | undefined> & {
    _?: (response: unknown) => unknown;
  },
): unknown {
  const specific = handlers[response.status];
  if (specific !== undefined) return specific(response.body);
  const fallback = handlers._;
  if (fallback !== undefined) return fallback(response);
  return undefined;
}
