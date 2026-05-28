/* eslint-disable @typescript-eslint/no-explicit-any */

import type z from 'zod';

export type Flatten<T> = { [K in keyof T]: T[K] };

export type InferRoute<R extends { _type: unknown }> = R['_type'];

export type InferContext<N extends { context?: unknown }> =
  N extends { context?: infer C } ? C : never;

export interface RouteNode<
  R,
  Child,
  C extends RouteNode<unknown, unknown, any, any>[] = [],
  Context = never,
> {
  _type: R;
  _child: Child;
  schema: z.ZodObject<any, any> | null;
  path: string;
  children: C;
  context?: Context;
}

export type Derive<N> =
  N extends RouteNode<infer R, infer Child, any, any>
    ? [R] extends [never]
      ? Flatten<{ child: Child }>
      : [Child] extends [never]
        ? Flatten<R>
        : Flatten<R & { child?: Child }>
    : never;

export type ChildUnion<C extends RouteNode<unknown, unknown, any, any>[]> = {
  [K in keyof C]: Derive<C[K]>;
}[number];

export type CtxMap<C extends RouteNode<unknown, unknown, any, any>[]> = {
  [N in C[number] as N extends RouteNode<{ tag: infer T extends string }, any, any, any>
    ? T
    : never]: N extends RouteNode<any, any, any, infer Ctx> ? Ctx : never;
};
