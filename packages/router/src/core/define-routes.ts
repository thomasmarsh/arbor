import { Result } from '@arbor/common';
import type z from 'zod';
import type { ChildUnion, CtxMap, ExtractPathParams, RouteNode } from './route-node.js';
import type { AnyCtxMap, RouterContract } from './router-contract.js';
import { parseSegments } from './segments.js';
import { type ParseDiag, type WalkNode, buildUrl, getTag, indexNodes, walkParseIndexed, walkPrint } from './walk.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- BuildableRouteNode/buildable use any for structural RouteNode variance */
export type BuildableRouteNode<N extends RouteNode<any, any, any, any, any, any>> = N & {
  use<R extends RouteNode<any, any, any, any, any, any>>(
    guard: (node: N) => R,
  ): BuildableRouteNode<R>;
  pipe<R extends RouteNode<any, any, any, any, any, any>>(
    combinator: (node: N) => R,
  ): BuildableRouteNode<R>;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RouteNode type params require any for structural variance
export function buildable<N extends RouteNode<any, any, any, any, any, any>>(
  node: N,
): BuildableRouteNode<N> {
  return Object.assign(node, {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any -- return type unknown; caller provides the type
    use: (guard: (n: N) => any) => buildable(guard(node)),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any -- return type unknown; caller provides the type
    pipe: (fn: (n: N) => any) => buildable(fn(node)),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RouteNode type params require any for structural variance
type CollectChildSectionParams<C extends RouteNode<unknown, any, any, any, any, any>[]> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RouteNode type params require any for structural variance
  [K in keyof C]: C[K] extends RouteNode<any, any, any, infer SP, any, any> ? SP : never;
}[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RouteNode type params require any for structural variance
type AllSectionParams<C extends RouteNode<unknown, any, any, any, any, any>[]> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RouteNode type params require any for structural variance
  [K in keyof C]: C[K] extends RouteNode<any, any, any, infer SP, any, any> ? SP : never;
}[number];

export {
  type ChildUnion,
  type CtxMap,
  type Derive,
  type ExtractPathParams,
  type Flatten,
  type InferContext,
  type InferRoute,
  type ResponseUnion,
  type RouteNode,
} from './route-node.js';

export type { ParseDiag } from './walk.js';

export function route<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- z.ZodObject/RouteNode require any for Zod/variance
  S extends z.ZodObject<any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RouteNode type params require any for structural variance
  C extends RouteNode<unknown, any, any, any, any, any>[] = [],
>(schema: S, path: string, children?: [...C]): BuildableRouteNode<RouteNode<z.infer<S>, [...C]>> {
  return buildable({
    _type: undefined as never,

    schema,
    path,
    segments: parseSegments(path),
    children: (children ?? []) as [...C],
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RouteNode type params require any for structural variance
export function section<Path extends string, C extends RouteNode<unknown, any, any, any, any, any>[]>(
  path: Path,
  children: [...C],
): BuildableRouteNode<RouteNode<never, [...C], never, ExtractPathParams<Path> | CollectChildSectionParams<C>>>;
/* eslint-disable @typescript-eslint/no-explicit-any -- RouterContract/RouteNode type params require any for covariant children */
export function section<Path extends string, R extends { tag: string }, Map extends AnyCtxMap>(
  path: Path,
  router: RouterContract<R, Map>,
): BuildableRouteNode<
  RouteNode<never, RouteNode<unknown, any, any, any, any, any>[], never, ExtractPathParams<Path>, Record<string, unknown>, Map>
>;
/* eslint-enable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- implementation signature uses any for overload resolution
export function section(path: string, childrenOrRouter: RouteNode<unknown, any, any, any, any, any>[] | RouterContract<any, any>): BuildableRouteNode<RouteNode<any, any, any, any, any, any>> {
  const children = Array.isArray(childrenOrRouter) ? childrenOrRouter : childrenOrRouter.children;
  return buildable({
    _type: undefined as never,

    schema: null,
    path,
    segments: parseSegments(path),
    children,
  });
}

function collectTags(nodes: WalkNode[]): string[] {
  const tags: string[] = [];
  for (const node of nodes) {
    if (node.schema !== null) {
      const tag = getTag(node.schema);
      if (tag) tags.push(tag);
    }
    if (node.children.length > 0) {
      tags.push(...collectTags(node.children as WalkNode[]));
    }
  }
  return tags;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RouteNode type params require any for structural variance
export function defineRoutes<C extends RouteNode<unknown, any, any, any, any, any>[] = []>(
  children: [...C],
) {
  type Route = ChildUnion<C>;
  type SP = AllSectionParams<[...C]>;

  const nodes = children as WalkNode[];
  const indexedNodes = indexNodes(nodes);

  const tags = collectTags(nodes);
  const seen = new Set<string>();
  for (const tag of tags) {
    if (seen.has(tag)) throw new Error(`duplicate route tag: "${tag}"`);
    seen.add(tag);
  }

  return {
    _type: undefined as never as Route,
    _ctxMap: undefined as never as CtxMap<[...C]>,
    children,

    parse(url: URL): Result<Route, string> {
      let segments: string[];
      try {
        segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      } catch {
        return Result.err(`invalid URL encoding: ${url.pathname}`);
      }
      const raw = walkParseIndexed(indexedNodes, segments, url.searchParams);
      if (!raw) return Result.err(`no route: ${url.pathname}`);
      return Result.ok(raw) as Result<Route, string>;
    },

    parseDiagnostics(url: URL): { result: Result<Route, string>; diagnostics: ParseDiag[] } {
      let segs: string[];
      try {
        segs = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      } catch {
        return { result: Result.err(`invalid URL encoding: ${url.pathname}`), diagnostics: [] };
      }
      const diag: ParseDiag[] = [];
      const raw = walkParseIndexed(indexedNodes, segs, url.searchParams, {}, diag);
      if (!raw) return { result: Result.err(`no route: ${url.pathname}`), diagnostics: diag };
      return { result: Result.ok(raw) as Result<Route, string>, diagnostics: diag };
    },

    print(
      route: Route,
      ...args: [SP] extends [never]
        ? [sectionParams?: Record<string, string | number>]
        : [sectionParams: Record<SP, string | number>]
    ): string {
      const sectionParams = args[0];
      const result = walkPrint(nodes, route, {
        segments: [],
        paramNames: new Set(),
      });
      return result ? buildUrl(result, route, sectionParams) : '/';
    },
  };
}
