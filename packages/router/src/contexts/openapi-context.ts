/* eslint-disable @typescript-eslint/no-explicit-any */

import type z from 'zod';
import type { RouteNode } from '../core/define-routes.js';
import type { HttpContext, HttpContextData, HttpMethod, SafeBodyOption } from './http-context.js';
import { httpRoute } from './http-context.js';

export interface OpenApiMeta {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface OpenApiCtxData extends HttpContextData {
  meta?: OpenApiMeta;
}

export type OpenApiWalkNode = RouteNode<unknown, any, any, any, OpenApiCtxData>;

export function getOpenApiMeta(node: OpenApiWalkNode): OpenApiCtxData | undefined {
  return node._meta;
}

export interface OpenApiContext<
  Method extends HttpMethod,
  Body,
  Response extends Record<number, unknown>,
> extends HttpContext<Method, Body, Response> {
  meta: OpenApiMeta;
}

type InferResponseMap<R extends Record<number, z.ZodType>> = {
  [K in keyof R]: z.infer<R[K]>;
};

export function openApiRoute<
  S extends z.ZodObject<any, any>,
  Method extends HttpMethod,
  C extends RouteNode<unknown, any, any, any, any>[] = [],
  Body = never,
  Res extends Record<number, z.ZodType> = Record<number, z.ZodType>,
>(
  schema: S,
  method: Method,
  path: string,
  options: { body?: z.ZodType<Body>; response: Res; meta?: OpenApiMeta } & SafeBodyOption<Method>,
  children?: [...C],
): RouteNode<
  z.infer<S>,
  [...C],
  OpenApiContext<Method, Body, InferResponseMap<Res>>,
  never,
  OpenApiCtxData
> {
  const { meta: _meta, ...httpOpts } = options;
  // SafeBodyOption<Method> is already enforced at this function's call site; the cast avoids
  // re-evaluating a distributive conditional type in a generic body.
  const node = httpRoute(schema, method, path, httpOpts as unknown as { body?: z.ZodType<Body>; response: Res } & SafeBodyOption<Method>, children);
  if (options.meta) {
    (node._meta as OpenApiCtxData).meta = options.meta;
  }
  return node as RouteNode<z.infer<S>, [...C], OpenApiContext<Method, Body, InferResponseMap<Res>>, never, OpenApiCtxData>;
}
