/* eslint-disable @typescript-eslint/no-explicit-any */

import type { HttpContext } from './http-context.js';
import type { RouteNode } from './route-node.js';
import { getTag, type WalkNode } from './walk.js';

type ResponseUnion<Resp> = {
  [S in keyof Resp]: { status: S; body: Resp[S] };
}[keyof Resp];

type BodyArgs<Ctx extends HttpContext<any, any, any>> = [Ctx['body']] extends [never]
  ? []
  : [body: Ctx['body']];

export interface FetchLike {
  (url: string, init: { method: string; headers?: Record<string, string>; body?: string }): Promise<{
    status: number;
    json(): Promise<unknown>;
  }>;
}

function buildMethodMap(nodes: WalkNode[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const node of nodes) {
    if (node.schema !== null && node.method) {
      const tag = getTag(node.schema);
      if (tag) map[tag] = node.method;
    }
    if (node.children.length > 0) {
      Object.assign(map, buildMethodMap(node.children as WalkNode[]));
    }
  }
  return map;
}

export function createClient<Route, Map extends Record<string, HttpContext<any, any, any>>>(
  baseUrl: string,
  router: {
    _type: Route;
    _ctxMap: Map;
    print(route: Route): string;
    children: RouteNode<unknown, unknown, any, any>[];
  },
  options?: { fetch?: FetchLike },
) {
  const methodMap = buildMethodMap(router.children as WalkNode[]);
  const fetchFn: FetchLike = options?.fetch ?? (globalThis.fetch as unknown as FetchLike);

  return {
    async fetch<Tag extends keyof Map & string>(
      route: Extract<Route, { tag: Tag }>,
      ...args: BodyArgs<Map[Tag]>
    ): Promise<ResponseUnion<Map[Tag]['response']>> {
      const tag = (route as Record<string, unknown>).tag as string;
      const method = methodMap[tag] ?? 'GET';
      const path = router.print(route as Route);
      const url = `${baseUrl.replace(/\/$/, '')}${path}`;

      const body = args[0];
      const init: { method: string; headers?: Record<string, string>; body?: string } = { method };

      if (body !== undefined) {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify(body);
      }

      const response = await fetchFn(url, init);
      const responseBody = await response.json();

      return { status: response.status, body: responseBody } as ResponseUnion<Map[Tag]['response']>;
    },
  };
}
