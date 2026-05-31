/* eslint-disable @typescript-eslint/no-explicit-any */

import type z from 'zod';
import { buildable, type BuildableRouteNode } from '../core/define-routes.js';
import type { RouteNode } from '../core/route-node.js';
import { parseSegments } from '../core/segments.js';
import type { Recv, Send, Session, SessionMeta } from '../core/session.js';
import { walkCollect } from '../core/walk.js';

// ─── Transport abstraction ─────────────────────────────────────────────────────
//
// Custom runtimes implement WsAdapter to decouple typed layer from Node/Bun/CF.

export interface WsAdapter {
  onMessage(handler: (raw: string) => void): void;
  onClose(handler: () => void): void;
  send(data: string): void;
  close(code?: number): void;
}

// ─── Typed channel ─────────────────────────────────────────────────────────────
//
// WsChannel<S> maps a session type to a concrete API surface.
//
// WsRecvMsg/WsSendMsg use flat (non-recursive) pattern matching over the first
// two steps of the session so TypeScript evaluates them eagerly rather than
// deferring them (recursive conditionals inside interface properties can
// resolve to `never` before instantiation in some TS versions).

type WsRecvMsg<S extends Session> =
  S extends Recv<infer T, any> ? T :
  S extends Send<any, Recv<infer T, any>> ? T :
  never;

type WsSendMsg<S extends Session> =
  S extends Send<infer T, any> ? T :
  S extends Recv<any, Send<infer T, any>> ? T :
  never;

export interface WsChannel<S extends Session> {
  messages: AsyncIterable<WsRecvMsg<S>>;
  send(v: WsSendMsg<S>): void;
  close(): void;
}

// ─── Context & meta types ─────────────────────────────────────────────────────

export interface WsContext<In, Out> {
  channel: WsChannel<Recv<In, Send<Out>>>;
  // Phantom for client-side channel type; never assigned at runtime.
  // Allows WsClient.connect to return Map[Tag]['_dual'] (a direct property
  // access) instead of a conditional type, avoiding TypeScript's deferred
  // conditional which resolves property accesses to `never`.
  _dual: WsChannel<Send<In, Recv<Out>>>;
}

export interface WsMeta<In, Out> extends SessionMeta<Recv<In, Send<Out>>> {
  readonly __wsMeta?: [In, Out];
  readonly inSchema: z.ZodType<In>;
  readonly outSchema: z.ZodType<Out>;
}

export type WsWalkNode = RouteNode<unknown, any, any, any, WsMeta<any, any>>;

export function getWsMeta(node: RouteNode<unknown, any, any, any, any>): WsMeta<unknown, unknown> | undefined {
  const meta = node._meta as WsMeta<unknown, unknown> | undefined;
  return meta && 'inSchema' in meta && 'outSchema' in meta ? meta : undefined;
}

export function collectWsMetaMap(nodes: WsWalkNode[]): Record<string, WsMeta<unknown, unknown>> {
  return walkCollect(nodes, (n) => getWsMeta(n));
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function wsRoute<
  ZS extends z.ZodObject<any, any>,
  In,
  Out,
>(
  schema: ZS,
  path: string,
  opts: { in: z.ZodType<In>; out: z.ZodType<Out> },
): BuildableRouteNode<RouteNode<z.infer<ZS>, [], WsContext<In, Out>, never, WsMeta<In, Out>>> {
  return buildable<RouteNode<z.infer<ZS>, [], WsContext<In, Out>, never, WsMeta<In, Out>>>({
    _type: undefined as never,
    schema,
    path,
    segments: parseSegments(path),
    children: [] as [],
    _meta: { inSchema: opts.in, outSchema: opts.out },
  });
}

// ─── In-memory adapter pair (for testing) ─────────────────────────────────────
//
// Two adapters wired together: A.send → B.onMessage handlers, and vice versa.
// Shared `closed` flag makes close() idempotent.

export function createWsAdapterPair(): [WsAdapter, WsAdapter] {
  const msgA: ((raw: string) => void)[] = [];
  const msgB: ((raw: string) => void)[] = [];
  const closeA: (() => void)[] = [];
  const closeB: (() => void)[] = [];
  let closed = false;

  const doClose = (): void => {
    if (closed) return;
    closed = true;
    for (const h of closeA) h();
    for (const h of closeB) h();
  };

  const adapterA: WsAdapter = {
    onMessage(h) { msgA.push(h); },
    onClose(h) { closeA.push(h); },
    send(data) { if (!closed) for (const h of msgB) h(data); },
    close: doClose,
  };

  const adapterB: WsAdapter = {
    onMessage(h) { msgB.push(h); },
    onClose(h) { closeB.push(h); },
    send(data) { if (!closed) for (const h of msgA) h(data); },
    close: doClose,
  };

  return [adapterA, adapterB];
}

// ─── Channel builder ──────────────────────────────────────────────────────────
//
// Wraps a WsAdapter with Zod schemas. Used internally by server and client.
// recvSchema validates incoming messages; sendSchema validates outgoing messages.

export function buildWsChannel<RecvT, SendT>(
  adapter: WsAdapter,
  recvSchema: z.ZodType<RecvT>,
  sendSchema: z.ZodType<SendT>,
): { messages: AsyncIterable<RecvT>; send(v: SendT): void; close(): void } {
  const queue: RecvT[] = [];
  const waiters: ((r: IteratorResult<RecvT>) => void)[] = [];
  let closed = false;

  adapter.onMessage((raw) => {
    const value = recvSchema.parse(JSON.parse(raw));
    if (waiters.length > 0) {
      (waiters.shift() as (r: IteratorResult<RecvT>) => void)({ value, done: false });
    } else {
      queue.push(value);
    }
  });

  adapter.onClose(() => {
    closed = true;
    while (waiters.length > 0) {
      (waiters.shift() as (r: IteratorResult<RecvT>) => void)({ value: undefined as never, done: true });
    }
  });

  const messages: AsyncIterable<RecvT> = {
    [Symbol.asyncIterator](): AsyncIterator<RecvT> {
      return {
        next(): Promise<IteratorResult<RecvT>> {
          if (queue.length > 0) return Promise.resolve({ value: queue.shift() as RecvT, done: false });
          if (closed) return Promise.resolve({ value: undefined as never, done: true });
          return new Promise((resolve) => { waiters.push(resolve); });
        },
        return(): Promise<IteratorResult<RecvT>> {
          adapter.close();
          return Promise.resolve({ value: undefined as never, done: true });
        },
      };
    },
  };

  return {
    messages,
    send(v: SendT) { adapter.send(JSON.stringify(sendSchema.parse(v))); },
    close() { adapter.close(); },
  };
}
