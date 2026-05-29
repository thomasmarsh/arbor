/* eslint-disable @typescript-eslint/no-explicit-any */

import type z from 'zod';
import type { RouteNode } from '../core/define-routes.js';
import { parseSegments } from '../core/segments.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpContextData {
  method: HttpMethod;
  bodySchema?: z.ZodType;
  responseSchemas: Record<number, z.ZodType>;
  querySchema?: z.ZodObject<any, any>;
}

export interface HttpContext<
  Method extends HttpMethod,
  Body,
  Response extends Record<number, unknown>,
  Query = never,
> {
  method: Method;
  body: Body;
  response: Response;
  query: Query;
}

type InferResponseMap<R extends Record<number, z.ZodType>> = {
  [K in keyof R]: z.infer<R[K]>;
};

export function httpRoute<
  S extends z.ZodObject<any, any>,
  Method extends HttpMethod,
  C extends RouteNode<unknown, any, any, any>[] = [],
  Body = never,
  Res extends Record<number, z.ZodType> = Record<number, z.ZodType>,
  Q extends z.ZodObject<any, any> | undefined = undefined,
>(
  schema: S,
  method: Method,
  path: string,
  options: { body?: z.ZodType<Body>; response: Res; query?: Q },
  children?: [...C],
): RouteNode<
  z.infer<S> & (Q extends z.ZodObject<any, any> ? { query: z.infer<Q> } : unknown),
  [...C],
  HttpContext<Method, Body, InferResponseMap<Res>, Q extends z.ZodObject<any, any> ? z.infer<Q> : never>
> {
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
      responseSchemas: options.response,
    },
  };
}
