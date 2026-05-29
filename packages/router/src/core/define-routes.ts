/* eslint-disable @typescript-eslint/no-explicit-any */

import { Result } from '@arbor/common';
import type z from 'zod';
import { getHttpCtx } from '../contexts/http-context.js';
import type { ChildUnion, CtxMap, ExtractPathParams, RouteNode } from './route-node.js';
import { parseSegments } from './segments.js';
import { type ParseDiag, type WalkNode, buildUrl, getTag, walkParse, walkPrint } from './walk.js';

type CollectChildSectionParams<C extends RouteNode<unknown, any, any, any>[]> = {
  [K in keyof C]: C[K] extends RouteNode<any, any, any, infer SP> ? SP : never;
}[number];

type AllSectionParams<C extends RouteNode<unknown, any, any, any>[]> = {
  [K in keyof C]: C[K] extends RouteNode<any, any, any, infer SP> ? SP : never;
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
  S extends z.ZodObject<any, any>,
  C extends RouteNode<unknown, any, any, any>[] = [],
>(
  schema: S,
  path: string,
  children?: [...C],
): RouteNode<z.infer<S>, [...C]> {
  return {
    _type: undefined as never,

    schema,
    path,
    segments: parseSegments(path),
    children: (children ?? []) as [...C],
  };
}

export function section<
  Path extends string,
  C extends RouteNode<unknown, any, any, any>[],
>(
  path: Path,
  children: [...C],
): RouteNode<never, [...C], never, ExtractPathParams<Path> | CollectChildSectionParams<C>> {
  return {
    _type: undefined as never,

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

function collectMethods(nodes: WalkNode[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const node of nodes) {
    const httpCtx = getHttpCtx(node);
    if (node.schema !== null && httpCtx?.method) {
      const tag = getTag(node.schema);
      if (tag) map[tag] = httpCtx.method;
    }
    if (node.children.length > 0) {
      Object.assign(map, collectMethods(node.children as WalkNode[]));
    }
  }
  return map;
}

function collectBodySchemas(nodes: WalkNode[]): Record<string, z.ZodType> {
  const map: Record<string, z.ZodType> = {};
  for (const node of nodes) {
    const httpCtx = getHttpCtx(node);
    if (node.schema !== null && httpCtx?.bodySchema) {
      const tag = getTag(node.schema);
      if (tag) map[tag] = httpCtx.bodySchema;
    }
    if (node.children.length > 0) {
      Object.assign(map, collectBodySchemas(node.children as WalkNode[]));
    }
  }
  return map;
}

function collectRequestHeaderSchemas(nodes: WalkNode[]): Record<string, z.ZodObject<any, any>> {
  const map: Record<string, z.ZodObject<any, any>> = {};
  for (const node of nodes) {
    const httpCtx = getHttpCtx(node);
    if (node.schema !== null && httpCtx?.headerSchema) {
      const tag = getTag(node.schema);
      if (tag) map[tag] = httpCtx.headerSchema;
    }
    if (node.children.length > 0) {
      Object.assign(map, collectRequestHeaderSchemas(node.children as WalkNode[]));
    }
  }
  return map;
}

function collectResponseHeaderSchemas(
  nodes: WalkNode[],
): Record<string, Record<number, z.ZodObject<any, any>>> {
  const map: Record<string, Record<number, z.ZodObject<any, any>>> = {};
  for (const node of nodes) {
    const httpCtx = getHttpCtx(node);
    if (node.schema !== null && httpCtx?.responseHeaderSchemas) {
      const tag = getTag(node.schema);
      if (tag) map[tag] = httpCtx.responseHeaderSchemas;
    }
    if (node.children.length > 0) {
      Object.assign(map, collectResponseHeaderSchemas(node.children as WalkNode[]));
    }
  }
  return map;
}

function collectRateLimits(
  nodes: WalkNode[],
): Record<string, { windowMs: number; maxRequests: number }> {
  const map: Record<string, { windowMs: number; maxRequests: number }> = {};
  for (const node of nodes) {
    const httpCtx = getHttpCtx(node);
    if (node.schema !== null && httpCtx?.rateLimit) {
      const tag = getTag(node.schema);
      if (tag) map[tag] = httpCtx.rateLimit;
    }
    if (node.children.length > 0) {
      Object.assign(map, collectRateLimits(node.children as WalkNode[]));
    }
  }
  return map;
}

export function defineRoutes<C extends RouteNode<unknown, any, any, any>[] = []>(
  children: [...C],
) {
  type Route = ChildUnion<C>;
  type SP = AllSectionParams<[...C]>;

  const nodes = children as WalkNode[];

  const tags = collectTags(nodes);
  const seen = new Set<string>();
  for (const tag of tags) {
    if (seen.has(tag)) throw new Error(`duplicate route tag: "${tag}"`);
    seen.add(tag);
  }

  const methodMap = collectMethods(nodes);
  const bodySchemaMap = collectBodySchemas(nodes);
  const responseHeaderSchemaMap = collectResponseHeaderSchemas(nodes);
  const headerSchemaMap = collectRequestHeaderSchemas(nodes);
  const rateLimitMap = collectRateLimits(nodes);

  return {
    _type: undefined as never as Route,
    _ctxMap: undefined as never as CtxMap<[...C]>,
    children,
    methodMap,
    bodySchemaMap,
    responseHeaderSchemaMap,
    headerSchemaMap,
    rateLimitMap,

    parse(url: URL): Result<Route, string> {
      let segments: string[];
      try {
        segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      } catch {
        return Result.failure(`invalid URL encoding: ${url.pathname}`);
      }
      const raw = walkParse(nodes, segments, url.searchParams);
      if (!raw) return Result.failure(`no route: ${url.pathname}`);
      return Result.success(raw) as Result<Route, string>;
    },

    parseDiagnostics(url: URL): { result: Result<Route, string>; diagnostics: ParseDiag[] } {
      let segs: string[];
      try {
        segs = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      } catch {
        return { result: Result.failure(`invalid URL encoding: ${url.pathname}`), diagnostics: [] };
      }
      const diag: ParseDiag[] = [];
      const raw = walkParse(nodes, segs, url.searchParams, {}, diag);
      if (!raw) return { result: Result.failure(`no route: ${url.pathname}`), diagnostics: diag };
      return { result: Result.success(raw) as Result<Route, string>, diagnostics: diag };
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
