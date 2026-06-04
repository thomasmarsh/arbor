/* eslint-disable @typescript-eslint/no-explicit-any */

import { buildable, type BuildableRouteNode } from '../../core/define-routes.js';
import type { RouteNode } from '../../core/route-node.js';
import type { AnyObjectSchema, AnyUserSchema, UserSchema, Infer } from '../../core/schema.js';
import { parseSegments } from '../../core/segments.js';
import type { Send, SessionMeta } from '../../core/session.js';
import { walkCollect } from '../../core/walk.js';

// ─── Context & meta types ─────────────────────────────────────────────────────

// Context type (drives SseHandlerMap and SseClient return types via CtxMap)
export interface SseContext<E> {
  events: E;
}

// _meta shape: runtime schema + session type annotation (Send<E> for tooling in plan 90/91)
export interface SseMeta<E> extends SessionMeta<Send<E>> {
  readonly __sseMeta?: E;
  readonly eventSchema: UserSchema<E>;
}

export type SseWalkNode = RouteNode<unknown, any, any, any, SseMeta<any>>;

export function getSseMeta(node: RouteNode<unknown, any, any, any, any, any>): SseMeta<unknown> | undefined {
  const meta = node._meta as SseMeta<unknown> | undefined;
  return meta && 'eventSchema' in meta ? meta : undefined;
}

export function collectSseSchemaMaps(nodes: SseWalkNode[]): Record<string, AnyUserSchema> {
  return walkCollect(nodes, (n) => getSseMeta(n)?.eventSchema);
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function sseRoute<
  ZS extends AnyObjectSchema,
  E,
>(
  schema: ZS,
  path: string,
  opts: { events: UserSchema<E> },
): BuildableRouteNode<RouteNode<Infer<ZS>, [], SseContext<E>, never, SseMeta<E>>> {
  return buildable<RouteNode<Infer<ZS>, [], SseContext<E>, never, SseMeta<E>>>({
    _type: undefined as never,
    schema,
    path,
    segments: parseSegments(path),
    children: [] as [],
    _meta: { eventSchema: opts.events },
  });
}
