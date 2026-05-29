/* eslint-disable @typescript-eslint/no-explicit-any */

import type z from 'zod';
import type { RouteNode } from '../core/define-routes.js';
import { parseSegments } from '../core/segments.js';
import type { HttpContext, HttpMethod } from './http-context.js';


export interface OpenApiMeta {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  [key: string]: unknown;
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
  C extends RouteNode<unknown, any, any, any>[] = [],
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
  OpenApiContext<Method, Body, InferResponseMap<Res>>
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
      ...(options.meta ? { meta: options.meta } : {}),
      ...(options.body ? { bodySchema: options.body } : {}),
      responseSchemas: options.response,
    },
  };
}

export { generateSpec } from '../openapi/generate-spec.js';
