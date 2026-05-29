/* eslint-disable @typescript-eslint/no-explicit-any */

import { Result } from '@arbor/common';
import type z from 'zod';
import type { HttpContext, HttpResponseUnion } from '../contexts/http-context.js';
import { getHttpMeta } from '../contexts/http-context.js';
import type { RouteNode } from '../core/route-node.js';
import { getTag, type WalkNode } from '../core/walk.js';

interface NoOpts {
  body?: never;
  headers?: never;
}

type RequestOpts<Ctx extends HttpContext<any, any, any, any, any>> =
  [Ctx['body']] extends [never]
    ? [Ctx['headers']] extends [never]
      ? NoOpts
      : { headers: Ctx['headers'] }
    : [Ctx['headers']] extends [never]
      ? { body: Ctx['body'] }
      : { body: Ctx['body']; headers?: Ctx['headers'] };

export type FetchLike = (
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  status: number;
  json(): Promise<unknown>;
}>;

interface RouterArg<Route> {
  _type: Route;
  _ctxMap: Record<string, HttpContext<any, any, any, any, any>>;
  print(route: Route): string;
  children: RouteNode<unknown, any, any, any, any>[];
}

export interface TypedClient<
  Route extends { tag: string },
  Map extends Record<string, HttpContext<any, any, any, any, any>>,
  Validate extends boolean = false,
> {
  fetch<Tag extends keyof Map & string>(
    route: Extract<Route, { tag: Tag }>,
    opts?: RequestOpts<Map[Tag]>,
  ): Promise<
    Validate extends true
      ? Result<HttpResponseUnion<Map[Tag]['response']>, z.ZodError>
      : HttpResponseUnion<Map[Tag]['response']>
  >;
}

function buildMethodMap(nodes: WalkNode[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const node of nodes) {
    const httpCtx = getHttpMeta(node);
    if (node.schema !== null && httpCtx?.method) {
      const tag = getTag(node.schema);
      if (tag) map[tag] = httpCtx.method;
    }
    if (node.children.length > 0) {
      Object.assign(map, buildMethodMap(node.children as WalkNode[]));
    }
  }
  return map;
}

function buildResponseSchemaMap(nodes: WalkNode[]): Record<string, Record<number, z.ZodType>> {
  const map: Record<string, Record<number, z.ZodType>> = {};
  for (const node of nodes) {
    const httpCtx = getHttpMeta(node);
    if (node.schema !== null && httpCtx?.responseSchemas) {
      const tag = getTag(node.schema);
      if (tag) map[tag] = httpCtx.responseSchemas;
    }
    if (node.children.length > 0) {
      Object.assign(map, buildResponseSchemaMap(node.children as WalkNode[]));
    }
  }
  return map;
}

export function createClient<
  Route extends { tag: string },
  Map extends Record<string, HttpContext<any, any, any, any, any>>,
  Validate extends boolean = false,
>(
  baseUrl: string,
  router: RouterArg<Route> & { _ctxMap: Map },
  options?: { fetch?: FetchLike; validate?: Validate },
): TypedClient<Route, Map, Validate> {
  const methodMap = buildMethodMap(router.children as WalkNode[]);
  const responseSchemaMap = buildResponseSchemaMap(router.children as WalkNode[]);
  const fetchFn: FetchLike = options?.fetch ?? globalThis.fetch;
  const validate = options?.validate ?? false;

  // Cast needed: TypeScript cannot assign a concrete union to an unresolved conditional type.
  return {
    async fetch<Tag extends keyof Map & string>(
      route: Extract<Route, { tag: Tag }>,
      opts?: RequestOpts<Map[Tag]>,
    ): Promise<any> {
      const tag = route.tag;
      const method = methodMap[tag] ?? 'GET';
      const path = router.print(route);
      const url = `${baseUrl.replace(/\/$/, '')}${path}`;

      const optsRaw = opts as { body?: unknown; headers?: Record<string, string> } | undefined;
      const body = optsRaw?.body;
      const requestHeaders = optsRaw?.headers;

      const headers: Record<string, string> = {};
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      if (requestHeaders) {
        Object.assign(headers, requestHeaders);
      }

      const init: { method: string; headers?: Record<string, string>; body?: string } = { method };
      if (Object.keys(headers).length > 0) init.headers = headers;
      if (body !== undefined) init.body = JSON.stringify(body);

      const response = await fetchFn(url, init);
      const responseBody = await response.json();
      const responseObj = { status: response.status, body: responseBody } as HttpResponseUnion<Map[Tag]['response']>;

      if (validate) {
        const schema = responseSchemaMap[tag]?.[response.status];
        if (schema) {
          const parsed = schema.safeParse(responseBody);
          if (!parsed.success) {
            return Result.failure(parsed.error);
          }
        }
        return Result.success(responseObj);
      }

      return responseObj;
    },
  };
}
