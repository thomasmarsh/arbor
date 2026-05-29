import type { Result } from '@arbor/common';
import type { HttpContext, HttpMethod } from '../contexts/http-context.js';
import type { ResponseUnion } from '../core/route-node.js';

interface BodyValidator {
  safeParse(data: unknown): { success: boolean; data?: unknown; error?: unknown };
}

export interface HandlerCtx<
  CtxMap extends Record<string, HttpContext<HttpMethod, unknown, Record<number, unknown>, unknown>>,
  Routes,
  Tag extends keyof CtxMap & string,
> {
  params: Omit<Extract<Routes, { tag: Tag }>, 'tag' | 'child' | 'query'>;
  body: CtxMap[Tag]['body'];
  query: CtxMap[Tag]['query'];
}

export type HandlerMap<
  CtxMap extends Record<string, HttpContext<HttpMethod, unknown, Record<number, unknown>, unknown>>,
  Routes,
> = {
  [Tag in keyof CtxMap & string]: (
    ctx: HandlerCtx<CtxMap, Routes, Tag>,
  ) => Promise<ResponseUnion<CtxMap[Tag]['response']>>;
};

export function createServer<
  Route extends { tag: string },
  Map extends Record<string, HttpContext<HttpMethod, unknown, Record<number, unknown>, unknown>>,
>(
  router: {
    _type: Route;
    _ctxMap: Map;
    methodMap: Record<string, string>;
    bodySchemaMap: Record<string, BodyValidator>;
    parse(url: URL): Result<Route, string>;
  },
  handlers: HandlerMap<Map, Route>,
) {
  return {
    async handle(url: URL, method: string, body?: unknown): Promise<{ status: number; body: unknown }> {
      return router.parse(url).fold(
        async (route) => {
          const tag = route.tag;
          const expected = router.methodMap[tag];
          if (expected && expected !== method) {
            return { status: 405, body: { error: 'method not allowed' } };
          }
          const handler = (
            handlers as Record<
              string,
              (ctx: { params: unknown; body: unknown; query: unknown }) => Promise<{ status: number; body: unknown }>
            >
          )[tag];
          if (!handler) {
            return { status: 404, body: { error: `no handler for tag: ${tag}` } };
          }

          let validatedBody: unknown = body;
          const bodySchema = router.bodySchemaMap[tag];
          if (bodySchema) {
            const result = bodySchema.safeParse(body);
            if (!result.success) {
              return { status: 400, body: { error: 'invalid request body' } };
            }
            validatedBody = result.data;
          }

          try {
            const routeRecord = route as Record<string, unknown>;
            const params = Object.fromEntries(
              Object.entries(routeRecord).filter(([k]) => k !== 'tag' && k !== 'child' && k !== 'query'),
            );
            return await handler({ params, body: validatedBody, query: routeRecord['query'] });
          } catch {
            return { status: 500, body: { error: 'internal server error' } };
          }
        },
        (error) => Promise.resolve({ status: 404, body: { error } }),
      );
    },
  };
}
