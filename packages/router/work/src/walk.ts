/* eslint-disable @typescript-eslint/no-explicit-any */

import z from 'zod';
import type { RouteNode } from './route-node.js';
import { type Segment, matchSegments, parseSegments } from './segments.js';

export type WalkNode = RouteNode<unknown, unknown, RouteNode<unknown, unknown, any, any>[], any>;

function getShape(schema: z.ZodObject<any, any>): Record<string, z.z.ZodType> {
  const s = schema.shape as Record<string, z.z.ZodType> | (() => Record<string, z.z.ZodType>);
  return typeof s === 'function' ? s() : s;
}

export function getTag(schema: z.ZodObject<any, any>): string | undefined {
  const tag = getShape(schema).tag;
  return tag instanceof z.ZodLiteral ? (tag.value as string) : undefined;
}

export function walkParse(
  nodes: WalkNode[],
  urlSegments: string[],
  query: URLSearchParams,
  params: Record<string, unknown> = {},
): Record<string, unknown> | null {
  for (const node of nodes) {
    const match = matchSegments(parseSegments(node.path), urlSegments, params);
    if (!match) continue;

    const { params: nextParams, rest } = match;

    if (rest.length > 0) {
      if (node.children.length === 0) continue;

      const child = walkParse(node.children as WalkNode[], rest, query, nextParams);
      if (!child) continue;

      if (node.schema === null) return { child };

      const raw = { ...nextParams, tag: getTag(node.schema) };
      const result = node.schema.safeParse(raw);
      if (!result.success) continue;

      return {
        ...Object.fromEntries(Object.entries(result.data).filter(([, v]) => v !== undefined)),
        child,
      };
    }

    if (node.schema === null) continue;

    const shape = getShape(node.schema);

    const raw: Record<string, unknown> = {
      ...nextParams,
      tag: getTag(node.schema),
    };

    for (const key of Object.keys(shape)) {
      if (key === 'tag' || key in raw) continue;
      const vals = query.getAll(key);
      if (vals.length > 1) raw[key] = vals;
      else if (vals.length === 1) raw[key] = vals[0];
    }

    const result = node.schema.safeParse(raw);
    if (!result.success) continue;

    return Object.fromEntries(Object.entries(result.data).filter(([, v]) => v !== undefined));
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
    const segments = parseSegments(node.path);
    const paramNames = new Set([...accumulated.paramNames, ...collectPathParamNames(segments)]);
    const path = { segments: [...accumulated.segments, ...segments], paramNames };

    const tagMatches = node.schema !== null && getTag(node.schema) === route.tag;

    if (tagMatches) {
      if (route.child) {
        const found = walkPrint(
          node.children as WalkNode[],
          route.child as Record<string, unknown>,
          path,
        );
        if (found) return found;
      } else {
        return path;
      }
    } else if (node.children.length > 0) {
      const found = walkPrint(node.children as WalkNode[], route, path);
      if (found) return found;
    }
  }

  return null;
}

export function buildUrl(
  result: { segments: Segment[]; paramNames: Set<string> },
  route: Record<string, unknown>,
): string {
  const allParams: Record<string, unknown> = {};
  let current: Record<string, unknown> | undefined = route;
  while (current) {
    Object.assign(allParams, current);
    current = current.child as Record<string, unknown> | undefined;
  }

  const path =
    '/' +
    result.segments
      .map((seg) => (seg.kind === 'lit' ? seg.value : String(allParams[seg.name])))
      .join('/');

  const query = Object.entries(allParams)
    .filter(
      ([k, v]) => k !== 'tag' && k !== 'child' && !result.paramNames.has(k) && v !== undefined,
    )
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

  return query ? `${path}?${query}` : path;
}
