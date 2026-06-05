/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Result } from '@arbor/common';
import { buildIxSessionOps, type IxSessionOps } from '../core/ix-session-ops.js';
import type { RouteNode } from '../core/route-node.js';
import { walkCollect } from '../core/walk.js';
import {
  buildWsChannel,
  getWsMeta,
  type WsAdapter,
  type WsContext,
  type WsSessionContext,
  type WsWalkNode,
} from '../contexts/realtime/ws-context.js';

// ─── Handler types ────────────────────────────────────────────────────────────

export interface WsHandlerCtx<Routes, Tag extends string, Ctx extends WsContext<any, any>> {
  params: Omit<Extract<Routes, { tag: Tag }>, 'tag' | 'child' | 'query'>;
  channel: Ctx['channel'];
}

export type WsHandlerMap<
  Map extends Record<string, WsContext<any, any>>,
  Routes,
> = {
  [Tag in keyof Map & string]: (
    ctx: WsHandlerCtx<Routes, Tag, Map[Tag]>,
  ) => Promise<void>;
};

// ─── WS router contract ───────────────────────────────────────────────────────

export interface WsRouterContract<
  Route extends { tag: string },
  Map extends Record<string, WsContext<any, any>>,
> {
  _type: Route;
  _ctxMap: Map;
  children: RouteNode<unknown, any, any, any, any, any>[];
  parse(url: URL): Result<Route, string>;
  print(route: Route): string;
}

// ─── WS session router contract ───────────────────────────────────────────────

export interface WsSessionRouterContract<
  Route extends { tag: string },
  Map extends Record<string, WsSessionContext<any>>,
> {
  _type: Route;
  _ctxMap: Map;
  children: RouteNode<unknown, any, any, any, any, any>[];
  parse(url: URL): Result<Route, string>;
  print(route: Route): string;
}

// ─── Session handler types ────────────────────────────────────────────────────

export interface WsSessionHandlerCtx<Routes, Tag extends string, _Ctx extends WsSessionContext<any>> {
  params: Omit<Extract<Routes, { tag: Tag }>, 'tag' | 'child' | 'query'>;
  ops: IxSessionOps;
}

export type WsSessionHandlerMap<
  Map extends Record<string, WsSessionContext<any>>,
  Routes,
> = {
  [Tag in keyof Map & string]: (
    ctx: WsSessionHandlerCtx<Routes, Tag, Map[Tag]>,
  ) => Promise<void>;
};

// ─── Session server factory ───────────────────────────────────────────────────

export function createWsSessionServer<
  Route extends { tag: string },
  Map extends Record<string, WsSessionContext<any>>,
>(
  _router: WsSessionRouterContract<Route, Map>,
  handlers: WsSessionHandlerMap<Map, Route>,
): {
  handleConnection(tag: string, params: Record<string, unknown>, adapter: WsAdapter): Promise<void>;
} {
  return {
    async handleConnection(tag: string, params: Record<string, unknown>, adapter: WsAdapter): Promise<void> {
      const handler = (handlers as Record<string, (ctx: unknown) => Promise<void>>)[tag];
      if (!handler) {
        adapter.close(1008);
        return;
      }

      const ops = buildIxSessionOps(adapter);
      const routeParams = Object.fromEntries(
        Object.entries(params).filter(([k]) => k !== 'tag' && k !== 'child' && k !== 'query'),
      );

      await handler({ params: routeParams, ops });
    },
  };
}

// ─── Server factory ───────────────────────────────────────────────────────────

export function createWsServer<
  Route extends { tag: string },
  Map extends Record<string, WsContext<any, any>>,
>(
  router: WsRouterContract<Route, Map>,
  handlers: WsHandlerMap<Map, Route>,
): {
  handleConnection(tag: string, params: Record<string, unknown>, adapter: WsAdapter): Promise<void>;
} {
  const metaMap = walkCollect(
    router.children as WsWalkNode[],
    (n) => getWsMeta(n),
  );

  return {
    async handleConnection(tag: string, params: Record<string, unknown>, adapter: WsAdapter): Promise<void> {
      const handler = (handlers as Record<string, (ctx: unknown) => Promise<void>>)[tag];
      if (!handler) {
        adapter.close(1008);
        return;
      }

      const meta = metaMap[tag];
      if (!meta) {
        adapter.close(1008);
        return;
      }

      // Server receives In (inSchema) and sends Out (outSchema)
      const channel = buildWsChannel(adapter, meta.inSchema, meta.outSchema);

      const routeParams = Object.fromEntries(
        Object.entries(params).filter(([k]) => k !== 'tag' && k !== 'child' && k !== 'query'),
      );

      await handler({ params: routeParams, channel });
    },
  };
}
