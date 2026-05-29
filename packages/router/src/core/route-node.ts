/* eslint-disable @typescript-eslint/no-explicit-any */

import type z from 'zod';
import type { Segment } from './segments.js';

export type Flatten<T> = { [K in keyof T]: T[K] };

export type ExtractPathParams<Path extends string> =
  Path extends `${string}:${infer Param}/${infer Rest}`
    ? Param | ExtractPathParams<Rest>
    : Path extends `${string}#${infer Param}/${infer Rest}`
      ? Param | ExtractPathParams<Rest>
      : never;

export interface RouteCtx {
  method?: string;
  bodySchema?: z.ZodType;
  responseSchemas?: Record<number, z.ZodType>;
  querySchema?: z.ZodObject<any, any>;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export type InferRoute<R extends { _type: unknown }> = R['_type'];

export type InferContext<N extends { context?: unknown }> =
  N extends { context?: infer C } ? C : never;

export interface RouteNode<
  R,
  Child,
  C extends RouteNode<unknown, unknown, any, any, any>[] = [],
  Context = never,
  SectionParams extends string = never,
> {
  _type: R;
  _child: Child;
  _sectionParams?: SectionParams;
  schema: z.ZodObject<any, any> | null;
  path: string;
  segments: Segment[];
  children: C;
  context?: Context;
  _ctx?: RouteCtx;
}

export type Derive<N> =
  N extends RouteNode<infer R, infer Child, any, any, any>
    ? [R] extends [never]
      ? Flatten<{ child: Child }>
      : [Child] extends [never]
        ? Flatten<R>
        : Flatten<R & { child?: Child }>
    : never;

export type ChildUnion<C extends RouteNode<unknown, unknown, any, any, any>[]> = {
  [K in keyof C]: Derive<C[K]>;
}[number];

export type ResponseUnion<Resp> = {
  [S in keyof Resp]: { status: S; body: Resp[S] };
}[keyof Resp];

export type CtxMap<C extends RouteNode<unknown, unknown, any, any, any>[]> = {
  [N in C[number] as N extends RouteNode<{ tag: infer T extends string }, any, any, any, any>
    ? T
    : never]: N extends RouteNode<any, any, any, infer Ctx, any> ? Ctx : never;
};
