/* eslint-disable @typescript-eslint/no-explicit-any */

import type z from 'zod';
import type { RouteNode } from '../core/route-node.js';
import { parseSegments } from '../core/segments.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpContextData {
  method: HttpMethod;
  bodySchema?: z.ZodType;
  responseSchemas: Record<number, z.ZodType>;
  responseHeaderSchemas?: Record<number, z.ZodObject<any, any>>;
  querySchema?: z.ZodObject<any, any>;
  headerSchema?: z.ZodObject<any, any>;
  rateLimit?: { windowMs: number; maxRequests: number };
}

export function getHttpCtx(node: { _ctx?: Record<string, unknown> }): HttpContextData | undefined {
  return node._ctx as HttpContextData | undefined;
}

export interface HttpContext<
  Method extends HttpMethod,
  Body,
  Response extends Record<number, unknown>,
  Query = never,
  Headers = never,
> {
  method: Method;
  body: Body;
  response: Response;
  query: Query;
  headers: Headers;
}

// A response for a single status code: either a bare Zod body schema or an
// object with explicit body + optional headers schemas.
type ResponseDescriptor = z.ZodType | { body: z.ZodType; headers?: z.ZodObject<any, any> };

type InferResponseDescriptor<D> =
  D extends z.ZodType
    ? z.infer<D>
    : D extends { body: infer B extends z.ZodType; headers: infer H extends z.ZodObject<any, any> }
      ? { body: z.infer<B>; headers: z.infer<H> }
      : D extends { body: infer B extends z.ZodType }
        ? z.infer<B>
        : never;

type InferResponseMap<R extends Record<number, ResponseDescriptor>> = {
  [K in keyof R]: InferResponseDescriptor<R[K]>;
};

// Maps an inferred response map to a discriminated union of { status, body[, headers] }.
// Used by server.ts to type handler return values. Lives here (not core/) because
// the headers shape is an HTTP-specific concern.
export type HttpResponseUnion<Resp> = {
  [S in keyof Resp]: Resp[S] extends { body: infer B; headers: infer H }
    ? { status: S; body: B; headers: H }
    : { status: S; body: Resp[S] };
}[keyof Resp];

export function httpRoute<
  S extends z.ZodObject<any, any>,
  Method extends HttpMethod,
  C extends RouteNode<unknown, any, any, any>[] = [],
  Body = never,
  Res extends Record<number, ResponseDescriptor> = Record<number, ResponseDescriptor>,
  Q extends z.ZodObject<any, any> | undefined = undefined,
  H extends z.ZodObject<any, any> | undefined = undefined,
>(
  schema: S,
  method: Method,
  path: string,
  options: { body?: z.ZodType<Body>; response: Res; query?: Q; headers?: H; rateLimit?: { windowMs: number; maxRequests: number } },
  children?: [...C],
): RouteNode<
  z.infer<S> & (Q extends z.ZodObject<any, any> ? { query: z.infer<Q> } : unknown),
  [...C],
  HttpContext<Method, Body, InferResponseMap<Res>, Q extends z.ZodObject<any, any> ? z.infer<Q> : never, H extends z.ZodObject<any, any> ? z.infer<H> : never>
> {
  const responseSchemas: Record<number, z.ZodType> = {};
  const responseHeaderSchemas: Record<number, z.ZodObject<any, any>> = {};
  let hasHeaderSchemas = false;

  for (const [status, descriptor] of Object.entries(
    options.response as Record<string, unknown>,
  )) {
    const s = Number(status);
    const d = descriptor as Record<string, unknown>;
    if (typeof d['safeParse'] === 'function') {
      // bare ZodType
      responseSchemas[s] = descriptor as z.ZodType;
    } else if ('body' in d) {
      responseSchemas[s] = d['body'] as z.ZodType;
      if (d['headers']) {
        responseHeaderSchemas[s] = d['headers'] as z.ZodObject<any, any>;
        hasHeaderSchemas = true;
      }
    }
  }

  return {
    _type: undefined as never,
    schema,
    path,
    segments: parseSegments(path),
    children: (children ?? []) as [...C],
    context: undefined as never,
    _ctx: {
      method,
      ...(options.body ? { bodySchema: options.body } : {}),
      ...(options.query ? { querySchema: options.query } : {}),
      ...(options.headers ? { headerSchema: options.headers } : {}),
      ...(options.rateLimit ? { rateLimit: options.rateLimit } : {}),
      responseSchemas,
      ...(hasHeaderSchemas ? { responseHeaderSchemas } : {}),
    },
  };
}
