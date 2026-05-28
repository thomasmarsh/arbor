import {
  defineRoutes,
  route,
  section,
  httpRoute,
  createServer,
  createClient,
  openApiRoute,
  generateSpec,
} from './index.js';
import type {
  RouteNode,
  InferRoute,
  InferContext,
  ChildUnion,
  CtxMap,
  Derive,
  Flatten,
  ResponseUnion,
  HttpContext,
  HttpMethod,
  HandlerMap,
  FetchLike,
  OpenApiContext,
  OpenApiMeta,
} from './index.js';
import { expect, expectTypeOf, it } from 'vitest';

it('exports all public functions as functions', () => {
  expect(typeof defineRoutes).toBe('function');
  expect(typeof route).toBe('function');
  expect(typeof section).toBe('function');
  expect(typeof httpRoute).toBe('function');
  expect(typeof createServer).toBe('function');
  expect(typeof createClient).toBe('function');
  expect(typeof openApiRoute).toBe('function');
  expect(typeof generateSpec).toBe('function');
});

it('type exports resolve', () => {
  expectTypeOf<RouteNode<unknown, unknown>>().not.toBeNever();
  expectTypeOf<InferRoute<RouteNode<{ path: '/a' }, never>>>().not.toBeNever();
  expectTypeOf<InferContext<RouteNode<{ path: '/a' }, never>>>().toBeNever();
  expectTypeOf<ChildUnion<[]>>().toBeNever();
  expectTypeOf<CtxMap<never>>().not.toBeNever();
  expectTypeOf<Derive<RouteNode<{ path: '/a' }, never>>>().not.toBeNever();
  expectTypeOf<Flatten<{ a: 1 }>>().not.toBeNever();
  expectTypeOf<ResponseUnion<never>>().toBeNever();
  expectTypeOf<HttpContext<'GET', unknown, Record<number, unknown>>>().not.toBeNever();
  expectTypeOf<HttpMethod>().not.toBeNever();
  expectTypeOf<HandlerMap<Record<string, HttpContext<any, any, any>>, never>>().not.toBeNever();
  expectTypeOf<FetchLike>().not.toBeNever();
  expectTypeOf<OpenApiContext<'GET', unknown, Record<number, unknown>>>().not.toBeNever();
  expectTypeOf<OpenApiMeta>().not.toBeNever();
});
