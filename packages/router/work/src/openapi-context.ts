/* eslint-disable @typescript-eslint/no-explicit-any */

import z from 'zod';
import type { ChildUnion, RouteNode } from './define-routes.js';
import type { HttpContext, HttpMethod } from './http-context.js';
import { parseSegments, type Segment } from './segments.js';
import { getShape, getTag, type WalkNode } from './walk.js';

// --- Types ---

export interface OpenApiMeta {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
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
  C extends RouteNode<unknown, unknown, any, any>[] = [],
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
    _context: undefined as never,
    schema,
    method,
    ...(options.meta ? { meta: options.meta } : {}),
    ...(options.body ? { bodySchema: options.body } : {}),
    responseSchemas: options.response,
    path,
    children: (children ?? []) as [...C],
  };
}

// --- Zod → JSON Schema (minimal) ---

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodLiteral) {
    // Zod v4: .value exists at runtime on ZodLiteral
    return { const: (schema as unknown as { value: unknown }).value };
  }
  if (schema instanceof z.ZodEnum) {
    // Zod v4: .options is readonly array at runtime
    return { type: 'string', enum: [...(schema as unknown as { options: string[] }).options] };
  }
  if (schema instanceof z.ZodOptional) {
    // Zod v4: _def.innerType holds the unwrapped type
    return zodToJsonSchema((schema as unknown as { _def: { innerType: z.ZodType } })._def.innerType);
  }
  if (schema instanceof z.ZodDefault) {
    return zodToJsonSchema((schema as unknown as { _def: { innerType: z.ZodType } })._def.innerType);
  }
  if (schema instanceof z.ZodObject) {
    const shape = getShape(schema);
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(val);
      if (!(val instanceof z.ZodOptional) && !(val instanceof z.ZodDefault)) {
        required.push(key);
      }
    }
    const result: Record<string, unknown> = { type: 'object', properties };
    if (required.length > 0) result.required = required;
    return result;
  }
  return {};
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
    case 'wildcard':
      return { name: seg.name, in: 'path', required: true, schema: { type: 'string' } };
  }
}

// --- Tree walk → OpenAPI paths ---

function walkSpec(
  nodes: WalkNode[],
  parentSegments: Segment[],
  paths: Record<string, Record<string, unknown>>,
): void {
  for (const node of nodes) {
    const segments = [...parentSegments, ...parseSegments(node.path)];

    // Only include nodes with response schemas (openApiRoute nodes)
    if (node.schema !== null && node.method && node.responseSchemas) {
      const tag = getTag(node.schema);
      const method = node.method.toLowerCase();
      const path = '/' + segments.map(segmentToOpenApi).join('/');

      // Path params
      const pathParams = segments.map(segmentToParam).filter(Boolean);
      const pathParamNames = new Set(
        segments.filter((s): s is Exclude<Segment, { kind: 'lit' }> => s.kind !== 'lit').map((s) => s.name),
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
      if (node.meta?.operationId) {
        operation.operationId = node.meta.operationId;
      } else if (tag) {
        operation.operationId = tag;
      }
      if (node.meta?.summary) operation.summary = node.meta.summary;
      if (node.meta?.description) operation.description = node.meta.description;
      if (node.meta?.tags) operation.tags = node.meta.tags;
      if (parameters.length > 0) operation.parameters = parameters;

      // Request body
      if (node.bodySchema) {
        operation.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: zodToJsonSchema(node.bodySchema),
            },
          },
        };
      }

      // Responses
      const responses: Record<string, unknown> = {};
      for (const [status, respSchema] of Object.entries(node.responseSchemas)) {
        responses[status] = {
          description: 'Response',
          content: {
            'application/json': {
              schema: zodToJsonSchema(respSchema),
            },
          },
        };
      }
      operation.responses = responses;

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
  router: { children: RouteNode<unknown, unknown, any, any>[] },
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
