/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Result } from '@arbor/common';
import type { RouteNode } from '../core/route-node.js';
import { buildIxSessionOps, type IxSessionOps } from '../core/ix-session-ops.js';
import { walkCollect } from '../core/walk.js';
import {
  buildWsChannel,
  collectWsSessionMetaMap,
  getWsMeta,
  type WsAdapter,
  type WsContext,
  type WsSessionContext,
  type WsSessionWalkNode,
  type WsWalkNode,
} from '../contexts/realtime/ws-context.js';

// ─── Transport abstraction ─────────────────────────────────────────────────────
//
// Provide a custom WsConnectFn to inject an in-memory or test adapter instead
// of a real WebSocket connection.

export type WsConnectFn = (url: string) => WsAdapter;

// ─── Client types ─────────────────────────────────────────────────────────────

export interface WsClient<
  Route extends { tag: string },
  Map extends Record<string, WsContext<any, any>>,
> {
  // Returns Map[Tag]['_dual'] — a direct property access on the context so that
  // TypeScript evaluates the type eagerly (avoiding the deferred-conditional
  // `never` that occurs when a conditional type is used in a return position).
  connect<Tag extends keyof Map & string>(
    route: Extract<Route, { tag: Tag }>,
  ): Map[Tag]['_dual'];
}

interface WsRouterLike<
  Route extends { tag: string },
  Map extends Record<string, WsContext<any, any>>,
> {
  _type: Route;
  _ctxMap: Map;
  children: RouteNode<unknown, any, any, any, any, any>[];
  parse(url: URL): Result<Route, string>;
  print(route: Route): string;
}

// ─── Client factory ───────────────────────────────────────────────────────────

export function createWsClient<
  Route extends { tag: string },
  Map extends Record<string, WsContext<any, any>>,
>(
  baseUrl: string,
  router: WsRouterLike<Route, Map>,
  opts?: { connect?: WsConnectFn },
): WsClient<Route, Map> {
  const metaMap = walkCollect(
    router.children as WsWalkNode[],
    (n) => getWsMeta(n),
  );

  const connectFn: WsConnectFn = opts?.connect ?? defaultConnect;

  return {
    connect<Tag extends keyof Map & string>(
      route: Extract<Route, { tag: Tag }>,
    ): Map[Tag]['_dual'] {
      const tag = route.tag;
      const path = router.print(route);
      const url = `${baseUrl.replace(/\/$/, '')}${path}`;
      const meta = metaMap[tag];
      if (!meta) throw new Error(`no WS meta for tag: ${tag}`);

      const adapter = connectFn(url);
      // Client sends In (inSchema validates outgoing) and receives Out (outSchema validates incoming)
      return buildWsChannel(adapter, meta.outSchema, meta.inSchema);
    },
  };
}

// ─── Session client types ──────────────────────────────────────────────────────

export interface WsSessionClient<Route extends { tag: string }> {
  connectSession(route: Route): IxSessionOps;
}

interface WsRouterLike_Session<
  Route extends { tag: string },
  Map extends Record<string, WsSessionContext<any>>,
> {
  _type: Route;
  _ctxMap: Map;
  children: RouteNode<unknown, any, any, any, any, any>[];
  parse(url: URL): Result<Route, string>;
  print(route: Route): string;
}

// ─── Session client factory ───────────────────────────────────────────────────

export function createWsSessionClient<
  Route extends { tag: string },
  Map extends Record<string, WsSessionContext<any>>,
>(
  baseUrl: string,
  router: WsRouterLike_Session<Route, Map>,
  opts?: { connect?: WsConnectFn },
): WsSessionClient<Route> {
  const metaMap = collectWsSessionMetaMap(
    router.children as WsSessionWalkNode[],
  );

  const connectFn: WsConnectFn = opts?.connect ?? defaultConnect;

  return {
    connectSession(route: Route): IxSessionOps {
      const tag = route.tag;
      const path = router.print(route);
      const url = `${baseUrl.replace(/\/$/, '')}${path}`;
      const meta = metaMap[tag];
      if (!meta) throw new Error(`no WsSession meta for tag: ${tag}`);
      const adapter = connectFn(url);
      return buildIxSessionOps(adapter);
    },
  };
}

function defaultConnect(url: string): WsAdapter {
  const ws = new WebSocket(url);
  const msgHandlers: ((raw: string) => void)[] = [];
  const closeHandlers: (() => void)[] = [];

  ws.onmessage = (e) => {
    const data = typeof e.data === 'string' ? e.data : String(e.data);
    for (const h of msgHandlers) h(data);
  };

  ws.onclose = () => {
    for (const h of closeHandlers) h();
  };

  return {
    onMessage(h) { msgHandlers.push(h); },
    onClose(h) { closeHandlers.push(h); },
    send(data) { ws.send(data); },
    close(code) { ws.close(code); },
  };
}
