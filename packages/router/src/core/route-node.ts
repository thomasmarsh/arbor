/* eslint-disable @typescript-eslint/no-explicit-any */

import type z from 'zod';
import type { Segment } from './segments.js';

// Collapses intersection types like `{ tag: 'a' } & { id: string }` into a
// single flat object `{ tag: 'a'; id: string }` for readability in tooling.
export type Flatten<T> = { [K in keyof T]: T[K] };

// Extracts colon-param names from a path string at the type level.
// `:id/` → `"id"`, `:org/:repo/` → `"org" | "repo"`.
// Section params use `#` instead of `:` — both are captured here.
export type ExtractPathParams<Path extends string> =
  Path extends `${string}:${infer Param}/${infer Rest}`
    ? Param | ExtractPathParams<Rest>
    : Path extends `${string}#${infer Param}/${infer Rest}`
      ? Param | ExtractPathParams<Rest>
      : never;

// Runtime context attached by factory helpers (httpRoute, openApiRoute, etc.).
// Kept separate from the phantom R/C type params so domain-specific schemes
// don't bleed into the core RouteNode shape.
export interface RouteCtx {
  method?: string;
  bodySchema?: z.ZodType;
  responseSchemas?: Record<number, z.ZodType>;
  responseHeaderSchemas?: Record<number, z.ZodObject<any, any>>;
  querySchema?: z.ZodObject<any, any>;
  headerSchema?: z.ZodObject<any, any>;
  rateLimit?: { windowMs: number; maxRequests: number };
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

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
//   _ctx          — runtime metadata (method, body/response schemas, etc.).
export interface RouteNode<
  R,
  C extends RouteNode<unknown, any, any, any>[] = [],
  Context = never,
  SectionParams extends string = never,
> {
  _type: R;
  _sectionParams?: SectionParams;
  schema: z.ZodObject<any, any> | null;
  path: string;
  segments: Segment[];
  children: C;
  context?: Context;
  _ctx?: RouteCtx;
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

type FlattenChildrenImpl<
  C extends RouteNode<unknown, any, any, any>[],
  D extends ValidDepth = 14,
> = {
  [K in keyof C]: C[K] extends RouteNode<
    infer R,
    infer GC extends RouteNode<unknown, any, any, any>[],
    any,
    any
  >
    ? IsAny<GC> extends true
      ? // Generic / unconstrained children — return permissive shape, no recursion.
        [R] extends [never]
        ? Flatten<{ child?: unknown }>
        : Flatten<R & { child?: unknown }>
      : // Depth limit reached — treat node as a leaf.
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

// Derives the route-shape type for a single RouteNode.
// Replaces the old two-alias mutual recursion (Derive ↔ ChildUnion) that
// triggered TS2589 even on 3-level trees once _child was removed.
export type Derive<N> =
  N extends RouteNode<unknown, any, any, any> ? FlattenChildrenImpl<[N]>[0] : never;

// Union of derived shapes for all nodes in a children tuple.
export type ChildUnion<C extends RouteNode<unknown, any, any, any>[]> =
  FlattenChildrenImpl<C>[number];

// Maps a status-code record to a discriminated union of `{ status, body }` pairs.
export type ResponseUnion<Resp> = {
  [S in keyof Resp]: { status: S; body: Resp[S] };
}[keyof Resp];

// Builds a map of route tag → Context type for all tagged nodes in C.
// Used by createServer to index handler DI contexts by route tag.
export type CtxMap<C extends RouteNode<unknown, any, any, any>[]> = {
  [N in C[number] as N extends RouteNode<{ tag: infer T extends string }, any, any, any>
    ? T
    : never]: N extends RouteNode<any, any, infer Ctx, any> ? Ctx : never;
};
