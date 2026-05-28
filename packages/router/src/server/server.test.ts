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
    'get-user': (route) => {
      return Promise.resolve({
        status: 200 as const,
        body: { id: route.id, email: 'test@test.com' },
      });
    },
    'create-user': (_route, body) => {
      return Promise.resolve({ status: 201 as const, body: { id: '1', email: body.email } });
    },
    'search-items': (_route, _body, query) => {
      return Promise.resolve({ status: 200 as const, body: { count: query.page } });
    },
  });

  describe('type inference', () => {
    it('handler receives correct route param types', () => {
      createServer(router, {
        'get-user': (route) => {
          expectTypeOf(route).toEqualTypeOf<{ tag: 'get-user'; id: string }>();
          return Promise.resolve({
            status: 200 as const,
            body: { id: route.id, email: 'a@b.com' },
          });
        },
        'create-user': (route, body) => {
          expectTypeOf(route).toEqualTypeOf<{ tag: 'create-user' }>();
          expectTypeOf(body).toEqualTypeOf<{ name: string; email: string }>();
          return Promise.resolve({ status: 201 as const, body: { id: '1', email: body.email } });
        },
        'search-items': (route, _body, query) => {
          expectTypeOf(route).toEqualTypeOf<{ tag: 'search-items'; query: { page: number } }>();
          expectTypeOf(query).toEqualTypeOf<{ page: number }>();
          return Promise.resolve({ status: 200 as const, body: { count: query.page } });
        },
      });
    });

    it('query is never for routes without explicit query schema', () => {
      createServer(router, {
        'get-user': (_route, _body, query) => {
          expectTypeOf(query).toEqualTypeOf<never>();
          return Promise.resolve({ status: 200 as const, body: { id: '1', email: '' } });
        },
        'create-user': (_route, _body, query) => {
          expectTypeOf(query).toEqualTypeOf<never>();
          return Promise.resolve({ status: 201 as const, body: { id: '1', email: '' } });
        },
        'search-items': (_route, _body, query) => {
          expectTypeOf(query).toEqualTypeOf<{ page: number }>();
          return Promise.resolve({ status: 200 as const, body: { count: query.page } });
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
      const result = await server.handle(
        new URL('https://example.com/users'),
        'POST',
        { name: 'Alice', email: 'alice@test.com' },
      );
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
  });
});
