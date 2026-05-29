/* eslint-disable @typescript-eslint/no-explicit-any */

import z from 'zod';
import type { ChildUnion, RouteNode } from '../core/define-routes.js';
import type { Segment } from '../core/segments.js';
import { parseSegments } from '../core/segments.js';
import { getShape, getTag, type WalkNode } from '../core/walk.js';
import type { HttpContext, HttpMethod } from './http-context.js';

interface OpenApiContextData {
  method: HttpMethod;
  bodySchema?: z.ZodType;
  responseSchemas: Record<number, z.ZodType>;
  meta?: OpenApiMeta;
}

// --- Types ---

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

// --- Constructor ---

type InferResponseMap<R extends Record<number, z.ZodType>> = {
  [K in keyof R]: z.infer<R[K]>;
};

export function openApiRoute<
  S extends z.ZodObject<any, any>,
  Method extends HttpMethod,
  C extends RouteNode<unknown, unknown, any, any, any>[] = [],
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
  [ChildUnion<C>] extends [never] ? never : ChildUnion<C>,
  [...C],
  OpenApiContext<Method, Body, InferResponseMap<Res>>
> {
  return {
    _type: undefined as never,
    _child: undefined as never,
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

// --- Zod → JSON Schema ---

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

// --- Path conversion ---

function segmentToOpenApi(seg: Segment): string {
  return seg.kind === 'lit' ? seg.value : `{${seg.name}}`;
}

function segmentToParam(seg: Segment): Record<string, unknown> | null {
  switch (seg.kind) {
    case 'lit':
      return null;
    case 'str':
      return { name: seg.name, in: 'path', required: true, schema: { type: 'string' } };
    case 'num':
      return { name: seg.name, in: 'path', required: true, schema: { type: 'integer' } };
    case 'opt-str':
      return { name: seg.name, in: 'path', required: false, schema: { type: 'string' } };
    case 'opt-num':
      return { name: seg.name, in: 'path', required: false, schema: { type: 'integer' } };
    default:
      return null;
  }
}

// --- Tree walk → OpenAPI paths ---

function walkSpec(
  nodes: WalkNode[],
  parentSegments: Segment[],
  paths: Record<string, Record<string, unknown>>,
): void {
  for (const node of nodes) {
    const segments = [...parentSegments, ...node.segments];

    // Only include nodes with context (openApiRoute / httpRoute nodes)
    const ctx = node._ctx as OpenApiContextData | undefined;
    if (node.schema !== null && ctx?.method) {
      const hasWildcard = segments.some((s) => s.kind === 'wildcard');
      if (hasWildcard) {
        const rawPath = segments.map((s) => (s.kind === 'lit' ? s.value : s.name)).join('/');
        console.warn(`[openapi] skipping route with wildcard segment: ${rawPath}`);
        continue;
      }

      const tag = getTag(node.schema);
      const method = ctx.method.toLowerCase();
      const path = '/' + segments.map(segmentToOpenApi).join('/');

      // Path params
      const pathParams = segments.map(segmentToParam).filter(Boolean);
      const pathParamNames = new Set(
        segments
          .filter((s): s is Exclude<Segment, { kind: 'lit' }> => s.kind !== 'lit')
          .map((s) => s.name),
      );

      // Query params from schema shape
      const shape = getShape(node.schema);
      const queryParams: Record<string, unknown>[] = [];
      for (const [key, val] of Object.entries(shape)) {
        if (key === 'tag' || pathParamNames.has(key)) continue;
        queryParams.push({
          name: key,
          in: 'query',
          required: !(val instanceof z.ZodOptional) && !(val instanceof z.ZodDefault),
          schema: zodToJsonSchema(val),
        });
      }

      const parameters = [...pathParams, ...queryParams];

      // Build operation
      const operation: Record<string, unknown> = {};
      if (ctx.meta?.operationId) {
        operation['operationId'] = ctx.meta.operationId;
      } else if (tag) {
        operation['operationId'] = tag;
      }
      if (ctx.meta?.summary) operation['summary'] = ctx.meta.summary;
      if (ctx.meta?.description) operation['description'] = ctx.meta.description;
      if (ctx.meta?.tags) operation['tags'] = ctx.meta.tags;
      if (parameters.length > 0) operation['parameters'] = parameters;

      // Request body
      if (ctx.bodySchema) {
        operation['requestBody'] = {
          required: true,
          content: {
            'application/json': {
              schema: zodToJsonSchema(ctx.bodySchema),
            },
          },
        };
      }

      // Responses
      const responses: Record<string, unknown> = {};
      for (const [status, respSchema] of Object.entries(ctx.responseSchemas)) {
        responses[status] = {
          description: 'Response',
          content: {
            'application/json': {
              schema: zodToJsonSchema(respSchema),
            },
          },
        };
      }
      operation['responses'] = responses;

      paths[path] ??= {};
      paths[path][method] = operation;
    }

    // Recurse into children (sections, nested routes)
    if (node.children.length > 0) {
      walkSpec(node.children as WalkNode[], segments, paths);
    }
  }
}

export function generateSpec(
  router: { children: RouteNode<unknown, unknown, any, any, any>[] },
  info: { title: string; version: string },
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  walkSpec(router.children as WalkNode[], [], paths);

  return {
    openapi: '3.1.0',
    info,
    paths,
  };
}
