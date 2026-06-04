import z from 'zod';
import type { RouteNode } from '../core/define-routes.js';
import type { AnyObjectSchema, AnyScalarSchema, AnyUserSchema, StringConstraints } from '../core/schema.js';
import type { Segment } from '../core/segments.js';
import { getTag } from '../core/walk.js';
import { getOpenApiMeta, type OpenApiCtxData, type OpenApiWalkNode } from '../contexts/openapi/openapi-context.js';

function tryJsonSchema(schema: AnyUserSchema): Record<string, unknown> {
  if (schema instanceof z.ZodType) {
    const { $schema: _, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
    if (schema instanceof z.ZodDiscriminatedUnion) {
      return { ...rest, discriminator: { propertyName: schema.def.discriminator } };
    }
    return rest;
  }
  if (typeof (schema as unknown as { toJsonSchema?: unknown }).toJsonSchema === 'function') {
    return (schema as unknown as { toJsonSchema: () => Record<string, unknown> }).toJsonSchema();
  }
  return {};
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

function buildPathParams(segments: Segment[]): [Record<string, unknown>[], Set<string>] {
  const params = segments.map(segmentToParam).filter(Boolean) as Record<string, unknown>[];
  const names = new Set(
    segments
      .filter((s): s is Exclude<Segment, { kind: 'lit' }> => s.kind !== 'lit')
      .map((s) => s.name),
  );
  return [params, names];
}

function flattenStringConstraints(c?: StringConstraints): Record<string, unknown> {
  if (!c) return {};
  const out: Record<string, unknown> = {};
  if (c.format) out['format'] = c.format;
  if (c.minLength !== undefined) out['minLength'] = c.minLength;
  if (c.maxLength !== undefined) out['maxLength'] = c.maxLength;
  if (c.pattern) out['pattern'] = c.pattern;
  return out;
}

function scalarToJsonSchema(s: AnyScalarSchema): Record<string, unknown> {
  switch (s.kind) {
    case 'string':  return { type: 'string', ...flattenStringConstraints(s.constraints) };
    case 'number':  return { type: 'number', ...s.constraints };
    case 'integer': return { type: 'integer', ...s.constraints };
    case 'boolean': return { type: 'boolean' };
    case 'literal': return { const: s.value };
    case 'optional': return scalarToJsonSchema(s.inner);
    case 'brand':   return scalarToJsonSchema(s.inner);
  }
}

function buildQueryParams(
  schema: AnyObjectSchema,
  pathParamNames: Set<string>,
): Record<string, unknown>[] {
  const params: Record<string, unknown>[] = [];
  for (const [key, field] of Object.entries(schema.fields)) {
    if (key === 'tag' || pathParamNames.has(key)) continue;
    const required = field.kind !== 'optional';
    params.push({ name: key, in: 'query', required, schema: scalarToJsonSchema(field) });
  }
  return params;
}

function buildHeaderParams(headerSchema: AnyUserSchema): Record<string, unknown>[] {
  if (!(headerSchema instanceof z.ZodObject)) return [];
  const shape = headerSchema.shape as Record<string, z.ZodType>;
  return Object.entries(shape).map(([name, fieldSchema]) => ({
    name,
    in: 'header',
    required: !(fieldSchema instanceof z.ZodOptional) && !(fieldSchema instanceof z.ZodDefault),
    schema: tryJsonSchema(fieldSchema),
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

function buildRequestBody(bodySchema: AnyUserSchema): Record<string, unknown> {
  return {
    required: true,
    content: { 'application/json': { schema: tryJsonSchema(bodySchema) } },
  };
}

function buildResponses(ctx: OpenApiCtxData): Record<string, unknown> {
  const responses: Record<string, unknown> = {};
  for (const [status, respSchema] of Object.entries(ctx.responseSchemas ?? {})) {
    const headerSchema = ctx.responseHeaderSchemas?.[Number(status)];
    const entry: Record<string, unknown> = {
      description: 'Response',
      content: { 'application/json': { schema: tryJsonSchema(respSchema) } },
    };
    if (headerSchema && headerSchema instanceof z.ZodObject) {
      const shape = headerSchema.shape as Record<string, z.ZodType>;
      entry['headers'] = Object.fromEntries(
        Object.entries(shape).map(([name, fs]) => [name, { schema: tryJsonSchema(fs) }]),
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
        // eslint-disable-next-line no-console -- intentional user-facing warning for unsupported route shape
        console.warn(`[openapi] skipping route with wildcard segment: ${rawPath}`);
        continue;
      }

      const tag = getTag(node.schema);
      const method = ctx.method.toLowerCase();
      const path = '/' + segments.map(segmentToOpenApi).join('/');

      const [pathParams, pathParamNames] = buildPathParams(segments);
      const queryParams = buildQueryParams(node.schema, pathParamNames);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RouteNode type params require any for structural variance
  router: { children: RouteNode<unknown, any, any, any, any, any>[] },
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
