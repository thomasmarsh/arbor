import z from 'zod';
import type { RouteNode } from './route-node.js';
import { type Segment, matchSegments } from './segments.js';

export type ParseDiag =
  | { kind: 'segment-mismatch'; path: string; urlSegments: string[] }
  | { kind: 'schema-error'; path: string; issues: z.core.$ZodIssue[] };

/* eslint-disable @typescript-eslint/no-explicit-any -- WalkNode structural variance; Meta narrowed to expose querySchema */
export type WalkNode = RouteNode<
  unknown,
  RouteNode<unknown, any, any, any, any, any>[],
  any,
  any,
  any,
  any
>;
/* eslint-enable @typescript-eslint/no-explicit-any */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- z.ZodObject requires any for Zod shape param
export function getShape(schema: z.ZodObject<any, any>): Record<string, z.z.ZodType> {
  const s = schema.shape as Record<string, z.z.ZodType> | (() => Record<string, z.z.ZodType>);
  return typeof s === 'function' ? s() : s;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- z.ZodObject requires any for Zod shape param
export function getTag(schema: z.ZodObject<any, any>): string | undefined {
  const tag = getShape(schema)['tag'];
  return tag instanceof z.ZodLiteral ? (tag.value as string) : undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- z.ZodObject requires any for Zod shape param
export function resolveQuerySchema(node: WalkNode): z.ZodObject<any, any> | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WalkNode.Meta is any; assert querySchema shape for safe access
  const meta = node._meta as { querySchema?: z.ZodObject<any, any> } | undefined;
  return meta?.querySchema;
}

export function validateSchema(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- z.ZodObject requires any for Zod shape param
  schema: z.ZodObject<any, any>,
  value: unknown,
  path: string,
  diag?: ParseDiag[],
): Record<string, unknown> | undefined {
  const result = schema.safeParse(value);
  if (!result.success) {
    diag?.push({ kind: 'schema-error', path, issues: result.error.issues });
    return undefined;
  }
  return result.data;
}

function filterDefined(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- z.ZodObject requires any for Zod shape param
function extractQueryParams(schema: z.ZodObject<any, any>, query: URLSearchParams): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(getShape(schema))) {
    const vals = query.getAll(key);
    if (vals.length > 1) raw[key] = vals;
    else if (vals.length === 1) raw[key] = vals[0];
  }
  return raw;
}

function handleLeafNode(
  node: WalkNode,
  params: Record<string, unknown>,
  query: URLSearchParams,
  diag?: ParseDiag[],
): Record<string, unknown> | null {
  if (node.schema === null) return null;
  const raw: Record<string, unknown> = { ...params, tag: getTag(node.schema) };
  const querySchema = resolveQuerySchema(node);
  if (querySchema) {
    const rawQuery = extractQueryParams(querySchema, query);
    const queryData = validateSchema(querySchema, rawQuery, node.path, diag);
    if (!queryData) return null;
    const data = validateSchema(node.schema, raw, node.path, diag);
    return data ? { ...filterDefined(data), query: queryData } : null;
  }
  for (const key of Object.keys(getShape(node.schema))) {
    if (key === 'tag' || key in raw) continue;
    const vals = query.getAll(key);
    if (vals.length > 1) raw[key] = vals;
    else if (vals.length === 1) raw[key] = vals[0];
  }
  const data = validateSchema(node.schema, raw, node.path, diag);
  return data ? filterDefined(data) : null;
}

interface IndexedLevel {
  literals: Map<string, IndexedWalkNode[]>;
  nonLiterals: IndexedWalkNode[];
}

export type IndexedWalkNode = WalkNode & { _index: IndexedLevel };

function buildLevel(nodes: IndexedWalkNode[]): IndexedLevel {
  const literals = new Map<string, IndexedWalkNode[]>();
  const nonLiterals: IndexedWalkNode[] = [];
  for (const node of nodes) {
    const first = node.segments[0];
    if (first?.kind === 'lit') {
      let bucket = literals.get(first.value);
      if (!bucket) { bucket = []; literals.set(first.value, bucket); }
      bucket.push(node);
    } else {
      nonLiterals.push(node);
    }
  }
  return { literals, nonLiterals };
}

export function indexNodes(nodes: WalkNode[]): IndexedWalkNode[] {
  return nodes.map((node) => {
    const indexedChildren = indexNodes(node.children as WalkNode[]);
    return { ...node, _index: buildLevel(indexedChildren) } as IndexedWalkNode;
  });
}

export function walkParseIndexed(
  nodes: IndexedWalkNode[],
  urlSegments: string[],
  query: URLSearchParams,
  params: Record<string, unknown> = {},
  diag?: ParseDiag[],
): Record<string, unknown> | null {
  for (const node of nodes) {
    const match = matchSegments(node.segments, urlSegments, params);
    if (!match) {
      if (diag && node.schema !== null) diag.push({ kind: 'segment-mismatch', path: node.path, urlSegments });
      continue;
    }
    const { params: nextParams, rest } = match;
    if (rest.length === 0) {
      const result = handleLeafNode(node, nextParams, query, diag);
      if (result) return result;
      continue;
    }
    if (node.children.length === 0) continue;
    const first = rest[0];
    const candidates = first !== undefined
      ? [...(node._index.literals.get(first) ?? []), ...node._index.nonLiterals]
      : node._index.nonLiterals;
    const child = walkParseIndexed(candidates, rest, query, nextParams, diag);
    if (!child) continue;
    if (node.schema === null) return { child };
    const data = validateSchema(node.schema, { ...nextParams, tag: getTag(node.schema) }, node.path, diag);
    if (!data) continue;
    return { ...filterDefined(data), child };
  }
  return null;
}

export function walkParse(
  nodes: WalkNode[],
  urlSegments: string[],
  query: URLSearchParams,
  params: Record<string, unknown> = {},
  diag?: ParseDiag[],
): Record<string, unknown> | null {
  for (const node of nodes) {
    const match = matchSegments(node.segments, urlSegments, params);
    if (!match) {
      if (diag && node.schema !== null) diag.push({ kind: 'segment-mismatch', path: node.path, urlSegments });
      continue;
    }
    const { params: nextParams, rest } = match;
    if (rest.length === 0) {
      const result = handleLeafNode(node, nextParams, query, diag);
      if (result) return result;
      continue;
    }
    if (node.children.length === 0) continue;
    const child = walkParse(node.children as WalkNode[], rest, query, nextParams, diag);
    if (!child) continue;
    if (node.schema === null) return { child };
    const data = validateSchema(node.schema, { ...nextParams, tag: getTag(node.schema) }, node.path, diag);
    if (!data) continue;
    return { ...filterDefined(data), child };
  }
  return null;
}

function collectPathParamNames(segments: Segment[]): Set<string> {
  const names = new Set<string>();
  for (const seg of segments) {
    if (seg.kind !== 'lit') names.add(seg.name);
  }
  return names;
}

export function walkPrint(
  nodes: WalkNode[],
  route: Record<string, unknown>,
  accumulated: { segments: Segment[]; paramNames: Set<string> },
): { segments: Segment[]; paramNames: Set<string> } | null {
  for (const node of nodes) {
    const paramNames = new Set([...accumulated.paramNames, ...collectPathParamNames(node.segments)]);
    const path = { segments: [...accumulated.segments, ...node.segments], paramNames };
    const tagMatches = node.schema !== null && getTag(node.schema) === route['tag'];
    if (tagMatches) {
      if (route['child']) {
        const found = walkPrint(node.children as WalkNode[], route['child'] as Record<string, unknown>, path);
        if (found) return found;
      } else {
        return path;
      }
    } else if (node.schema === null && node.children.length > 0) {
      const child = route['child'] as Record<string, unknown> | undefined;
      if (child) {
        const found = walkPrint(node.children as WalkNode[], child, path);
        if (found) return found;
      }
    }
  }
  return null;
}

export function forEachTaggedNode(nodes: WalkNode[], cb: (node: WalkNode, tag: string) => void): void {
  for (const node of nodes) {
    if (node.schema !== null) {
      const tag = getTag(node.schema);
      if (tag) cb(node, tag);
    }
    if (node.children.length > 0) forEachTaggedNode(node.children as WalkNode[], cb);
  }
}

export function walkCollect<N extends WalkNode, T>(
  nodes: N[],
  extractor: (node: N, tag: string) => T | undefined,
): Record<string, T> {
  const map: Record<string, T> = {};
  forEachTaggedNode(nodes, (node, tag) => {
    const v = extractor(node as N, tag);
    if (v !== undefined) map[tag] = v;
  });
  return map;
}

export function buildUrl(
  result: { segments: Segment[]; paramNames: Set<string> },
  route: Record<string, unknown>,
  sectionParams?: Record<string, string | number>,
): string {
  const allParams: Record<string, unknown> = { ...sectionParams };
  let current: Record<string, unknown> | undefined = route;
  while (current) {
    Object.assign(allParams, current);
    current = current['child'] as Record<string, unknown> | undefined;
  }

  const path =
    '/' +
    result.segments
      .map((seg) => {
        if (seg.kind === 'lit') return seg.value;
        if (seg.kind === 'wildcard') return String(allParams[seg.name]);
        return encodeURIComponent(String(allParams[seg.name]));
      })
      .join('/');

  const toParam = ([k, v]: [string, unknown]) =>
    `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`;

  const topLevel = Object.entries(allParams)
    .filter(
      ([k, v]) =>
        k !== 'tag' &&
        k !== 'child' &&
        k !== 'query' &&
        !result.paramNames.has(k) &&
        v !== undefined,
    )
    .map(toParam);

  const querySubObj = allParams['query'];
  const fromQuery =
    querySubObj !== null && typeof querySubObj === 'object'
      ? Object.entries(querySubObj as Record<string, unknown>)
          .filter(([, v]) => v !== undefined)
          .map(toParam)
      : [];

  const queryStr = [...topLevel, ...fromQuery].join('&');
  return queryStr ? `${path}?${queryStr}` : path;
}
