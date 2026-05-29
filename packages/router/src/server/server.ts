import type { Result } from '@arbor/common';
import type { HttpContext, HttpMethod, HttpResponseUnion } from '../contexts/http-context.js';
import { createMemoryStore, type RateLimitStore } from './rate-limit.js';
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

interface DispatchResult { status: number; body: unknown; headers?: Record<string, string> }

export type RateLimitKeyResolver = (req: { url: URL; headers: Record<string, string> }) => string;

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
    rateLimitMap?: Record<string, { windowMs: number; maxRequests: number }>;
    parse(url: URL): Result<Route, string>;
  },
  handlers: HandlerMap<Map, Route>,
  options?: {
    errorMap?: ErrorMapEntry[];
    maxBodySize?: number;
    rateLimitStore?: RateLimitStore;
    rateLimitKeyResolver?: RateLimitKeyResolver;
  },
) {
  // Typed alias to avoid repeating the cast at every call site.
  type UntypedHandler = (ctx: {
    params: unknown;
    body: unknown;
    query: unknown;
    headers: unknown;
  }) => Promise<{ status: number; body: unknown; headers?: Record<string, string> }>;

  const maxBodySize = options?.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;
  let _defaultRateLimitStore: RateLimitStore | undefined;

  async function executeRoute(
    route: Route,
    url: URL,
    method: string,
    body: unknown,
    headers: Record<string, string>,
  ): Promise<DispatchResult> {
    const tag = route.tag;

    const expected = router.methodMap[tag];
    if (expected && expected !== method) {
      return { status: 405, body: { error: 'method not allowed' } };
    }

    const rlPolicy = router.rateLimitMap?.[tag];
    if (rlPolicy) {
      const store = options?.rateLimitStore ?? (_defaultRateLimitStore ??= createMemoryStore());
      const key = (options?.rateLimitKeyResolver
        ? options.rateLimitKeyResolver({ url, headers })
        : (headers['x-forwarded-for'] ?? url.hostname)) + ':' + tag;
      const count = await store.increment(key, rlPolicy.windowMs);
      if (count > rlPolicy.maxRequests) {
        return {
          status: 429,
          body: { error: 'too many requests' },
          headers: { 'retry-after': String(Math.ceil(rlPolicy.windowMs / 1000)) },
        };
      }
    }

    const handler = (handlers as Record<string, UntypedHandler>)[tag];
    if (!handler) return { status: 404, body: { error: `no handler for tag: ${tag}` } };

    let validatedBody: unknown = body;
    const bodySchema = router.bodySchemaMap[tag];
    if (bodySchema) {
      const result = bodySchema.safeParse(body);
      if (!result.success) return { status: 400, body: { error: 'invalid request body' } };
      validatedBody = result.data;
    }

    let validatedHeaders: unknown = undefined;
    const headerSchema = router.headerSchemaMap?.[tag];
    if (headerSchema) {
      const result = headerSchema.safeParse(headers);
      if (!result.success) return { status: 400, body: { error: 'invalid request headers' } };
      validatedHeaders = result.data;
    }

    try {
      const routeRecord = route as Record<string, unknown>;
      const params = Object.fromEntries(
        Object.entries(routeRecord).filter(([k]) => k !== 'tag' && k !== 'child' && k !== 'query'),
      );
      const handlerResult = await handler({ params, body: validatedBody, query: routeRecord['query'], headers: validatedHeaders });

      const headerSchemas = router.responseHeaderSchemaMap?.[tag];
      if (headerSchemas && handlerResult.headers) {
        const statusSchema = headerSchemas[handlerResult.status];
        if (statusSchema) {
          const parsed = statusSchema.safeParse(handlerResult.headers);
          if (!parsed.success) console.warn('[router] response header validation failed:', parsed.error);
        }
      }

      const response: DispatchResult = { status: handlerResult.status, body: handlerResult.body };
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
  }

  function dispatch(
    url: URL,
    method: string,
    body: unknown,
    headers: Record<string, string>,
  ): Promise<DispatchResult> {
    return router.parse(url).fold(
      (route) => executeRoute(route, url, method, body, headers),
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
