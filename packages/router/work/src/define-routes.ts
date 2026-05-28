/* eslint-disable @typescript-eslint/no-explicit-any */

import { Result } from '@arbor/common';
import type z from 'zod';
import type { ChildUnion, CtxMap, RouteNode } from './route-node.js';
import { buildUrl, walkParse, walkPrint } from './walk.js';

export {
  type ChildUnion,
  type CtxMap,
  type Derive,
  type Flatten,
  type InferContext,
  type InferRoute,
  type RouteNode,
} from './route-node.js';
export { matchSegments, parseSegments, type Segment } from './segments.js';
export { buildUrl, walkParse, walkPrint } from './walk.js';

export function route<
  S extends z.ZodObject<any, any>,
  C extends RouteNode<unknown, unknown, any, any>[] = [],
>(
  schema: S,
  path: string,
  children?: [...C],
): RouteNode<z.infer<S>, [ChildUnion<C>] extends [never] ? never : ChildUnion<C>, [...C]> {
  return {
    _type: undefined as never,
    _child: undefined as never,
    _context: undefined as never,
    schema,
    path,
    children: (children ?? []) as [...C],
  };
}

export function section<C extends RouteNode<unknown, unknown, any, any>[]>(
  path: string,
  children: [...C],
): RouteNode<never, ChildUnion<C>, [...C]> {
  return {
    _type: undefined as never,
    _child: undefined as never,
    _context: undefined as never,
    schema: null,
    path,
    children,
  };
}

export function defineRoutes<C extends RouteNode<unknown, unknown, any, any>[] = []>(
  children: [...C],
) {
  type Route = ChildUnion<C>;

  const nodes = children as RouteNode<
    unknown,
    unknown,
    RouteNode<unknown, unknown, any, any>[],
    any
  >[];

  return {
    _type: undefined as never as Route,
    _ctxMap: undefined as never as CtxMap<[...C]>,
    children,

    parse(url: URL): Result<Route, string> {
      const segments = url.pathname.split('/').filter(Boolean);
      const raw = walkParse(nodes, segments, url.searchParams);
      if (!raw) return Result.failure(`no route: ${url.pathname}`);
      return Result.success(raw) as Result<Route, string>;
    },

    print(route: Route): string {
      const result = walkPrint(nodes, route, {
        segments: [],
        paramNames: new Set(),
      });
      return result ? buildUrl(result, route) : '/';
    },
  };
}
