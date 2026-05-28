/* eslint-disable @typescript-eslint/no-explicit-any */

import type z from 'zod';
import type { ChildUnion, RouteNode } from './define-routes.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpContextData {
  method: HttpMethod;
  bodySchema?: z.ZodType;
  responseSchemas: Record<number, z.ZodType>;
}

export interface HttpContext<
  Method extends HttpMethod,
  Body,
  Response extends Record<number, unknown>,
> {
  method: Method;
  body: Body;
  response: Response;
}

type InferResponseMap<R extends Record<number, z.ZodType>> = {
  [K in keyof R]: z.infer<R[K]>;
};

export function httpRoute<
  S extends z.ZodObject<any, any>,
  Method extends HttpMethod,
  C extends RouteNode<unknown, unknown, any, any>[] = [],
  Body = never,
  Res extends Record<number, z.ZodType> = Record<number, z.ZodType>,
>(
  schema: S,
  method: Method,
  path: string,
  options: { body?: z.ZodType<Body>; response: Res },
  children?: [...C],
): RouteNode<
  z.infer<S>,
  [ChildUnion<C>] extends [never] ? never : ChildUnion<C>,
  [...C],
  HttpContext<Method, Body, InferResponseMap<Res>>
> {
  return {
    _type: undefined as never,
    _child: undefined as never,
    schema,
    path,
    children: (children ?? []) as [...C],
    context: {
      method,
      ...(options.body ? { bodySchema: options.body } : {}),
      responseSchemas: options.response,
    } as unknown as HttpContext<Method, Body, InferResponseMap<Res>>,
  };
}
