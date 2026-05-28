/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Result } from '@arbor/common';
import type { HttpContext } from '../contexts/http-context.js';
import type { ResponseUnion } from '../core/route-node.js';

export type HandlerMap<CtxMap extends Record<string, HttpContext<any, any, any, any>>, Routes> = {
  [Tag in keyof CtxMap & string]: (
    route: Extract<Routes, { tag: Tag }>,
    body: CtxMap[Tag]['body'],
    query: CtxMap[Tag]['query'],
  ) => Promise<ResponseUnion<CtxMap[Tag]['response']>>;
};

export function createServer<Route, Map extends Record<string, HttpContext<any, any, any, any>>>(
  router: {
    _type: Route;
    _ctxMap: Map;
    methodMap: Record<string, string>;
    parse(url: URL): Result<Route, string>;
  },
  handlers: HandlerMap<Map, Route>,
) {
  return {
    async handle(url: URL, method: string, body?: unknown): Promise<{ status: number; body: unknown }> {
      return router.parse(url).fold(
        (route) => {
          const routeRecord = route as Record<string, unknown>;
          const tag = routeRecord['tag'] as string;
          const expected = router.methodMap[tag];
          if (expected && expected !== method) {
            return Promise.resolve({ status: 405, body: { error: 'method not allowed' } });
          }
          const handler = (
            handlers as Record<
              string,
              (r: unknown, b: unknown, q: unknown) => Promise<{ status: number; body: unknown }>
            >
          )[tag];
          if (!handler) {
            return Promise.resolve({ status: 404, body: { error: `no handler for tag: ${tag}` } });
          }
          return handler(route, body, routeRecord['query']);
        },
        (error) => Promise.resolve({ status: 404, body: { error } }),
      );
    },
  };
}
