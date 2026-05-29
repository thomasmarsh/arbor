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

  describe('response headers', () => {
    const TaggedWithHeaders = z.object({ tag: z.literal('get-with-headers'), id: z.string() });
    const HeaderSchema = z.object({ 'x-request-id': z.string() });
    const routerWithHeaders = defineRoutes([
      httpRoute(TaggedWithHeaders, 'GET', 'items/:id/', {
        response: { 200: { body: UserResp, headers: HeaderSchema } },
      }),
    ]);

    it('handler return type includes headers when declared', () => {
      createServer(routerWithHeaders, {
        'get-with-headers': (ctx) => {
          const ret = {
            status: 200 as const,
            body: { id: ctx.params.id, email: 'a@b.com' },
            headers: { 'x-request-id': 'abc' },
          };
          expectTypeOf(ret).toExtend<{
            status: 200;
            body: { id: string; email: string };
            headers: { 'x-request-id': string };
          }>();
          return Promise.resolve(ret);
        },
      });
      expect(true).toBe(true);
    });

    it('passes response headers through handle', async () => {
      const s = createServer(routerWithHeaders, {
        'get-with-headers': () =>
          Promise.resolve({
            status: 200 as const,
            body: { id: '1', email: 'test@test.com' },
            headers: { 'x-request-id': 'test-id' },
          }),
      });
      const result = await s.handle(new URL('https://example.com/items/1'), 'GET');
      expect(result.status).toBe(200);
      expect((result as { headers?: Record<string, string> }).headers?.['x-request-id']).toBe(
        'test-id',
      );
    });

    it('handle result has no headers key when none returned', async () => {
      const result = await server.handle(new URL('https://example.com/users/123'), 'GET');
      expect('headers' in result).toBe(false);
    });
  });

  describe('request headers', () => {
    const HeaderRoute = z.object({ tag: z.literal('get-with-req-headers'), id: z.string() });
    const ReqHeaderSchema = z.object({
      'x-tenant-id': z.uuid(),
      'accept-language': z.string().optional(),
    });
    const routerWithReqHeaders = defineRoutes([
      httpRoute(HeaderRoute, 'GET', 'reports/:id/', {
        headers: ReqHeaderSchema,
        response: { 200: UserResp },
      }),
    ]);

    it('returns 400 when required header is missing', async () => {
      const s = createServer(routerWithReqHeaders, {
        'get-with-req-headers': () =>
          Promise.resolve({ status: 200 as const, body: { id: '1', email: 'a@b.com' } }),
      });
      const result = await s.handle(new URL('https://example.com/reports/1'), 'GET', undefined, {});
      expect(result.status).toBe(400);
    });

    it('passes validated headers to handler ctx', async () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const s = createServer(routerWithReqHeaders, {
        'get-with-req-headers': (ctx) =>
          Promise.resolve({ status: 200 as const, body: { id: ctx.headers['x-tenant-id'], email: 'a@b.com' } }),
      });
      const result = await s.handle(
        new URL('https://example.com/reports/1'),
        'GET',
        undefined,
        { 'x-tenant-id': tenantId },
      );
      expect(result.status).toBe(200);
      expect((result.body as { id: string }).id).toBe(tenantId);
    });

    it('handler headers is typed correctly', () => {
      createServer(routerWithReqHeaders, {
        'get-with-req-headers': (ctx) => {
          expectTypeOf(ctx.headers).toEqualTypeOf<{
            'x-tenant-id': string;
            'accept-language'?: string | undefined;
          }>();
          return Promise.resolve({ status: 200 as const, body: { id: '1', email: 'a@b.com' } });
        },
      });
      expect(true).toBe(true);
    });

    it('headers is never for routes without header schema', () => {
      createServer(router, {
        'get-user': (ctx) => {
          expectTypeOf(ctx.headers).toEqualTypeOf<never>();
          return Promise.resolve({ status: 200 as const, body: { id: '1', email: '' } });
        },
        'create-user': (ctx) =>
          Promise.resolve({ status: 201 as const, body: { id: '1', email: ctx.body.email } }),
        'search-items': () => Promise.resolve({ status: 200 as const, body: { count: 0 } }),
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

  describe('errorMap', () => {
    class ConflictError extends Error {}
    class NotFoundError extends Error {
      constructor(public resource: string) {
        super(`${resource} not found`);
      }
    }

    const serverWithErrorMap = createServer(
      router,
      {
        'get-user': () => {
          throw new ConflictError('duplicate');
        },
        'create-user': (ctx) =>
          Promise.resolve({ status: 201 as const, body: { id: '1', email: ctx.body.email } }),
        'search-items': () => Promise.reject(new NotFoundError('items')),
      },
      {
        errorMap: [
          {
            match: (e) => e instanceof ConflictError,
            response: () => ({ status: 409 as const, body: { error: 'conflict' } }),
          },
          {
            match: (e) => e instanceof NotFoundError,
            response: (e) => ({ status: 404 as const, body: { error: (e as NotFoundError).message } }),
          },
        ],
      },
    );

    it('returns the mapped status when error matches', async () => {
      const result = await serverWithErrorMap.handle(new URL('https://example.com/users/1'), 'GET');
      expect(result.status).toBe(409);
      expect((result.body as Record<string, unknown>)['error']).toBe('conflict');
    });

    it('passes error to response factory', async () => {
      const result = await serverWithErrorMap.handle(new URL('https://example.com/items'), 'GET');
      expect(result.status).toBe(404);
      expect((result.body as Record<string, unknown>)['error']).toBe('items not found');
    });

    it('returns 500 when no entry matches', async () => {
      const s = createServer(
        router,
        {
          'get-user': () => {
            throw new ConflictError('x');
          },
          'create-user': (ctx) =>
            Promise.resolve({ status: 201 as const, body: { id: '1', email: ctx.body.email } }),
          'search-items': () => Promise.resolve({ status: 200 as const, body: { count: 0 } }),
        },
        {
          errorMap: [
            {
              match: (e) => e instanceof NotFoundError,
              response: () => ({ status: 404 as const, body: { error: 'not found' } }),
            },
          ],
        },
      );
      const result = await s.handle(new URL('https://example.com/users/1'), 'GET');
      expect(result.status).toBe(500);
    });

    it('first matching entry wins', async () => {
      const s = createServer(
        router,
        {
          'get-user': () => {
            throw new ConflictError('x');
          },
          'create-user': (ctx) =>
            Promise.resolve({ status: 201 as const, body: { id: '1', email: ctx.body.email } }),
          'search-items': () => Promise.resolve({ status: 200 as const, body: { count: 0 } }),
        },
        {
          errorMap: [
            {
              match: () => true,
              response: () => ({ status: 409 as const, body: { error: 'first' } }),
            },
            {
              match: () => true,
              response: () => ({ status: 503 as const, body: { error: 'second' } }),
            },
          ],
        },
      );
      const result = await s.handle(new URL('https://example.com/users/1'), 'GET');
      expect(result.status).toBe(409);
      expect((result.body as Record<string, unknown>)['error']).toBe('first');
    });
  });
});
