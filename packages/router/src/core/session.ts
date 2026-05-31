/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Session type primitives ──────────────────────────────────────────────────
//
// Phantom structs — all fields are `undefined as never` at runtime.

export interface Send<T, S extends Session = End> { readonly _tag: 'Send'; _payload: T; _next: S }
export interface Recv<T, S extends Session = End> { readonly _tag: 'Recv'; _payload: T; _next: S }
export interface Branch<Cases extends Record<string, Session>> { readonly _tag: 'Branch'; _cases: Cases }
export interface Select<Cases extends Record<string, Session>> { readonly _tag: 'Select'; _cases: Cases }
export interface End { readonly _tag: 'End' }

export type Session = Send<any, any> | Recv<any, any> | Branch<any> | Select<any> | End;

// ─── Dual<S> ─────────────────────────────────────────────────────────────────
//
// Computes the complementary (client-side) session type: Send↔Recv, Branch↔Select.
//
// Uses a depth-counter (same as FlattenChildrenImpl) because the naive recursive
// form hits TS2589 due to `any` in the Session union constraint. Branch/Select
// cases use bounded `infer C extends Record<string, Session>` rather than
// `C[K] & Session` to prevent intersections from breaking structural equality.

type D = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

export type Dual<S extends Session, Lim extends number = 15> =
  [Lim] extends [0] ? End :
  S extends Send<infer T, infer N extends Session> ? Recv<T, Dual<N, D[Lim]>> :
  S extends Recv<infer T, infer N extends Session> ? Send<T, Dual<N, D[Lim]>> :
  S extends Branch<infer C extends Record<string, Session>> ? Select<{ [K in keyof C]: Dual<C[K], D[Lim]> }> :
  S extends Select<infer C extends Record<string, Session>> ? Branch<{ [K in keyof C]: Dual<C[K], D[Lim]> }> :
  End;

// ─── Channel<S> ──────────────────────────────────────────────────────────────
//
// Typed handle whose API surface reflects the current session state S.
// Concrete implementations (SSE, WebSocket) land in plans 89/90.

export type Channel<S extends Session> =
  S extends Send<infer T, infer N extends Session> ? { send(v: T): Channel<N> } :
  S extends Recv<infer T, infer N extends Session> ? { recv(): Promise<readonly [T, Channel<N>]> } :
  S extends Branch<infer C extends Record<string, Session>> ? { branch<K extends keyof C>(k: K): Channel<C[K]> } :
  S extends Select<infer C extends Record<string, Session>> ? { select<K extends keyof C>(k: K): Channel<C[K]> } :
  S extends End ? { close(): void } :
  never;

// ─── SessionMeta<S> ──────────────────────────────────────────────────────────
//
// Phantom metadata shape for the `_meta` bag on RouteNode.
// Uses a distinct optional key so it does not collide with HttpContextData
// or OpenApiCtxData when intersected.

export interface SessionMeta<S extends Session> {
  readonly __session?: S;
}

// ─── Inference helpers ────────────────────────────────────────────────────────

export type InferSession<Node> =
  Node extends { _meta?: infer M }
    ? M extends SessionMeta<infer S>
      ? S
      : never
    : never;

export type InferDual<Node> =
  Node extends { _meta?: infer M }
    ? M extends SessionMeta<infer S>
      ? Dual<S>
      : never
    : never;
