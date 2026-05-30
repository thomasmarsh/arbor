import type z from 'zod';
import type { HttpContext, HttpMethod, HttpResponse, HttpResponseUnion, SessionCtx } from '../contexts/http-context.js';
import { collectHttpMaps } from '../contexts/http-context.js';
import type { HttpWalkNode } from '../contexts/http-context.js';
import type { AnyCtxMap, RouterContract } from '../core/router-contract.js';
import { createMemoryStore, type RateLimitStore } from './rate-limit.js';
import { parseBody } from './parse-body.js';

export interface ErrorMapEntry {
  match: (e: unknown) => boolean;
  response: (e: unknown) => { status: number; body: unknown };
}

export type HandlerCtx<
  CtxMap extends Record<string, HttpContext<HttpMethod, unknown, Record<number, unknown>, unknown, unknown, unknown, unknown>>,
  Routes,
  Tag extends keyof CtxMap & string,
> = {
  params: Omit<Extract<Routes, { tag: Tag }>, 'tag' | 'child' | 'query'>;
  body: CtxMap[Tag]['body'];
  query: CtxMap[Tag]['query'];
  headers: CtxMap[Tag]['headers'];
  cookies: CtxMap[Tag]['cookies'];
} & (CtxMap[Tag]['session'] extends never ? Record<never, never> : { session: CtxMap[Tag]['session'] });

export type HandlerMap<
  CtxMap extends Record<string, HttpContext<HttpMethod, unknown, Record<number, unknown>, unknown, unknown, unknown, unknown>>,
  Routes,
> = {
  [Tag in keyof CtxMap & string]: (
    ctx: HandlerCtx<CtxMap, Routes, Tag>,
  ) => Promise<HttpResponseUnion<CtxMap[Tag]['response']>>;
};

export type RateLimitKeyResolver = (req: { url: URL; headers: Record<string, string> }) => string;

const DEFAULT_MAX_BODY_SIZE = 1024 * 1024;

type AnyHandler = (ctx: {
  params: unknown;
  body: unknown;
  query: unknown;
  headers: unknown;
  cookies: unknown;
  session?: unknown;
}) => Promise<{ status: number; body: unknown; headers?: Record<string, string>; cookies?: Record<string, string> }>;

type DispatchResult = HttpResponse & { tag: string };

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) cookies[name] = value;
  }
  return cookies;
}

function extractParams(route: { tag: string }): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(route).filter(([k]) => k !== 'tag' && k !== 'child' && k !== 'query'),
  );
}

export function validateInput(
  schema: z.ZodType | undefined,
  value: unknown,
  errorMsg: string,
  fallback?: unknown,
): { ok: true; data: unknown } | { ok: false; status: 400; body: { error: string } } {
  if (!schema) return { ok: true, data: fallback };
  const r = schema.safeParse(value);
  if (!r.success) return { ok: false, status: 400, body: { error: errorMsg } };
  return { ok: true, data: r.data };
}

export function resolveHandler(
  handlers: Record<string, AnyHandler>,
  tag: string,
  method: string,
  expected: string | undefined,
): { ok: true; handler: AnyHandler } | { ok: false; status: 405 | 404; body: { error: string }; headers?: Record<string, string> } {
  if (expected && expected !== method) return { ok: false, status: 405, body: { error: 'method not allowed' }, headers: { Allow: expected } };
  const handler = handlers[tag];
  if (!handler) return { ok: false, status: 404, body: { error: `no handler for tag: ${tag}` } };
  return { ok: true, handler };
}

export function validateResponse(
  result: { status: number; headers?: Record<string, string>; cookies?: Record<string, string> },
  headerSchemas: Record<number, z.ZodType> | undefined,
  cookieSchemas: Record<number, z.ZodType> | undefined,
): { ok: true } | { ok: false; status: 500; body: { error: string } } {
  if (headerSchemas && result.headers) {
    const schema = headerSchemas[result.status];
    if (schema && !schema.safeParse(result.headers).success) return { ok: false, status: 500, body: { error: 'invalid response headers' } };
  }
  if (cookieSchemas && result.cookies) {
    const schema = cookieSchemas[result.status];
    if (schema && !schema.safeParse(result.cookies).success) return { ok: false, status: 500, body: { error: 'invalid response cookies' } };
  }
  return { ok: true };
}

export function createServer<
  Route extends { tag: string },
  Map extends AnyCtxMap,
>(
  router: RouterContract<Route, Map>,
  handlers: HandlerMap<Map, Route>,
  options?: {
    errorMap?: ErrorMapEntry[];
    maxBodySize?: number;
    rateLimitStore?: RateLimitStore;
    rateLimitKeyResolver?: RateLimitKeyResolver;
    resolveSession?: (headers: Record<string, string>) => Promise<SessionCtx | null>;
  },
) {
  const { methodMap, bodySchemaMap, headerSchemaMap, cookieSchemaMap, responseHeaderSchemaMap, responseCookieSchemaMap, rateLimitMap, requiresMap } =
    collectHttpMaps(router.children as HttpWalkNode[]);

  const maxBodySize = options?.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;
  let _defaultRateLimitStore: RateLimitStore | undefined;

  async function executeRoute(
    route: Route,
    url: URL,
    method: string,
    body: unknown,
    headers: Record<string, string>,
  ): Promise<DispatchResult> {
    const { tag } = route;
    const rlPolicy = rateLimitMap[tag];
    if (rlPolicy) {
      const store = options?.rateLimitStore ?? (_defaultRateLimitStore ??= createMemoryStore());
      const key = (options?.rateLimitKeyResolver ? options.rateLimitKeyResolver({ url, headers }) : (headers['x-forwarded-for'] ?? url.hostname)) + ':' + tag;
      const count = await store.increment(key, rlPolicy.windowMs);
      if (count > rlPolicy.maxRequests) return { status: 429, body: { error: 'too many requests' }, headers: { 'retry-after': String(Math.ceil(rlPolicy.windowMs / 1000)) }, tag };
    }
    const requiredRoles = requiresMap[tag];
    let session: SessionCtx | undefined;
    if (requiredRoles) {
      if (!options?.resolveSession) return { status: 500, body: { error: 'resolveSession not configured' }, tag };
      const resolved = await options.resolveSession(headers);
      if (!resolved) return { status: 401, body: { error: 'unauthorized' }, tag };
      const hasRole = requiredRoles.some((r) => resolved.roles.includes(r));
      if (!hasRole) return { status: 403, body: { error: 'forbidden' }, tag };
      session = resolved;
    }
    const resolved = resolveHandler(handlers as Record<string, AnyHandler>, tag, method, methodMap[tag]);
    if (!resolved.ok) return { ...resolved, tag };
    const bodyResult = validateInput(bodySchemaMap[tag], body, 'invalid request body', body);
    if (!bodyResult.ok) return { ...bodyResult, tag };
    const headerResult = validateInput(headerSchemaMap[tag], headers, 'invalid request headers');
    if (!headerResult.ok) return { ...headerResult, tag };
    const cookieResult = validateInput(cookieSchemaMap[tag], parseCookies(headers['cookie'] ?? ''), 'invalid request cookies');
    if (!cookieResult.ok) return { ...cookieResult, tag };
    try {
      const params = extractParams(route);
      const query = (route as { query?: unknown }).query;
      const handlerResult = await resolved.handler({ params, body: bodyResult.data, query, headers: headerResult.data, cookies: cookieResult.data, ...(session ? { session } : {}) });
      const respResult = validateResponse(handlerResult, responseHeaderSchemaMap[tag], responseCookieSchemaMap[tag]);
      if (!respResult.ok) return { ...respResult, tag };
      const response: DispatchResult = { status: handlerResult.status, body: handlerResult.body, tag };
      if (handlerResult.headers) response.headers = handlerResult.headers;
      if (handlerResult.cookies) response.cookies = handlerResult.cookies;
      return response;
    } catch (e) {
      if (options?.errorMap) {
        for (const entry of options.errorMap) {
          if (entry.match(e)) { const mapped = entry.response(e); return { status: mapped.status, body: mapped.body, tag }; }
        }
      }
      return { status: 500, body: { error: 'internal server error' }, tag };
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
      (error) => Promise.resolve({ status: 404, body: { error }, tag: 'unmatched' }),
    );
  }

  return {
    async handle(
      url: URL,
      method: string,
      body?: unknown,
      headers?: Record<string, string>,
    ): Promise<{ status: number; body: unknown; headers?: Record<string, string>; cookies?: Record<string, string>; tag: string }> {
      return dispatch(url, method, body, headers ?? {});
    },

    async handleRequest(
      request: Request,
    ): Promise<{ status: number; body: unknown; headers?: Record<string, string>; cookies?: Record<string, string>; tag: string }> {
      const bodyResult = await parseBody(request, maxBodySize);
      if (!bodyResult.ok) return { status: bodyResult.status, body: bodyResult.body, tag: 'unmatched' };
      const headers: Record<string, string> = {};
      request.headers.forEach((v, k) => { headers[k] = v; });
      return dispatch(new URL(request.url), request.method, bodyResult.data, headers);
    },
  };
}
