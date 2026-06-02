import type z from 'zod';
import type { Segment } from './segments.js';

// Collapses intersection types like `{ tag: 'a' } & { id: string }` into a
// single flat object `{ tag: 'a'; id: string }` for readability in tooling.
export type Flatten<T> = { [K in keyof T]: T[K] };

// Extracts colon-param names from a path string at the type level.
// `:id/` → `"id"`, `:org/:repo/` → `"org" | "repo"`.
// Section params use `#` instead of `:` — both are captured here.
// TODO: incomplete Edge Case Handling: The type correctly identifies segments
// starting with : or #, but it expects them to always end with a / slash. If
// a route terminates on a parameter (e.g., "/user/:id"), it returns never.
export type ExtractPathParams<Path extends string> =
  Path extends `${string}:${infer Param}/${infer Rest}`
    ? Param | ExtractPathParams<Rest>
    : Path extends `${string}#${infer Param}/${infer Rest}`
      ? Param | ExtractPathParams<Rest>
      : never;

export type InferRoute<R extends { _type: unknown }> = R['_type'];

export type InferContext<N extends { context?: unknown }> = N extends { context?: infer C }
  ? C
  : never;

// ─── RouteNode ───────────────────────────────────────────────────────────────

// The core recursive data structure.  Every route (leaf, parent, section) is a
// RouteNode.
//
// Type parameters:
//   R            — phantom: the parsed route shape emitted when this node
//                  matches.  `never` for section nodes (no schema).
//   C            — the concrete children tuple, e.g. `[RouteNode<...>, ...]`.
//                  Defaults to `[]` (leaf).  The child-union type is derived
//                  from C at use-site via FlattenChildrenImpl rather than being
//                  stored as a second phantom — this eliminates the old _child
//                  field (plan 47).
//   Context      — optional DI context type carried by route-factory helpers.
//   SectionParams — union of param names captured by ancestor section paths.
//
// Runtime fields:
//   _type         — phantom, always `undefined as never`; carries R for type
//                   inference only.
//   _sectionParams — phantom, always absent at runtime; carries SectionParams.
//   schema        — null for section nodes; the Zod schema for route nodes.
//   children      — concrete array of child RouteNodes.
//   context       — optional DI bag set by context-aware factory helpers.
//   _meta         — opaque plugin metadata bag (typed by context accessors in contexts/).
export interface RouteNode<
  R,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- children tuple requires any for RouteNode covariance
  C extends RouteNode<unknown, any, any, any, any, any>[] = [],
  Context = never,
  SectionParams extends string = never,
  // TODO: consider an arbitrary object layout restriction to prevent structural
  // collisions with primitives: `Meta extends object = Record<string, unknown>`.
  Meta = Record<string, unknown>,
  // Phantom — carries the precise CtxMap of a RouterContract embedded via
  // section(path, router). `never` for all inline-children section nodes and
  // for route nodes.  The walk algorithm uses children at runtime regardless;
  // this parameter exists solely to give CtxMap precise type information.
  EmbeddedMap = never,
> {
  _type: R;
  _sectionParams?: SectionParams;
  _embeddedMap?: EmbeddedMap; // phantom — undefined as never at runtime
  // TODO: we should decouple from Zod here - task 133 explores a custom schema
  // system that is compatible or interops with zod, but which gives us  a bit
  // more power.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- z.ZodObject requires any for Zod shape param
  schema: z.ZodObject<any, any> | null;
  path: string;
  segments: Segment[];
  children: C;
  context?: Context;
  _meta?: Meta;
}

// ─── Depth-counter machinery ──────────────────────────────────────────────────
//
// FlattenChildrenImpl recurses through the children array to build the derived
// route-shape union.  Without a depth cap, a generic (un-narrowed) C would
// cause TypeScript to attempt infinite expansion and error with TS2589.
//
// The counter works by indexing into the Prev tuple:
//   Prev[14] = 13, Prev[13] = 12, …, Prev[1] = 0, Prev[0] = never
//
// Starting at D = 14, each recursive call passes PrevD<D> as the next depth.
// When D reaches 1 the next call gets D = 0, and PrevD<0> = never.
// The guard `[PrevD<D>] extends [never]` is true only when D = 0, terminating
// recursion by treating the node as a leaf (children ignored).
// This supports up to 15 levels of nesting, which is far beyond any real tree.

type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
type ValidDepth = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
type PrevD<D extends ValidDepth> = Prev[D];

// Standard trick: `0 extends (1 & T)` is true only when T is `any`, because
// `1 & any = any` and `0 extends any` is true, while `1 & concrete = 1` and
// `0 extends 1` is false.  Used to short-circuit recursion on `any` children
// (which occur when RouteNode is used with a generic/unconstrained C, e.g. in
// ReturnType<typeof defineRoutes>).
type IsAny<T> = 0 extends 1 & T ? true : false;

// ─── FlattenChildrenImpl ──────────────────────────────────────────────────────
//
// Maps a tuple of RouteNodes to a same-length tuple of derived route shapes,
// then exposed via [number] indexing to get the union.
//
// For each node N in C:
//
//   IsAny<GC>  — GC is the inferred children array of N.  When it is `any`
//                (generic context, no specific children known) we return a
//                permissive shape with `child?: unknown` instead of recursing,
//                preventing infinite expansion.
//
//   [PrevD<D>] extends [never]  — depth limit reached (D = 0).  Treat N as a
//                leaf; section nodes (R = never) become never in the union.
//
//   [R] extends [never]  — N is a section node: no schema, contributes a
//                required `{ child: <union of children shapes> }` wrapper.
//
//   [FlattenChildrenImpl<GC, PrevD<D>>[number]] extends [never]  — N is a
//                route node with no children (leaf); emit just Flatten<R>.
//
//   Otherwise   — N is a route node with children; emit
//                 Flatten<R & { child?: <union of children shapes> }>.
//
// Using `[]` brackets on both sides of `extends` (e.g. `[R] extends [never]`)
// suppresses distributivity over unions, giving exact equality checks.

/* eslint-disable @typescript-eslint/no-explicit-any -- FlattenChildrenImpl uses any for structural RouteNode variance */
type FlattenChildrenImpl<
  C extends RouteNode<unknown, any, any, any, any, any>[],
  D extends ValidDepth = 14,
> = {
  [K in keyof C]: C[K] extends RouteNode<
    infer R,
    infer GC extends RouteNode<unknown, any, any, any, any, any>[],
    any,
    any,
    any,
    any
  >
    ? IsAny<GC> extends true
      ? // Generic / unconstrained children — return permissive shape, no recursion.
        [R] extends [never]
        ? Flatten<{ child?: unknown }>
        : Flatten<R & { child?: unknown }>
      : // Depth limit reached — treat node as a leaf.
        // TODO: If a tree hits exactly 15 levels of depth, PrevD<0> returns never.
        // The check captures it accurately, but ensures any elements deeper than the
        // ceiling are entirely omitted rather than gracefully degraded. Given the
        // benchmark memo indicating a maximum operational depth of 4, this structural
        // floor will not be breached under expected parameters.
        [PrevD<D>] extends [never]
        ? [R] extends [never]
          ? never
          : Flatten<R>
        : // Section node (no schema) — required child wrapper.
          [R] extends [never]
          ? Flatten<{ child: FlattenChildrenImpl<GC, PrevD<D>>[number] }>
          : // Route node with no children — leaf.
            [FlattenChildrenImpl<GC, PrevD<D>>[number]] extends [never]
            ? Flatten<R>
            : // Route node with children — optional child field.
              Flatten<R & { child?: FlattenChildrenImpl<GC, PrevD<D>>[number] }>
    : never;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// Derives the route-shape type for a single RouteNode.
// Replaces the old two-alias mutual recursion (Derive ↔ ChildUnion) that
// triggered TS2589 even on 3-level trees once _child was removed.
export type Derive<N> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RouteNode type params require any for structural variance
  N extends RouteNode<unknown, any, any, any, any, any> ? FlattenChildrenImpl<[N]>[0] : never;

// Union of derived shapes for all nodes in a children tuple.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RouteNode type params require any for structural variance
export type ChildUnion<C extends RouteNode<unknown, any, any, any, any, any>[]> =
  FlattenChildrenImpl<C>[number];

// Maps a status-code record to a discriminated union of `{ status, body }` pairs.
// TODO: this is deprecated and shouldn't be here. Replace with HttpResponse?
export type ResponseUnion<Resp> = {
  [S in keyof Resp]: { status: S; body: Resp[S] };
}[keyof Resp];

// Standard contravariant trick for converting a union to an intersection.
// UnionToIntersection<A | B> = A & B.
// UnionToIntersection<never> = never (used defensively — CtxMap always seeds {} via Record<never, never>).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- distributive conditional requires any
type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

// Reads the EmbeddedMap phantom field from a (possibly BuildableRouteNode-wrapped) node
// via direct field access, which works on intersection types. Returns `never` when the
// field is absent or `undefined` (i.e. the node was created with inline children, not a
// RouterContract).  The IsAny guard avoids spurious `any` propagation from generic nodes.
/* eslint-disable @typescript-eslint/no-explicit-any -- CtxMap types use any for structural RouteNode variance */
type GetEmbeddedMap<N extends RouteNode<unknown, any, any, any, any, any>> =
  IsAny<N['_embeddedMap']> extends true
    ? never
    : [Exclude<N['_embeddedMap'], undefined>] extends [never]
      ? never
      : Exclude<N['_embeddedMap'], undefined>;

// Builds a map of route tag → Context type for a single RouteNode, recursing
// through section nodes.  Three cases:
//   - section with EmbeddedMap (from section(path, router)): return EmbeddedMap directly.
//   - section with inline children (EmbeddedMap = never): recurse into children via CtxMapDeep.
//   - tagged route node: return Record<tag, Context>.
type CtxMapEntry<N extends RouteNode<unknown, any, any, any, any, any>, D extends ValidDepth> =
  [PrevD<D>] extends [never] ? Record<never, never> :
  [GetEmbeddedMap<N>] extends [never]
    ? N extends RouteNode<infer R, infer GC extends RouteNode<unknown, any, any, any, any, any>[], infer Ctx, any, any, any>
      ? [R] extends [never]
        ? IsAny<GC> extends true ? Record<never, never> : CtxMapDeep<GC, PrevD<D>>
        : [R] extends [{ tag: infer T extends string }]
          ? Record<T, Ctx>
          : Record<never, never>
      : Record<never, never>
    : GetEmbeddedMap<N>;

// Recursively builds the merged tag → Context map for a children array.
// Seeds the union with Record<never, never> (i.e. {}) so the result is never
// `never` even for an empty route tree.
type CtxMapDeep<C extends RouteNode<unknown, any, any, any, any, any>[], D extends ValidDepth> =
  UnionToIntersection<
    | Record<never, never>
    | {
        [K in keyof C]: C[K] extends RouteNode<unknown, any, any, any, any, any>
          ? CtxMapEntry<C[K], D>
          : Record<never, never>;
      }[number]
  >;
/* eslint-enable @typescript-eslint/no-explicit-any */

// Builds a map of route tag → Context type for all tagged nodes in C,
// recursing through section nodes so that deeply-nested routes are visible
// to createServer's handler map.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RouteNode type params require any for structural variance
export type CtxMap<C extends RouteNode<unknown, any, any, any, any, any>[]> = CtxMapDeep<C, 14>;
