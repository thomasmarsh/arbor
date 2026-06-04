/* eslint-disable @typescript-eslint/no-explicit-any */

import type { RouteNode } from '../../core/define-routes.js';
import { type BuildableRouteNode, buildable } from '../../core/define-routes.js';
import type { AnyObjectSchema, AnyUserSchema, InferUserSchema, UserSchema, Infer } from '../../core/schema.js';
import { parseSegments } from '../../core/segments.js';
import type {
  HttpContext,
  HttpContextData,
  HttpMethod,
  SafeBodyOption,
} from '../http-context.js';

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

type InferResponseMap<R extends Record<number, AnyUserSchema>> = {
  [K in keyof R]: InferUserSchema<R[K]>;
};

export function openApiRoute<
  S extends AnyObjectSchema,
  Method extends HttpMethod,
  C extends RouteNode<unknown, any, any, any, any, any>[] = [],
  Body = never,
  Res extends Record<number, AnyUserSchema> = Record<number, AnyUserSchema>,
>(
  schema: S,
  method: Method,
  path: string,
  options: { body?: UserSchema<Body>; response: Res; meta?: OpenApiMeta } & SafeBodyOption<Method>,
  children?: [...C],
): BuildableRouteNode<
  RouteNode<
    Infer<S>,
    [...C],
    OpenApiContext<Method, Body, InferResponseMap<Res>>,
    never,
    OpenApiCtxData
  >
> {
  return buildable({
    _type: undefined as never,
    schema,
    path,
    segments: parseSegments(path),
    children: (children ?? []) as [...C],
    context: undefined as never,
    _meta: {
      method,
      ...(options.body ? { bodySchema: options.body } : {}),
      responseSchemas: options.response as Record<number, AnyUserSchema>,
      ...(options.meta ? { meta: options.meta } : {}),
    } satisfies OpenApiCtxData,
  });
}
