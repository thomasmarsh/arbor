/* eslint-disable @typescript-eslint/no-explicit-any */

import { Result } from '@arbor/common';
import type z from 'zod';
import type { ChildUnion, CtxMap, RouteNode } from './route-node.js';
import { parseSegments } from './segments.js';
import { type WalkNode, buildUrl, getTag, walkParse, walkPrint } from './walk.js';

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

    schema,
    path,
    segments: parseSegments(path),
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

    schema: null,
    path,
    segments: parseSegments(path),
    children,
  };
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

export function defineRoutes<C extends RouteNode<unknown, unknown, any, any>[] = []>(
  children: [...C],
) {
  type Route = ChildUnion<C>;

  const nodes = children as WalkNode[];

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
