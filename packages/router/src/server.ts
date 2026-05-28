/* eslint-disable @typescript-eslint/no-explicit-any */

import { Result } from '@arbor/common';
import type { HttpContext } from './http-context.js';

type ResponseUnion<Resp> = {
  [S in keyof Resp]: { status: S; body: Resp[S] };
}[keyof Resp];

export type HandlerMap<CtxMap extends Record<string, HttpContext<any, any, any>>, Routes> = {
  [Tag in keyof CtxMap & string]: (
    route: Extract<Routes, { tag: Tag }>,
    body: CtxMap[Tag]['body'],
  ) => Promise<ResponseUnion<CtxMap[Tag]['response']>>;
};

export function createServer<Route, Map extends Record<string, HttpContext<any, any, any>>>(
  router: {
    _type: Route;
    _ctxMap: Map;
    parse(url: URL): Result<Route, string>;
  },
  handlers: HandlerMap<Map, Route>,
) {
  return {
    async handle(url: URL, body?: unknown): Promise<{ status: number; body: unknown }> {
      return router.parse(url).fold(
        (route) => {
          const tag = (route as Record<string, unknown>)['tag'] as string;
          const handler = (
            handlers as Record<
              string,
              (r: unknown, b: unknown) => Promise<{ status: number; body: unknown }>
            >
          )[tag];
          if (!handler) {
            return Promise.resolve({ status: 404, body: { error: `no handler for tag: ${tag}` } });
          }
          return handler(route, body);
        },
        (error) => Promise.resolve({ status: 404, body: { error } }),
      );
    },
  };
}
