import type { HttpContext, HttpMethod, HttpResponse, HttpResponseUnion, InferSingleSuccessBody, SessionCtx } from '../contexts/http-context.js';
import { collectHttpMaps, createMethodAwareParser } from '../contexts/http-context.js';
import type { HttpWalkNode } from '../contexts/http-context.js';
import type { AnyUserSchema } from '../core/schema.js';
import { syncValidate } from '../core/schema.js';
import type { AnyCtxMap, RouterContract } from '../core/router-contract.js';
import { createMemoryStore, type RateLimitStore } from './rate-limit.js';
import { parseBody } from './parse-body.js';

export interface ErrorMapEntry {
  match: (e: unknown) => boolean;
  response: (e: unknown) => { status: number; body: unknown };
}

// Recursively unwraps section-wrapper `{ child: ... }` objects to reach the
// tagged leaf route shape.  Distributes over unions so that a union of section
// wrappers produces a union of leaves.
type FlattenRouteLeaf<R> =
  R extends { tag: string } ? R :
  R extends { child: infer C } ? FlattenRouteLeaf<C> : never;

export type HandlerCtx<
  CtxMap extends Record<string, HttpContext<HttpMethod, unknown, Record<number, unknown>, unknown, unknown, unknown, unknown>>,
  Routes,
  Tag extends keyof CtxMap & string,
> = {
  params: Omit<Extract<FlattenRouteLeaf<Routes>, { tag: Tag }>, 'tag' | 'child' | 'query'>;
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
  ) =>
    | Promise<HttpResponseUnion<CtxMap[Tag]['response']> | InferSingleSuccessBody<CtxMap[Tag]['response']>>
    | InferSingleSuccessBody<CtxMap[Tag]['response']>;
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
}) => unknown;

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

// Descends through section-wrapper `{ child: ... }` objects produced by
// walkParseIndexed for section nodes (schema === null) to find the tagged leaf.
function extractLeafRoute(route: unknown): Record<string, unknown> {
  if (typeof route === 'object' && route !== null) {
    const r = route as Record<string, unknown>;
    if (typeof r['tag'] === 'string') return r;
    if (r['child'] !== null && typeof r['child'] === 'object') return extractLeafRoute(r['child']);
  }
  return {};
}

function extractParams(route: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(route).filter(([k]) => k !== 'tag' && k !== 'child' && k !== 'query'),
  );
}

export function validateInput(
  schema: AnyUserSchema | undefined,
  value: unknown,
  errorMsg: string,
  fallback?: unknown,
): { ok: true; data: unknown } | { ok: false; status: 400; body: { error: string } } {
  if (!schema) return { ok: true, data: fallback };
  const r = syncValidate(schema, value);
  if ('issues' in r) return { ok: false, status: 400, body: { error: errorMsg } };
  return { ok: true, data: r.value };
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
  headerSchemas: Record<number, AnyUserSchema> | undefined,
  cookieSchemas: Record<number, AnyUserSchema> | undefined,
): { ok: true } | { ok: false; status: 500; body: { error: string } } {
  if (headerSchemas && result.headers) {
    const schema = headerSchemas[result.status];
    if (schema && 'issues' in syncValidate(schema, result.headers)) return { ok: false, status: 500, body: { error: 'invalid response headers' } };
  }
  if (cookieSchemas && result.cookies) {
    const schema = cookieSchemas[result.status];
    if (schema && 'issues' in syncValidate(schema, result.cookies)) return { ok: false, status: 500, body: { error: 'invalid response cookies' } };
  }
  return { ok: true };
}

export function createServer<
  Route,
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
    onError?: (err: unknown, tag: string) => void;
    supervise?: boolean;
  },
) {
  const { methodMap, bodySchemaMap, headerSchemaMap, cookieSchemaMap, responseHeaderSchemaMap, responseCookieSchemaMap, rateLimitMap, requiresMap, wrapStatusMap } =
    collectHttpMaps(router.children as HttpWalkNode[]);
  const methodAwareParser = createMethodAwareParser<Route>(router.children as HttpWalkNode[]);

  const maxBodySize = options?.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;
  let _defaultRateLimitStore: RateLimitStore | undefined;

  async function applyRateLimit(
    tag: string,
    url: URL,
    headers: Record<string, string>,
  ): Promise<DispatchResult | null> {
    const rlPolicy = rateLimitMap[tag];
    if (!rlPolicy) return null;
    const store = options?.rateLimitStore ?? (_defaultRateLimitStore ??= createMemoryStore());
    const key = (options?.rateLimitKeyResolver ? options.rateLimitKeyResolver({ url, headers }) : (headers['x-forwarded-for'] ?? url.hostname)) + ':' + tag;
    const count = await store.increment(key, rlPolicy.windowMs);
    if (count > rlPolicy.maxRequests) return { status: 429, body: { error: 'too many requests' }, headers: { 'retry-after': String(Math.ceil(rlPolicy.windowMs / 1000)) }, tag };
    return null;
  }

  async function executeRoute(
    route: Route,
    url: URL,
    method: string,
    body: unknown,
    headers: Record<string, string>,
  ): Promise<DispatchResult> {
    const leaf = extractLeafRoute(route);
    const tag = leaf['tag'] as string;
    const rateLimitResult = await applyRateLimit(tag, url, headers);
    if (rateLimitResult) return rateLimitResult;
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
      const params = extractParams(leaf);
      const query = leaf['query'];
      const rawResult = await resolved.handler({ params, body: bodyResult.data, query, headers: headerResult.data, cookies: cookieResult.data, ...(session ? { session } : {}) });
      const handlerResult: { status: number; body: unknown; headers?: Record<string, string>; cookies?: Record<string, string> } =
        rawResult !== null && typeof rawResult === 'object' && typeof (rawResult as { status?: unknown }).status === 'number' && 'body' in rawResult
          ? rawResult as { status: number; body: unknown; headers?: Record<string, string>; cookies?: Record<string, string> }
          : { status: wrapStatusMap[tag] ?? 200, body: rawResult };
      const respResult = validateResponse(handlerResult, responseHeaderSchemaMap[tag], responseCookieSchemaMap[tag]);
      if (!respResult.ok) return { ...respResult, tag };
      const response: DispatchResult = { status: handlerResult.status, body: handlerResult.body, tag };
      if (handlerResult.headers) response.headers = handlerResult.headers;
      if (handlerResult.cookies) response.cookies = handlerResult.cookies;
      return response;
    } catch (e) {
      if (options?.supervise === false) throw e;
      if (options?.errorMap) {
        for (const entry of options.errorMap) {
          if (entry.match(e)) { const mapped = entry.response(e); return { status: mapped.status, body: mapped.body, tag }; }
        }
      }
      // eslint-disable-next-line no-console -- console.error is the default onError fallback when caller provides no handler
      (options?.onError ?? console.error)(e, tag);
      return { status: 500, body: { error: 'internal server error' }, tag };
    }
  }

  function dispatch(
    url: URL,
    method: string,
    body: unknown,
    headers: Record<string, string>,
  ): Promise<DispatchResult> {
    return methodAwareParser.parse(url, method).fold(
      (route) => executeRoute(route, url, method, body, headers),
      (): Promise<DispatchResult> =>
        // No route matched for this method. Check if the path exists at all
        // to distinguish 405 (path known, wrong method) from 404 (unknown path).
        router.parse(url).fold(
          (anyRoute): Promise<DispatchResult> => {
            const leaf = extractLeafRoute(anyRoute);
            const tag = leaf['tag'] as string;
            const allowed = methodMap[tag];
            return Promise.resolve({
              status: 405,
              body: { error: 'method not allowed' },
              ...(allowed ? { headers: { Allow: allowed } } : {}),
              tag,
            });
          },
          (error): Promise<DispatchResult> =>
            Promise.resolve({ status: 404, body: { error }, tag: 'unmatched' }),
        ),
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
