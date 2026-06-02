import { Result } from '@arbor/common';
import type z from 'zod';
import type { HttpContext, HttpResponseUnion } from '../contexts/http-context.js';
import { getHttpMeta, type HttpWalkNode } from '../contexts/http-context.js';
import type { AnyCtxMap, RouterContract } from '../core/router-contract.js';
import { walkCollect } from '../core/walk.js';

interface NoOpts {
  body?: never;
  headers?: never;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- HttpContext type params require any for conditional narrowing
type RequestOpts<Ctx extends HttpContext<any, any, any, any, any, any, any>> = [Ctx['body']] extends [never]
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

// Recursively unwraps section-wrapper `{ child: ... }` shapes to the tagged
// leaf — mirrors FlattenRouteLeaf in server.ts.
type FlattenRouteLeaf<R> =
  R extends { tag: string } ? R :
  R extends { child: infer C } ? FlattenRouteLeaf<C> : never;

export interface TypedClient<
  Route,
  Map extends AnyCtxMap,
  Validate extends boolean = false,
> {
  fetch<Tag extends keyof Map & string>(
    route: Extract<FlattenRouteLeaf<Route>, { tag: Tag }>,
    opts?: RequestOpts<Map[Tag]>,
  ): Promise<
    Validate extends true
      ? Result<HttpResponseUnion<Map[Tag]['response']>, z.ZodError>
      : HttpResponseUnion<Map[Tag]['response']>
  >;
}

export function createClient<
  Route,
  Map extends AnyCtxMap,
  Validate extends boolean = false,
>(
  baseUrl: string,
  router: RouterContract<Route, Map>,
  options?: { fetch?: FetchLike; validate?: Validate },
): TypedClient<Route, Map, Validate> {
  const methodMap = walkCollect(router.children as HttpWalkNode[], (n) => getHttpMeta(n)?.method);
  const responseSchemaMap = walkCollect(router.children as HttpWalkNode[], (n) => getHttpMeta(n)?.responseSchemas);
  const fetchFn: FetchLike = options?.fetch ?? globalThis.fetch;
  const validate = options?.validate ?? false;

  // Cast needed: TypeScript cannot assign a concrete union to an unresolved conditional type.
  return {
    async fetch<Tag extends keyof Map & string>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- FlattenRouteLeaf is not directly assignable without cast; overload call site resolves correctly
      route: Extract<FlattenRouteLeaf<any>, { tag: Tag }>,
      opts?: RequestOpts<Map[Tag]>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- return type is an unresolved conditional; cast at call site
    ): Promise<any> {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- route is any (FlattenRouteLeaf<any>)
      const tag = route.tag as string;
      const method = methodMap[tag] ?? 'GET';
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- route is any; print accepts Route which any satisfies
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
      const responseObj = { status: response.status, body: responseBody } as HttpResponseUnion<
        Map[Tag]['response']
      >;

      if (validate) {
        const schema = responseSchemaMap[tag]?.[response.status];
        if (schema) {
          const parsed = schema.safeParse(responseBody);
          if (!parsed.success) {
            return Result.err(parsed.error);
          }
        }
        return Result.ok(responseObj);
      }

      return responseObj;
    },
  };
}
