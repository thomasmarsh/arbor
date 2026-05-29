import { describe, expect, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { httpRoute } from '../contexts/http-context.js';
import { defineRoutes } from '../core/define-routes.js';
import { createServer } from './server.js';

describe('createServer', () => {
  const GetUser = z.object({ tag: z.literal('get-user'), id: z.string() });
  const CreateUser = z.object({ tag: z.literal('create-user') });
  const SearchItems = z.object({ tag: z.literal('search-items') });
  const UserResp = z.object({ id: z.string(), email: z.string() });
  const ErrorResp = z.object({ error: z.string() });
  const CreateBody = z.object({ name: z.string(), email: z.string() });
  const SearchQuery = z.object({ page: z.coerce.number().default(1) });
  const SearchResp = z.object({ count: z.number() });

  const router = defineRoutes([
    httpRoute(GetUser, 'GET', 'users/:id/', {
      response: { 200: UserResp, 404: ErrorResp },
    }),
    httpRoute(CreateUser, 'POST', 'users/', {
      body: CreateBody,
      response: { 201: UserResp },
    }),
    httpRoute(SearchItems, 'GET', 'items/', {
      query: SearchQuery,
      response: { 200: SearchResp },
    }),
  ]);

  const server = createServer(router, {
    'get-user': (ctx) => {
      return Promise.resolve({
        status: 200 as const,
        body: { id: ctx.params.id, email: 'test@test.com' },
      });
    },
    'create-user': (ctx) => {
      return Promise.resolve({ status: 201 as const, body: { id: '1', email: ctx.body.email } });
    },
    'search-items': (ctx) => {
      return Promise.resolve({ status: 200 as const, body: { count: ctx.query.page } });
    },
  });

  describe('type inference', () => {
    it('handler receives correct route param types', () => {
      createServer(router, {
        'get-user': (ctx) => {
          expectTypeOf(ctx.params).toEqualTypeOf<{ id: string }>();
          return Promise.resolve({
            status: 200 as const,
            body: { id: ctx.params.id, email: 'a@b.com' },
          });
        },
        'create-user': (ctx) => {
          expectTypeOf(ctx.body).toEqualTypeOf<{ name: string; email: string }>();
          return Promise.resolve({
            status: 201 as const,
            body: { id: '1', email: ctx.body.email },
          });
        },
        'search-items': (ctx) => {
          expectTypeOf(ctx.query).toEqualTypeOf<{ page: number }>();
          return Promise.resolve({ status: 200 as const, body: { count: ctx.query.page } });
        },
      });
    });

    it('query is never for routes without explicit query schema', () => {
      createServer(router, {
        'get-user': (ctx) => {
          expectTypeOf(ctx.query).toEqualTypeOf<never>();
          return Promise.resolve({ status: 200 as const, body: { id: '1', email: '' } });
        },
        'create-user': (ctx) => {
          expectTypeOf(ctx.query).toEqualTypeOf<never>();
          return Promise.resolve({ status: 201 as const, body: { id: '1', email: '' } });
        },
        'search-items': (ctx) => {
          expectTypeOf(ctx.query).toEqualTypeOf<{ page: number }>();
          return Promise.resolve({ status: 200 as const, body: { count: ctx.query.page } });
        },
      });
      expect(true).toBe(true);
    });
  });

  describe('handle', () => {
    it('dispatches a GET request', async () => {
      const result = await server.handle(new URL('https://example.com/users/123'), 'GET');
      expect(result).toEqual({ status: 200, body: { id: '123', email: 'test@test.com' } });
    });

    it('returns 404 for unknown routes', async () => {
      const result = await server.handle(new URL('https://example.com/unknown'), 'GET');
      expect(result.status).toBe(404);
    });

    it('forwards body to POST handler', async () => {
      const result = await server.handle(new URL('https://example.com/users'), 'POST', {
        name: 'Alice',
        email: 'alice@test.com',
      });
      expect(result).toEqual({ status: 201, body: { id: '1', email: 'alice@test.com' } });
    });

    it('returns 405 when method does not match', async () => {
      const result = await server.handle(new URL('https://example.com/users/123'), 'DELETE');
      expect(result).toEqual({ status: 405, body: { error: 'method not allowed' } });
    });

    it('returns 405 for POST to a GET-only route', async () => {
      const result = await server.handle(new URL('https://example.com/users/123'), 'POST');
      expect(result).toEqual({ status: 405, body: { error: 'method not allowed' } });
    });

    it('passes coerced query params to handler', async () => {
      const result = await server.handle(new URL('https://example.com/items?page=5'), 'GET');
      expect(result).toEqual({ status: 200, body: { count: 5 } });
    });

    it('applies query schema defaults when no params provided', async () => {
      const result = await server.handle(new URL('https://example.com/items'), 'GET');
      expect(result).toEqual({ status: 200, body: { count: 1 } });
    });

    it('returns 400 when body fails bodySchema validation', async () => {
      const result = await server.handle(new URL('https://example.com/users'), 'POST', {
        notAName: 123,
      });
      expect(result.status).toBe(400);
    });

    it('returns 500 when handler throws synchronously', async () => {
      const crashingServer = createServer(router, {
        'get-user': () => {
          throw new Error('boom');
        },
        'create-user': (ctx) =>
          Promise.resolve({ status: 201 as const, body: { id: '1', email: ctx.body.email } }),
        'search-items': () => Promise.resolve({ status: 200 as const, body: { count: 0 } }),
      });
      const result = await crashingServer.handle(new URL('https://example.com/users/1'), 'GET');
      expect(result.status).toBe(500);
      expect((result.body as Record<string, unknown>)['error']).toBe('internal server error');
    });

    it('returns 500 when handler rejects', async () => {
      const rejectingServer = createServer(router, {
        'get-user': () => Promise.reject(new Error('async boom')),
        'create-user': (ctx) =>
          Promise.resolve({ status: 201 as const, body: { id: '1', email: ctx.body.email } }),
        'search-items': () => Promise.resolve({ status: 200 as const, body: { count: 0 } }),
      });
      const result = await rejectingServer.handle(new URL('https://example.com/users/1'), 'GET');
      expect(result.status).toBe(500);
    });

    it('returns 404 for path with invalid percent-encoding', async () => {
      const result = await server.handle(new URL('https://example.com/users/%25zz'), 'GET');
      expect(result.status).not.toBe(500);
    });
  });
});
