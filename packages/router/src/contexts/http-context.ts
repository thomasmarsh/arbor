/* eslint-disable @typescript-eslint/no-explicit-any */

import type z from 'zod';
import type { RouteNode } from '../core/route-node.js';
import { parseSegments } from '../core/segments.js';
import { walkCollect } from '../core/walk.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface CorsConfig {
  origins: string[] | '*';
  methods?: string[];
  allowedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
  csrf?: boolean;
}

export interface HttpResponse<
  Status extends number = number,
  Body = unknown,
> {
  status: Status;
  body: Body;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}

export interface HttpContextData {
  method: HttpMethod;
  bodySchema?: z.ZodType;
  responseSchemas?: Record<number, z.ZodType>;
  responseHeaderSchemas?: Record<number, z.ZodObject<any, any>>;
  responseCookieSchemas?: Record<number, z.ZodObject<any, any>>;
  querySchema?: z.ZodObject<any, any>;
  headerSchema?: z.ZodObject<any, any>;
  cookieSchema?: z.ZodObject<any, any>;
  rateLimit?: { windowMs: number; maxRequests: number };
  cors?: CorsConfig;
}

export type HttpWalkNode = RouteNode<unknown, any, any, any, HttpContextData>;

export function getHttpMeta(node: HttpWalkNode): HttpContextData | undefined {
  return node._meta;
}

export function collectHttpMaps(nodes: HttpWalkNode[]): {
  methodMap: Record<string, string>;
  bodySchemaMap: Record<string, z.ZodType>;
  headerSchemaMap: Record<string, z.ZodType>;
  cookieSchemaMap: Record<string, z.ZodType>;
  responseHeaderSchemaMap: Record<string, Record<number, z.ZodType>>;
  responseCookieSchemaMap: Record<string, Record<number, z.ZodType>>;
  rateLimitMap: Record<string, { windowMs: number; maxRequests: number }>;
  corsMap: Record<string, CorsConfig>;
} {
  return {
    methodMap:                walkCollect(nodes, (n) => getHttpMeta(n)?.method),
    bodySchemaMap:            walkCollect(nodes, (n) => getHttpMeta(n)?.bodySchema),
    headerSchemaMap:          walkCollect(nodes, (n) => getHttpMeta(n)?.headerSchema),
    cookieSchemaMap:          walkCollect(nodes, (n) => getHttpMeta(n)?.cookieSchema),
    responseHeaderSchemaMap:  walkCollect(nodes, (n) => getHttpMeta(n)?.responseHeaderSchemas) as Record<string, Record<number, z.ZodType>>,
    responseCookieSchemaMap:  walkCollect(nodes, (n) => getHttpMeta(n)?.responseCookieSchemas) as Record<string, Record<number, z.ZodType>>,
    rateLimitMap:             walkCollect(nodes, (n) => getHttpMeta(n)?.rateLimit),
    corsMap:                  walkCollect(nodes, (n) => getHttpMeta(n)?.cors),
  };
}

export interface HttpContext<
  Method extends HttpMethod,
  Body,
  Response extends Record<number, unknown>,
  Query = never,
  Headers = never,
  Cookies = never,
> {
  method: Method;
  body: Body;
  response: Response;
  query: Query;
  headers: Headers;
  cookies: Cookies;
}

// A response descriptor object with an explicit _desc discriminant.
interface ResponseDescriptorObj { _desc: true; body: z.ZodType; headers?: z.ZodObject<any, any>; cookies?: z.ZodObject<any, any> }
// A response for a single status code: either a bare Zod body schema or an explicit descriptor.
type ResponseDescriptor = z.ZodType | ResponseDescriptorObj;

type InferResponseDescriptor<D> =
  D extends z.ZodType
    ? z.infer<D>
    : D extends { _desc: true; body: infer B extends z.ZodType; headers: infer H extends z.ZodObject<any, any>; cookies: infer CK extends z.ZodObject<any, any> }
      ? { body: z.infer<B>; headers: z.infer<H>; cookies: z.infer<CK> }
      : D extends { _desc: true; body: infer B extends z.ZodType; headers: infer H extends z.ZodObject<any, any> }
        ? { body: z.infer<B>; headers: z.infer<H> }
        : D extends { _desc: true; body: infer B extends z.ZodType; cookies: infer CK extends z.ZodObject<any, any> }
          ? { body: z.infer<B>; cookies: z.infer<CK> }
          : D extends { _desc: true; body: infer B extends z.ZodType }
            ? z.infer<B>
            : never;

type InferResponseMap<R extends Record<number, ResponseDescriptor>> = {
  [K in keyof R]: InferResponseDescriptor<R[K]>;
};

// Maps an inferred response map to a discriminated union of { status, body[, headers][, cookies] }.
// Used by server.ts to type handler return values. Lives here (not core/) because
// the headers/cookies shape is an HTTP-specific concern.
export type HttpResponseUnion<Resp> = {
  [S in keyof Resp]:
    Resp[S] extends { body: infer B; headers: infer H; cookies: infer CK }
      ? { status: S; body: B; headers: H; cookies: CK }
      : Resp[S] extends { body: infer B; headers: infer H }
        ? { status: S; body: B; headers: H }
        : Resp[S] extends { body: infer B; cookies: infer CK }
          ? { status: S; body: B; cookies: CK }
          : { status: S; body: Resp[S] };
}[keyof Resp];

export function respond<S extends number, B>(status: S, body: B): { status: S; body: B };
export function respond<S extends number, B, O extends { headers?: Record<string, string>; cookies?: Record<string, string> }>(
  status: S, body: B, opts: O,
): { status: S; body: B } & O;
export function respond(status: number, body: unknown, opts?: Record<string, unknown>) {
  return opts ? { status, body, ...opts } : { status, body };
}

export function desc<B extends z.ZodType>(body: B): { _desc: true; body: B };
export function desc<B extends z.ZodType, O extends { headers?: z.ZodObject<any, any>; cookies?: z.ZodObject<any, any> }>(
  body: B, opts: O,
): { _desc: true; body: B } & O;
export function desc(body: z.ZodType, opts?: Record<string, unknown>) {
  return opts ? { _desc: true as const, body, ...opts } : { _desc: true as const, body };
}

export function httpRoute<
  S extends z.ZodObject<any, any>,
  Method extends HttpMethod,
  C extends RouteNode<unknown, any, any, any, any>[] = [],
  Body = never,
  Res extends Record<number, ResponseDescriptor> = Record<number, ResponseDescriptor>,
  Q extends z.ZodObject<any, any> | undefined = undefined,
  H extends z.ZodObject<any, any> | undefined = undefined,
  CK extends z.ZodObject<any, any> | undefined = undefined,
>(
  schema: S,
  method: Method,
  path: string,
  options: { body?: z.ZodType<Body>; response: Res; query?: Q; headers?: H; cookies?: CK; rateLimit?: { windowMs: number; maxRequests: number }; cors?: CorsConfig },
  children?: [...C],
): RouteNode<
  z.infer<S> & (Q extends z.ZodObject<any, any> ? { query: z.infer<Q> } : unknown),
  [...C],
  HttpContext<Method, Body, InferResponseMap<Res>, Q extends z.ZodObject<any, any> ? z.infer<Q> : never, H extends z.ZodObject<any, any> ? z.infer<H> : never, CK extends z.ZodObject<any, any> ? z.infer<CK> : never>,
  never,
  HttpContextData
> {
  const responseSchemas: Record<number, z.ZodType> = {};
  const responseHeaderSchemas: Record<number, z.ZodObject<any, any>> = {};
  const responseCookieSchemas: Record<number, z.ZodObject<any, any>> = {};
  let hasHeaderSchemas = false;
  let hasCookieSchemas = false;

  for (const [status, descriptor] of Object.entries(
    options.response as Record<string, unknown>,
  )) {
    const s = Number(status);
    if ('_desc' in Object(descriptor)) {
      const d = descriptor as ResponseDescriptorObj;
      responseSchemas[s] = d.body;
      if (d.headers) { responseHeaderSchemas[s] = d.headers; hasHeaderSchemas = true; }
      if (d.cookies) { responseCookieSchemas[s] = d.cookies; hasCookieSchemas = true; }
    } else {
      responseSchemas[s] = descriptor as z.ZodType;
    }
  }

  return {
    _type: undefined as never,
    schema,
    path,
    segments: parseSegments(path),
    children: (children ?? []) as [...C],
    context: undefined as never,
    _meta: {
      method,
      ...(options.body ? { bodySchema: options.body } : {}),
      ...(options.query ? { querySchema: options.query } : {}),
      ...(options.headers ? { headerSchema: options.headers } : {}),
      ...(options.cookies ? { cookieSchema: options.cookies } : {}),
      ...(options.rateLimit ? { rateLimit: options.rateLimit } : {}),
      ...(options.cors ? { cors: options.cors } : {}),
      responseSchemas,
      ...(hasHeaderSchemas ? { responseHeaderSchemas } : {}),
      ...(hasCookieSchemas ? { responseCookieSchemas } : {}),
    },
  };
}
