/* eslint-disable @typescript-eslint/no-explicit-any */

import z from 'zod';
import type { RouteNode } from '../core/define-routes.js';
import type { Segment } from '../core/segments.js';
import { getShape, getTag, type WalkNode } from '../core/walk.js';
import { getOpenApiMeta } from '../contexts/openapi-context.js';

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

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

function walkSpec(
  nodes: WalkNode[],
  parentSegments: Segment[],
  paths: Record<string, Record<string, unknown>>,
): void {
  for (const node of nodes) {
    const segments = [...parentSegments, ...node.segments];

    const ctx = getOpenApiMeta(node);
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

      const pathParams = segments.map(segmentToParam).filter(Boolean);
      const pathParamNames = new Set(
        segments
          .filter((s): s is Exclude<Segment, { kind: 'lit' }> => s.kind !== 'lit')
          .map((s) => s.name),
      );

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

      const headerParams: Record<string, unknown>[] = [];
      if (ctx.headerSchema) {
        const shape = ctx.headerSchema.shape as Record<string, z.ZodType>;
        for (const [name, fieldSchema] of Object.entries(shape)) {
          headerParams.push({
            name,
            in: 'header',
            required: !(fieldSchema instanceof z.ZodOptional) && !(fieldSchema instanceof z.ZodDefault),
            schema: zodToJsonSchema(fieldSchema),
          });
        }
      }

      const parameters = [...pathParams, ...queryParams, ...headerParams];

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

      const responses: Record<string, unknown> = {};
      for (const [status, respSchema] of Object.entries(ctx.responseSchemas ?? {})) {
        const statusNum = Number(status);
        const headerSchema = ctx.responseHeaderSchemas?.[statusNum];
        const entry: Record<string, unknown> = {
          description: 'Response',
          content: {
            'application/json': {
              schema: zodToJsonSchema(respSchema),
            },
          },
        };
        if (headerSchema) {
          const shape = headerSchema.shape as Record<string, z.ZodType>;
          entry['headers'] = Object.fromEntries(
            Object.entries(shape).map(([name, fieldSchema]) => [
              name,
              { schema: zodToJsonSchema(fieldSchema) },
            ]),
          );
        }
        responses[status] = entry;
      }
      operation['responses'] = responses;

      paths[path] ??= {};
      paths[path][method] = operation;
    }

    if (node.children.length > 0) {
      walkSpec(node.children as WalkNode[], segments, paths);
    }
  }
}

export function generateSpec(
  router: { children: RouteNode<unknown, any, any, any, any>[] },
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
