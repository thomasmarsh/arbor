import { describe, expect, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { httpRoute, respond } from '../contexts/http-context.js';
import { defineRoutes } from '../core/define-routes.js';
import { createServer } from './server.js';

describe('Server over single-route router', () => {
  it('returns 404 when request path does not match the only registered route', async () => {
    const Only = z.object({ tag: z.literal('only') });
    const router = defineRoutes([
      httpRoute(Only, 'GET', 'only/', { response: { 200: z.object({ ok: z.boolean() }) } }),
    ]);
    const server = createServer(router, {
      only: () => Promise.resolve(respond(200, { ok: true })),
    });
    const result = await server.handle(new URL('https://example.com/other'), 'GET');
    expect(result.status).toBe(404);
  });

  it('single route: successful dispatch', async () => {
    const Only = z.object({ tag: z.literal('only') });
    const router = defineRoutes([
      httpRoute(Only, 'GET', 'only/', { response: { 200: z.object({ ok: z.boolean() }) } }),
    ]);
    const server = createServer(router, {
      only: () => Promise.resolve(respond(200, { ok: true })),
    });
    const result = await server.handle(new URL('https://example.com/only'), 'GET');
    expect(result).toMatchObject({ status: 200, body: { ok: true } });
  });
});

describe('Body and query types', () => {
  const GetRoute = z.object({ tag: z.literal('get-item'), id: z.string() });
  const PostRoute = z.object({ tag: z.literal('post-item') });
  const ItemResp = z.object({ id: z.string() });
  const CreateBody = z.object({ name: z.string() });
  const SearchQuery = z.object({ q: z.string().optional(), page: z.coerce.number().default(1) });
  const SearchRoute = z.object({ tag: z.literal('search') });

  const router = defineRoutes([
    httpRoute(GetRoute, 'GET', 'items/:id/', { response: { 200: ItemResp } }),
    httpRoute(PostRoute, 'POST', 'items/', { body: CreateBody, response: { 201: ItemResp } }),
    httpRoute(SearchRoute, 'GET', 'search/', { query: SearchQuery, response: { 200: ItemResp } }),
  ]);

  it('GET route without body schema: ctx.body type is never', () => {
    createServer(router, {
      'get-item': (ctx) => {
        expectTypeOf(ctx.body).toEqualTypeOf<never>();
        return Promise.resolve(respond(200, { id: ctx.params.id }));
      },
      'post-item': (_ctx) => Promise.resolve(respond(201, { id: '1' })),
      search: (_ctx) => Promise.resolve(respond(200, { id: '1' })),
    });
  });

  it('GET route without query schema: ctx.query type is never', () => {
    createServer(router, {
      'get-item': (ctx) => {
        expectTypeOf(ctx.query).toEqualTypeOf<never>();
        return Promise.resolve(respond(200, { id: ctx.params.id }));
      },
      'post-item': (_ctx) => Promise.resolve(respond(201, { id: '1' })),
      search: (_ctx) => Promise.resolve(respond(200, { id: '1' })),
    });
  });

  it('route with query schema and defaults: absent params use defaults', async () => {
    const server = createServer(router, {
      'get-item': () => Promise.resolve(respond(200, { id: '1' })),
      'post-item': () => Promise.resolve(respond(201, { id: '1' })),
      search: (ctx) => Promise.resolve(respond(200, { id: String(ctx.query.page) })),
    });
    const result = await server.handle(new URL('https://example.com/search'), 'GET');
    expect(result).toMatchObject({ status: 200, body: { id: '1' } });
  });

  it('route with optional query param present: value is accessible', async () => {
    const server = createServer(router, {
      'get-item': () => Promise.resolve(respond(200, { id: '1' })),
      'post-item': () => Promise.resolve(respond(201, { id: '1' })),
      search: (ctx) => Promise.resolve(respond(200, { id: ctx.query.q ?? 'none' })),
    });
    const result = await server.handle(new URL('https://example.com/search?q=hello'), 'GET');
    expect(result).toMatchObject({ status: 200, body: { id: 'hello' } });
  });
});

describe('Path segment edge cases in server', () => {
  const PairRoute = z.object({ tag: z.literal('pair'), x: z.string(), y: z.string() });
  const PairResp = z.object({ result: z.string() });

  const router = defineRoutes([
    httpRoute(PairRoute, 'GET', ':x/:y/', { response: { 200: PairResp } }),
  ]);

  it('consecutive path params: both params accessible at runtime', async () => {
    const server = createServer(router, {
      pair: (ctx) =>
        Promise.resolve(respond(200, { result: `${ctx.params.x}+${ctx.params.y}` })),
    });
    const result = await server.handle(new URL('https://example.com/foo/bar'), 'GET');
    expect(result).toMatchObject({ status: 200, body: { result: 'foo+bar' } });
  });

  it('consecutive path params: params correctly typed in handler', () => {
    createServer(router, {
      pair: (ctx) => {
        expectTypeOf(ctx.params).toEqualTypeOf<{ x: string; y: string }>();
        return Promise.resolve(respond(200, { result: '' }));
      },
    });
  });

  it('wildcard route: server matches any URL pattern', async () => {
    const CatchAll = z.object({ tag: z.literal('catch-all'), rest: z.array(z.string()) });
    const CatchResp = z.object({ matched: z.boolean() });
    const wildcardRouter = defineRoutes([
      httpRoute(CatchAll, 'GET', '*rest/', { response: { 200: CatchResp } }),
    ]);
    const server = createServer(wildcardRouter, {
      'catch-all': () => Promise.resolve(respond(200, { matched: true })),
    });
    const result = await server.handle(new URL('https://example.com/any/path/here'), 'GET');
    expect(result).toMatchObject({ status: 200, body: { matched: true } });
  });
});

describe('HTTP method edge cases', () => {
  const ItemResp = z.object({ id: z.string() });
  const UpdateBody = z.object({ name: z.string() });
  const GetRoute = z.object({ tag: z.literal('get-item'), id: z.string() });
  const DeleteRoute = z.object({ tag: z.literal('delete-item'), id: z.string() });
  const PutRoute = z.object({ tag: z.literal('put-item'), id: z.string() });

  const router = defineRoutes([
    httpRoute(GetRoute, 'GET', 'items/:id/', { response: { 200: ItemResp } }),
    httpRoute(DeleteRoute, 'DELETE', 'items/:id/delete/', { response: { 204: ItemResp } }),
    httpRoute(PutRoute, 'PUT', 'items/:id/put/', { body: UpdateBody, response: { 200: ItemResp } }),
  ]);

  const server = createServer(router, {
    'get-item': (ctx) => Promise.resolve(respond(200, { id: ctx.params.id })),
    'delete-item': (ctx) => Promise.resolve(respond(204, { id: ctx.params.id })),
    'put-item': (ctx) => Promise.resolve(respond(200, { id: ctx.params.id })),
  });

  it('DELETE route: dispatches correctly', async () => {
    const result = await server.handle(new URL('https://example.com/items/42/delete'), 'DELETE');
    expect(result).toMatchObject({ status: 204, body: { id: '42' } });
  });

  it('DELETE route: returns 405 for GET request', async () => {
    const result = await server.handle(new URL('https://example.com/items/42/delete'), 'GET');
    expect(result.status).toBe(405);
  });

  it('PUT route with body: dispatched correctly', async () => {
    const result = await server.handle(
      new URL('https://example.com/items/42/put'),
      'PUT',
      { name: 'updated' },
    );
    expect(result).toMatchObject({ status: 200, body: { id: '42' } });
  });

  it('PUT route with invalid body: returns 400', async () => {
    const result = await server.handle(
      new URL('https://example.com/items/42/put'),
      'PUT',
      { wrong: 'field' },
    );
    expect(result.status).toBe(400);
  });
});
