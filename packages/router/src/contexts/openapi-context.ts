/* eslint-disable @typescript-eslint/no-explicit-any */

import type z from 'zod';
import type { RouteNode } from '../core/define-routes.js';
import type { HttpContext, HttpContextData, HttpMethod } from './http-context.js';
import { getHttpMeta, httpRoute } from './http-context.js';

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

export function getOpenApiMeta(node: { _meta?: Record<string, unknown> }): OpenApiCtxData | undefined {
  return getHttpMeta(node);
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
  options: { body?: z.ZodType<Body>; response: Res; meta?: OpenApiMeta },
  children?: [...C],
): RouteNode<
  z.infer<S>,
  [...C],
  OpenApiContext<Method, Body, InferResponseMap<Res>>,
  never,
  OpenApiCtxData
> {
  const node = httpRoute(schema, method, path, { ...(options.body ? { body: options.body } : {}), response: options.response }, children);
  if (options.meta) {
    (node._meta as OpenApiCtxData).meta = options.meta;
  }
  return node as RouteNode<z.infer<S>, [...C], OpenApiContext<Method, Body, InferResponseMap<Res>>, never, OpenApiCtxData>;
}

export { generateSpec } from '../openapi/generate-spec.js';
