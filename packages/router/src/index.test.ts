/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, expectTypeOf, it } from 'vitest';
import type {
  ChildUnion,
  CtxMap,
  Derive,
  FetchLike,
  Flatten,
  HandlerMap,
  HttpContext,
  HttpMethod,
  InferContext,
  InferRoute,
  OpenApiContext,
  OpenApiMeta,
  ResponseUnion,
  RouteNode,
} from './index.js';
import {
  createClient,
  createServer,
  defineRoutes,
  generateSpec,
  httpRoute,
  openApiRoute,
  route,
  section,
} from './index.js';

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
