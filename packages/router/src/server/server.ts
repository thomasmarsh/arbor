import type { Result } from '@arbor/common';
import type { HttpContext, HttpMethod, HttpResponseUnion } from '../contexts/http-context.js';
import { parseBody } from './parse-body.js';

interface BodyValidator {
  safeParse(data: unknown): { success: boolean; data?: unknown; error?: unknown };
}

export interface ErrorMapEntry {
  match: (e: unknown) => boolean;
  response: (e: unknown) => { status: number; body: unknown };
}

export interface HandlerCtx<
  CtxMap extends Record<string, HttpContext<HttpMethod, unknown, Record<number, unknown>, unknown, unknown>>,
  Routes,
  Tag extends keyof CtxMap & string,
> {
  params: Omit<Extract<Routes, { tag: Tag }>, 'tag' | 'child' | 'query'>;
  body: CtxMap[Tag]['body'];
  query: CtxMap[Tag]['query'];
  headers: CtxMap[Tag]['headers'];
}

export type HandlerMap<
  CtxMap extends Record<string, HttpContext<HttpMethod, unknown, Record<number, unknown>, unknown, unknown>>,
  Routes,
> = {
  [Tag in keyof CtxMap & string]: (
    ctx: HandlerCtx<CtxMap, Routes, Tag>,
  ) => Promise<HttpResponseUnion<CtxMap[Tag]['response']>>;
};

const DEFAULT_MAX_BODY_SIZE = 1024 * 1024;

export function createServer<
  Route extends { tag: string },
  Map extends Record<string, HttpContext<HttpMethod, unknown, Record<number, unknown>, unknown, unknown>>,
>(
  router: {
    _type: Route;
    _ctxMap: Map;
    methodMap: Record<string, string>;
    bodySchemaMap: Record<string, BodyValidator>;
    responseHeaderSchemaMap?: Record<string, Record<number, BodyValidator>>;
    headerSchemaMap?: Record<string, BodyValidator>;
    parse(url: URL): Result<Route, string>;
  },
  handlers: HandlerMap<Map, Route>,
  options?: { errorMap?: ErrorMapEntry[]; maxBodySize?: number },
) {
  const maxBodySize = options?.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;

  async function dispatch(
    url: URL,
    method: string,
    body: unknown,
    headers: Record<string, string>,
  ): Promise<{ status: number; body: unknown; headers?: Record<string, string> }> {
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
              (ctx: { params: unknown; body: unknown; query: unknown; headers: unknown }) => Promise<{
                status: number;
                body: unknown;
                headers?: Record<string, string>;
              }>
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

          let validatedHeaders: unknown = undefined;
          const headerSchema = router.headerSchemaMap?.[tag];
          if (headerSchema) {
            const result = headerSchema.safeParse(headers);
            if (!result.success) {
              return { status: 400, body: { error: 'invalid request headers' } };
            }
            validatedHeaders = result.data;
          }

          try {
            const routeRecord = route as Record<string, unknown>;
            const params = Object.fromEntries(
              Object.entries(routeRecord).filter(([k]) => k !== 'tag' && k !== 'child' && k !== 'query'),
            );
            const handlerResult = await handler({
              params,
              body: validatedBody,
              query: routeRecord['query'],
              headers: validatedHeaders,
            });

            const headerSchemas = router.responseHeaderSchemaMap?.[tag];
            if (headerSchemas && handlerResult.headers) {
              const statusSchema = headerSchemas[handlerResult.status];
              if (statusSchema) {
                const parsed = statusSchema.safeParse(handlerResult.headers);
                if (!parsed.success) {
                  console.warn('[router] response header validation failed:', parsed.error);
                }
              }
            }

            const response: { status: number; body: unknown; headers?: Record<string, string> } = {
              status: handlerResult.status,
              body: handlerResult.body,
            };
            if (handlerResult.headers) response.headers = handlerResult.headers;
            return response;
          } catch (e) {
            if (options?.errorMap) {
              for (const entry of options.errorMap) {
                if (entry.match(e)) {
                  const mapped = entry.response(e);
                  return { status: mapped.status, body: mapped.body };
                }
              }
            }
            return { status: 500, body: { error: 'internal server error' } };
          }
        },
        (error) => Promise.resolve({ status: 404, body: { error } }),
      );
  }

  return {
    async handle(
      url: URL,
      method: string,
      body?: unknown,
      headers?: Record<string, string>,
    ): Promise<{ status: number; body: unknown; headers?: Record<string, string> }> {
      return dispatch(url, method, body, headers ?? {});
    },

    async handleRequest(
      request: Request,
    ): Promise<{ status: number; body: unknown; headers?: Record<string, string> }> {
      const bodyResult = await parseBody(request, maxBodySize);
      if (!bodyResult.ok) return { status: bodyResult.status, body: bodyResult.body };
      const headers: Record<string, string> = {};
      request.headers.forEach((v, k) => { headers[k] = v; });
      return dispatch(new URL(request.url), request.method, bodyResult.data, headers);
    },
  };
}
