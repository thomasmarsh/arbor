/* eslint-disable @typescript-eslint/no-explicit-any */

import z from 'zod';
import type { RouteNode } from '../core/define-routes.js';
import type { Segment } from '../core/segments.js';
import { getShape, getTag } from '../core/walk.js';
import { getOpenApiMeta, type OpenApiCtxData, type OpenApiWalkNode } from '../contexts/openapi/openapi-context.js';

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

function isRequired(s: z.ZodType): boolean {
  return !(s instanceof z.ZodOptional) && !(s instanceof z.ZodDefault);
}

function buildPathParams(segments: Segment[]): [Record<string, unknown>[], Set<string>] {
  const params = segments.map(segmentToParam).filter(Boolean) as Record<string, unknown>[];
  const names = new Set(
    segments
      .filter((s): s is Exclude<Segment, { kind: 'lit' }> => s.kind !== 'lit')
      .map((s) => s.name),
  );
  return [params, names];
}

function buildQueryParams(
  shape: Record<string, z.ZodType>,
  pathParamNames: Set<string>,
): Record<string, unknown>[] {
  const params: Record<string, unknown>[] = [];
  for (const [key, val] of Object.entries(shape)) {
    if (key === 'tag' || pathParamNames.has(key)) continue;
    params.push({ name: key, in: 'query', required: isRequired(val), schema: zodToJsonSchema(val) });
  }
  return params;
}

function buildHeaderParams(headerSchema: z.ZodObject<any, any>): Record<string, unknown>[] {
  const shape = headerSchema.shape as Record<string, z.ZodType>;
  return Object.entries(shape).map(([name, fieldSchema]) => ({
    name,
    in: 'header',
    required: isRequired(fieldSchema),
    schema: zodToJsonSchema(fieldSchema),
  }));
}

function buildOperationMeta(
  ctx: OpenApiCtxData,
  tag: string | undefined,
  parameters: Record<string, unknown>[],
): Record<string, unknown> {
  const op: Record<string, unknown> = {};
  if (ctx.meta?.operationId) op['operationId'] = ctx.meta.operationId;
  else if (tag) op['operationId'] = tag;
  if (ctx.meta?.summary) op['summary'] = ctx.meta.summary;
  if (ctx.meta?.description) op['description'] = ctx.meta.description;
  if (ctx.meta?.tags) op['tags'] = ctx.meta.tags;
  if (parameters.length > 0) op['parameters'] = parameters;
  return op;
}

function buildRequestBody(bodySchema: z.ZodType): Record<string, unknown> {
  return {
    required: true,
    content: { 'application/json': { schema: zodToJsonSchema(bodySchema) } },
  };
}

function buildResponses(ctx: OpenApiCtxData): Record<string, unknown> {
  const responses: Record<string, unknown> = {};
  for (const [status, respSchema] of Object.entries(ctx.responseSchemas ?? {})) {
    const headerSchema = ctx.responseHeaderSchemas?.[Number(status)];
    const entry: Record<string, unknown> = {
      description: 'Response',
      content: { 'application/json': { schema: zodToJsonSchema(respSchema) } },
    };
    if (headerSchema) {
      const shape = headerSchema.shape as Record<string, z.ZodType>;
      entry['headers'] = Object.fromEntries(
        Object.entries(shape).map(([name, fs]) => [name, { schema: zodToJsonSchema(fs) }]),
      );
    }
    responses[status] = entry;
  }
  return responses;
}

function walkSpec(
  nodes: OpenApiWalkNode[],
  parentSegments: Segment[],
  paths: Record<string, Record<string, unknown>>,
): void {
  for (const node of nodes) {
    const segments = [...parentSegments, ...node.segments];
    const ctx = getOpenApiMeta(node);

    if (node.schema !== null && ctx?.method) {
      if (segments.some((s) => s.kind === 'wildcard')) {
        const rawPath = segments.map((s) => (s.kind === 'lit' ? s.value : s.name)).join('/');
        console.warn(`[openapi] skipping route with wildcard segment: ${rawPath}`);
        continue;
      }

      const tag = getTag(node.schema);
      const method = ctx.method.toLowerCase();
      const path = '/' + segments.map(segmentToOpenApi).join('/');

      const [pathParams, pathParamNames] = buildPathParams(segments);
      const queryParams = buildQueryParams(getShape(node.schema), pathParamNames);
      const headerParams = ctx.headerSchema ? buildHeaderParams(ctx.headerSchema) : [];
      const parameters = [...pathParams, ...queryParams, ...headerParams];

      const operation = buildOperationMeta(ctx, tag, parameters);
      if (ctx.bodySchema) operation['requestBody'] = buildRequestBody(ctx.bodySchema);
      operation['responses'] = buildResponses(ctx);

      paths[path] ??= {};
      paths[path][method] = operation;
    }

    const children = node.children as OpenApiWalkNode[];
    if (children.length > 0) walkSpec(children, segments, paths);
  }
}

export function generateSpec(
  router: { children: RouteNode<unknown, any, any, any, any>[] },
  info: { title: string; version: string },
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  walkSpec(router.children as OpenApiWalkNode[], [], paths);

  return {
    openapi: '3.1.0',
    info,
    paths,
  };
}
