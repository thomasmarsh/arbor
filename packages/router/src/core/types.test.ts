import { describe, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { httpRoute, respond } from '../contexts/http-context.js';
import { createClient } from '../client/fetch-client.js';
import { createServer } from '../server/server.js';
import { defineRoutes, route, section, type InferRoute, type ResponseUnion } from './define-routes.js';

// --- Fixtures ---

const GetUser = z.object({ tag: z.literal('get-user'), id: z.string() });
const CreateUser = z.object({ tag: z.literal('create-user') });
const SearchItems = z.object({ tag: z.literal('search-items') });
const UserResp = z.object({ id: z.string(), email: z.string() });
const ErrorResp = z.object({ error: z.string() });
const CreateBody = z.object({ name: z.string(), email: z.string() });
const SearchQuery = z.object({ page: z.coerce.number().default(1) });
const SearchResp = z.object({ count: z.number() });

const httpRouter = defineRoutes([
  httpRoute(GetUser, 'GET', 'users/:id/', { response: { 200: UserResp, 404: ErrorResp } }),
  httpRoute(CreateUser, 'POST', 'users/', { body: CreateBody, response: { 201: UserResp } }),
  httpRoute(SearchItems, 'GET', 'items/', { query: SearchQuery, response: { 200: SearchResp } }),
]);

const Org = z.object({ tag: z.literal('org'), orgId: z.string() });
const Users = z.object({ tag: z.literal('users') });
const User = z.object({ tag: z.literal('user'), id: z.string() });
const Settings = z.object({ tag: z.literal('settings') });
const Project = z.object({ tag: z.literal('project'), projectId: z.number() });

const orgRouter = defineRoutes([route(Org, 'orgs/:orgId/')]);
const userRouter = defineRoutes([
  route(Users, 'users/', [route(User, ':id/', [route(Settings, 'settings/')])]),
]);
const _composed = defineRoutes([...orgRouter.children, ...userRouter.children]);

const _sectionRouter = defineRoutes([section('orgs/:orgId/', [route(Project, '#projectId/')])]);

// --- Tests ---

describe('Tag discrimination', () => {
  it('print rejects an invalid tag', () => {
    // @ts-expect-error — 'nonexistent' is not a valid route tag
    httpRouter.print({ tag: 'nonexistent' });
  });

  it('print return type is string', () => {
    const url: string = httpRouter.print({ tag: 'get-user', id: '1' });
    expectTypeOf(url).toEqualTypeOf<string>();
  });

  it('print rejects wrong param type', () => {
    // @ts-expect-error — id must be string, not number
    httpRouter.print({ tag: 'get-user', id: 42 });
  });

  it('print rejects missing required param', () => {
    // @ts-expect-error — id is required for get-user
    httpRouter.print({ tag: 'get-user' });
  });
});

describe('parse() result shape includes query', () => {
  it('route with query schema: extracted route type includes query field', () => {
    type Route = InferRoute<typeof httpRouter>;
    type SearchRoute = Extract<Route, { tag: 'search-items' }>;
    expectTypeOf<SearchRoute>().toEqualTypeOf<{ tag: 'search-items'; query: { page: number } }>();
  });

  it('route without query schema: extracted route type has no query field', () => {
    type Route = InferRoute<typeof httpRouter>;
    type GetUserRoute = Extract<Route, { tag: 'get-user' }>;
    expectTypeOf<GetUserRoute>().toEqualTypeOf<{ tag: 'get-user'; id: string }>();
  });

  it('route without query schema: type does not include a query shape', () => {
    type Route = InferRoute<typeof httpRouter>;
    type GetUserRoute = Extract<Route, { tag: 'get-user' }>;
    expectTypeOf<GetUserRoute>().not.toExtend<{ query: { page: number } }>();
  });

  it('create-user route has no body field in route type (body is in context only)', () => {
    type Route = InferRoute<typeof httpRouter>;
    type CreateUserRoute = Extract<Route, { tag: 'create-user' }>;
    expectTypeOf<CreateUserRoute>().toEqualTypeOf<{ tag: 'create-user' }>();
  });
});

describe('Composition type safety', () => {
  it('composed router type equals union of sub-router types', () => {
    type ComposedRoute = InferRoute<typeof _composed>;
    type OrgRoute = InferRoute<typeof orgRouter>;
    type UserRoute = InferRoute<typeof userRouter>;
    expectTypeOf<ComposedRoute>().toEqualTypeOf<OrgRoute | UserRoute>();
  });

  it('org route is assignable to composed route type', () => {
    type ComposedRoute = InferRoute<typeof _composed>;
    expectTypeOf<{ tag: 'org'; orgId: string }>().toExtend<ComposedRoute>();
  });

  it('bare user route is assignable to composed route type', () => {
    type ComposedRoute = InferRoute<typeof _composed>;
    expectTypeOf<{ tag: 'users' }>().toExtend<ComposedRoute>();
  });

  it('nested user route shape is assignable to composed route type', () => {
    type ComposedRoute = InferRoute<typeof _composed>;
    expectTypeOf<{
      tag: 'users';
      child?: { tag: 'user'; id: string; child?: { tag: 'settings' } };
    }>().toExtend<ComposedRoute>();
  });
});

describe('Handler map exhaustiveness', () => {
  it('missing handler tags are a type error', () => {
    const incomplete = { 'get-user': () => Promise.resolve(respond(200, { id: '1', email: '' })) };
    // @ts-expect-error — 'create-user' and 'search-items' are missing
    createServer(httpRouter, incomplete);
  });

  it('ResponseUnion for get-user covers both declared statuses', () => {
    type CtxMap = typeof httpRouter._ctxMap;
    type GetUserResponse = ResponseUnion<CtxMap['get-user']['response']>;
    expectTypeOf<GetUserResponse>().toEqualTypeOf<
      | { status: 200; body: { id: string; email: string } }
      | { status: 404; body: { error: string } }
    >();
  });

  it('status 201 is a valid create-user response', () => {
    type CtxMap = typeof httpRouter._ctxMap;
    type CreateUserResponse = ResponseUnion<CtxMap['create-user']['response']>;
    expectTypeOf<{ status: 201; body: { id: string; email: string } }>().toExtend<CreateUserResponse>();
  });

  it('status 200 is not a valid create-user response (only 201 declared)', () => {
    type CtxMap = typeof httpRouter._ctxMap;
    type CreateUserResponse = ResponseUnion<CtxMap['create-user']['response']>;
    expectTypeOf<{ status: 200; body: unknown }>().not.toExtend<CreateUserResponse>();
  });
});

describe('Section params type safety', () => {
  it('sectionRouter.print second param is required Record<orgId, string|number>', () => {
    type SecondParam = Parameters<typeof _sectionRouter.print>[1];
    expectTypeOf<SecondParam>().toEqualTypeOf<Record<'orgId', string | number>>();
  });

  it('router without sections: print second param is optional', () => {
    type SecondParam = Parameters<typeof orgRouter.print>[1];
    expectTypeOf<SecondParam>().toEqualTypeOf<Record<string, string | number> | undefined>();
  });
});

describe('CtxMap body types', () => {
  it('GET route without body: body type is never in CtxMap', () => {
    type CtxMap = typeof httpRouter._ctxMap;
    type GetUserBody = CtxMap['get-user']['body'];
    expectTypeOf<GetUserBody>().toEqualTypeOf<never>();
  });

  it('POST route with body schema: body type is inferred correctly in CtxMap', () => {
    type CtxMap = typeof httpRouter._ctxMap;
    type CreateUserBody = CtxMap['create-user']['body'];
    expectTypeOf<CreateUserBody>().toEqualTypeOf<{ name: string; email: string }>();
  });
});

describe('CtxMap section recursion', () => {
  const Hello = z.object({ tag: z.literal('hello') });
  const HelloResp = z.object({ message: z.string() });
  const GetTask = z.object({ tag: z.literal('get-task'), id: z.coerce.number() });
  const TaskResp = z.object({ id: z.number(), title: z.string() });

  const helloRouter = defineRoutes([
    httpRoute(Hello, 'GET', 'hello', { response: { 200: HelloResp } }),
  ]);

  const nestedRouter = defineRoutes([
    section('api', [
      ...helloRouter.children,
      section('tasks', [
        httpRoute(GetTask, 'GET', ':id', { response: { 200: TaskResp } }),
      ]),
    ]),
  ]);

  it('routes nested under sections appear in _ctxMap', () => {
    type Map = typeof nestedRouter._ctxMap;
    expectTypeOf<Map['hello']['response']>().toEqualTypeOf<{ 200: { message: string } }>();
    expectTypeOf<Map['get-task']['response']>().toEqualTypeOf<{ 200: { id: number; title: string } }>();
  });

  it('createServer handler map keys are fully inferred from section-nested routes', () => {
    const server = createServer(nestedRouter, {
      hello: async (_ctx) => respond(200, { message: 'hi' }),
      'get-task': async (ctx) => respond(200, { id: ctx.params.id, title: 'task' }),
    });
    expectTypeOf(server).not.toBeNever();
  });
});

describe('section(path, router) — Plan 153', () => {
  const Hello = z.object({ tag: z.literal('hello') });
  const HelloResp = z.object({ message: z.string() });
  const GetTask = z.object({ tag: z.literal('get-task'), id: z.coerce.number() });
  const TaskResp = z.object({ id: z.number(), title: z.string() });

  const helloSubRouter = defineRoutes([
    httpRoute(Hello, 'GET', 'hello', { response: { 200: HelloResp } }),
  ]);
  const tasksSubRouter = defineRoutes([
    httpRoute(GetTask, 'GET', ':id', { response: { 200: TaskResp } }),
  ]);

  const apiRouter = defineRoutes([
    section('api', [
      section('greet', helloSubRouter),
      section('tasks', tasksSubRouter),
    ]),
  ]);

  it('_ctxMap carries sub-router tags without any leakage', () => {
    type Map = typeof apiRouter._ctxMap;
    expectTypeOf<Map['hello']['response']>().toEqualTypeOf<{ 200: { message: string } }>();
    expectTypeOf<Map['get-task']['response']>().toEqualTypeOf<{ 200: { id: number; title: string } }>();
  });

  it('createServer infers handler keys from embedded sub-router maps', () => {
    // Use literals — params extraction from section(path,router) requires non-widened _type (Plan 154)
    const server = createServer(apiRouter, {
      hello: (_ctx) => ({ message: 'hi' as const }),
      'get-task': (_ctx) => ({ id: 42, title: 'task' as const }),
    });
    expectTypeOf(server).not.toBeNever();
  });

  it('createClient accepts router with embedded sub-router maps', () => {
    const client = createClient('http://localhost', apiRouter);
    expectTypeOf(client).not.toBeNever();
  });
});
