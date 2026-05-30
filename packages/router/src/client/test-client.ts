/* eslint-disable @typescript-eslint/no-explicit-any */

import type { HttpContext, HttpMethod } from '../contexts/http-context.js';
import type { RouteNode } from '../core/route-node.js';
import type { Result } from '@arbor/common';
import type { HandlerMap } from '../server/server.js';
import { createServer } from '../server/server.js';
import { createClient, type FetchLike, type TypedClient } from './fetch-client.js';

interface RouterShape<Route, Map> {
  _type: Route;
  _ctxMap: Map;
  children: RouteNode<unknown, any, any, any, any>[];
  parse(url: URL): Result<Route, string>;
  print(route: Route): string;
}

export function createTestClient<
  Route extends { tag: string },
  Map extends Record<string, HttpContext<any, any, any, any, any>>,
>(
  router: RouterShape<Route, Map> & { _ctxMap: Map },
  handlers: HandlerMap<Map, Route>,
  options?: {
    baseUrl?: string;
    serverOptions?: {
      maxBodySize?: number;
    };
  },
): TypedClient<Route, Map> {
  const serverRouter = router as unknown as {
    _type: Route;
    _ctxMap: Record<string, HttpContext<HttpMethod, unknown, Record<number, unknown>, unknown, unknown, unknown>>;
    children: RouteNode<unknown, any, any, any, any>[];
    parse(url: URL): Result<Route, string>;
  };
  const server = createServer(
    serverRouter,
    handlers as unknown as HandlerMap<Record<string, HttpContext<HttpMethod, unknown, Record<number, unknown>, unknown, unknown, unknown>>, Route>,
    options?.serverOptions,
  );
  const baseUrl = options?.baseUrl ?? 'http://localhost';

  const mockFetch: FetchLike = async (url, init) => {
    const bodyText = typeof init.body === 'string' ? init.body : undefined;
    const body = bodyText ? (JSON.parse(bodyText) as unknown) : undefined;
    const headers: Record<string, string> = {};
    if (init.headers) {
      for (const [k, v] of Object.entries(init.headers)) headers[k] = v;
    }
    const result = await server.handle(new URL(url), init.method, body, headers);
    return { status: result.status, json: () => Promise.resolve(result.body) };
  };

  return createClient(baseUrl, router, { fetch: mockFetch });
}
