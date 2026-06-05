import { Result } from '@arbor/common';
import { type BuildableRouteNode, buildable } from '../core/define-routes.js';
import type { RouteNode } from '../core/route-node.js';
import type { AnyObjectSchema, AnyUserSchema, InferUserSchema, UserSchema, Infer } from '../core/schema.js';
import { parseSegments } from '../core/segments.js';
import type { Recv, Select, Send, Session, SessionMeta } from '../core/session.js';
import { walkCollect, indexNodes, walkParseIndexed, type WalkNode } from '../core/walk.js';

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

export type HttpResponseSelect<Res> = Select<{
  [S in keyof Res & number]: Send<Res[S]>;
}>;

export type HttpSession<Res> = Recv<void, HttpResponseSelect<Res>>;

export type InferHttpSession<Route> =
  Route extends { _meta?: SessionMeta<infer S extends Session> } ? S : never;

export interface HttpContextData {
  method: HttpMethod;
  requires?: readonly string[];
  bodySchema?: AnyUserSchema;
  responseSchemas?: Record<number, AnyUserSchema>;
  responseHeaderSchemas?: Record<number, AnyUserSchema>;
  responseCookieSchemas?: Record<number, AnyUserSchema>;
  querySchema?: AnyUserSchema;
  headerSchema?: AnyUserSchema;
  cookieSchema?: AnyUserSchema;
  rateLimit?: { windowMs: number; maxRequests: number };
  cors?: CorsConfig;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RouteNode type params require any for structural variance
export type HttpWalkNode = RouteNode<unknown, any, any, any, HttpContextData>;

export function getHttpMeta(node: HttpWalkNode): HttpContextData | undefined {
  return node._meta;
}

export function collectHttpMaps(nodes: HttpWalkNode[]): {
  methodMap: Record<string, string>;
  bodySchemaMap: Record<string, AnyUserSchema>;
  headerSchemaMap: Record<string, AnyUserSchema>;
  cookieSchemaMap: Record<string, AnyUserSchema>;
  responseHeaderSchemaMap: Record<string, Record<number, AnyUserSchema>>;
  responseCookieSchemaMap: Record<string, Record<number, AnyUserSchema>>;
  rateLimitMap: Record<string, { windowMs: number; maxRequests: number }>;
  corsMap: Record<string, CorsConfig>;
  requiresMap: Record<string, readonly string[]>;
  wrapStatusMap: Record<string, number>;
} {
  return {
    methodMap:                walkCollect(nodes, (n) => getHttpMeta(n)?.method),
    bodySchemaMap:            walkCollect(nodes, (n) => getHttpMeta(n)?.bodySchema),
    headerSchemaMap:          walkCollect(nodes, (n) => getHttpMeta(n)?.headerSchema),
    cookieSchemaMap:          walkCollect(nodes, (n) => getHttpMeta(n)?.cookieSchema),
    responseHeaderSchemaMap:  walkCollect(nodes, (n) => getHttpMeta(n)?.responseHeaderSchemas),
    responseCookieSchemaMap:  walkCollect(nodes, (n) => getHttpMeta(n)?.responseCookieSchemas),
    rateLimitMap:             walkCollect(nodes, (n) => getHttpMeta(n)?.rateLimit),
    corsMap:                  walkCollect(nodes, (n) => getHttpMeta(n)?.cors),
    requiresMap:              walkCollect(nodes, (n) => getHttpMeta(n)?.requires),
    wrapStatusMap:            walkCollect(nodes, (n) => {
      const schemas = getHttpMeta(n)?.responseSchemas;
      if (!schemas) return undefined;
      const twxxKeys = Object.keys(schemas).map(Number).filter((k) => k >= 200 && k < 300);
      return twxxKeys.length === 1 ? twxxKeys[0] : undefined;
    }),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- distributive conditional requires U extends any to distribute over union
type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
type SuccessStatuses = 200 | 201 | 202 | 203 | 204;

// Returns the body type when Resp has exactly one 2xx status key; otherwise never.
// Enables handlers to return the domain object directly instead of calling respond().
export type InferSingleSuccessBody<Resp> =
  [keyof Resp & SuccessStatuses] extends [never]
    ? never
    : [keyof Resp & SuccessStatuses] extends [UnionToIntersection<keyof Resp & SuccessStatuses>]
      ? Resp[keyof Resp & SuccessStatuses]
      : never;

export interface HttpContext<
  Method extends HttpMethod,
  Body,
  Response extends Record<number, unknown>,
  Query = never,
  Headers = never,
  Cookies = never,
  Session = never,
> {
  method: Method;
  body: Body;
  response: Response;
  query: Query;
  headers: Headers;
  cookies: Cookies;
  session: Session;
}

// A response descriptor object with an explicit _desc discriminant.
interface ResponseDescriptorObj { _desc: true; body: AnyUserSchema; headers?: AnyUserSchema; cookies?: AnyUserSchema }
// A response for a single status code: either a bare user schema or an explicit descriptor.
type ResponseDescriptor = AnyUserSchema | ResponseDescriptorObj;

type InferResponseDescriptor<D> =
  D extends AnyUserSchema
    ? InferUserSchema<D>
    : D extends { _desc: true; body: infer B extends AnyUserSchema; headers: infer H extends AnyUserSchema; cookies: infer CK extends AnyUserSchema }
      ? { body: InferUserSchema<B>; headers: InferUserSchema<H>; cookies: InferUserSchema<CK> }
      : D extends { _desc: true; body: infer B extends AnyUserSchema; headers: infer H extends AnyUserSchema }
        ? { body: InferUserSchema<B>; headers: InferUserSchema<H> }
        : D extends { _desc: true; body: infer B extends AnyUserSchema; cookies: infer CK extends AnyUserSchema }
          ? { body: InferUserSchema<B>; cookies: InferUserSchema<CK> }
          : D extends { _desc: true; body: infer B extends AnyUserSchema }
            ? InferUserSchema<B>
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

export function desc<B extends AnyUserSchema>(body: B): { _desc: true; body: B };
export function desc<B extends AnyUserSchema, O extends { headers?: AnyUserSchema; cookies?: AnyUserSchema }>(
  body: B, opts: O,
): { _desc: true; body: B } & O;
export function desc(body: AnyUserSchema, opts?: Record<string, unknown>) {
  return opts ? { _desc: true as const, body, ...opts } : { _desc: true as const, body };
}

export type SafeBodyOption<M extends HttpMethod> =
  M extends 'GET' | 'HEAD' | 'DELETE' ? { body?: never } : { body?: AnyUserSchema };

export interface SessionCtx { userId: string; roles: string[] }

/* eslint-disable @typescript-eslint/no-explicit-any -- httpRoute uses any for RouteNode structural type params */
// Builds a method-aware parser for HTTP route trees.  Lives here (not core/)
// because the method constraint is an HTTP concept injected as a generic
// predicate — the walk layer stays protocol-agnostic.
export function createMethodAwareParser<Route>(nodes: HttpWalkNode[]): {
  parse(url: URL, method: string): Result<Route, string>;
} {
  const indexedNodes = indexNodes(nodes as WalkNode[]);
  return {
    parse(url: URL, method: string): Result<Route, string> {
      let segments: string[];
      try {
        segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      } catch {
        return Result.err(`invalid URL encoding: ${url.pathname}`);
      }
      const canMatchLeaf = (node: WalkNode) => {
        const m = getHttpMeta(node as HttpWalkNode)?.method;
        return !m || m === method;
      };
      const raw = walkParseIndexed(indexedNodes, segments, url.searchParams, {}, undefined, canMatchLeaf);
      if (!raw) return Result.err(`no route: ${url.pathname}`);
      return Result.ok(raw) as Result<Route, string>;
    },
  };
}

export function httpRoute<
  S extends AnyObjectSchema,
  Method extends HttpMethod,
  C extends RouteNode<unknown, any, any, any, any, any>[] = [],
  Body = never,
  Res extends Record<number, ResponseDescriptor> = Record<number, ResponseDescriptor>,
  Q extends AnyUserSchema | undefined = undefined,
  H extends AnyUserSchema | undefined = undefined,
  CK extends AnyUserSchema | undefined = undefined,
  Req extends readonly string[] | undefined = undefined,
>(
  schema: S,
  method: Method,
  path: string,
  options: { body?: UserSchema<Body>; response: Res; query?: Q; headers?: H; cookies?: CK; requires?: Req; rateLimit?: { windowMs: number; maxRequests: number }; cors?: CorsConfig } & SafeBodyOption<Method>,
  children?: [...C],
): BuildableRouteNode<RouteNode<
  Infer<S> & (Q extends AnyUserSchema ? { query: InferUserSchema<Q> } : unknown),
  [...C],
  HttpContext<Method, Body, InferResponseMap<Res>, Q extends AnyUserSchema ? InferUserSchema<Q> : never, H extends AnyUserSchema ? InferUserSchema<H> : never, CK extends AnyUserSchema ? InferUserSchema<CK> : never, Req extends readonly string[] ? SessionCtx : never>,
  never,
  HttpContextData & SessionMeta<HttpSession<InferResponseMap<Res>>>
>> {
  const responseSchemas: Record<number, AnyUserSchema> = {};
  const responseHeaderSchemas: Record<number, AnyUserSchema> = {};
  const responseCookieSchemas: Record<number, AnyUserSchema> = {};
  /* eslint-enable @typescript-eslint/no-explicit-any */
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
      responseSchemas[s] = descriptor as AnyUserSchema;
    }
  }

  return buildable({
    _type: undefined as never,
    schema,
    path,
    segments: parseSegments(path),
    children: (children ?? []) as [...C],
    context: undefined as never,
    _meta: {
      method,
      ...(options.requires ? { requires: options.requires } : {}),
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
  });
}
