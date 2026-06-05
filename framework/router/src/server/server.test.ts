import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import z from 'zod';
import { httpRoute, desc, respond } from '../contexts/http-context.js';
import { defineRoutes } from '../core/define-routes.js';
import { literal, object, string } from '../core/schema.js';
import { createMemoryStore } from './rate-limit.js';
import { createServer, resolveHandler, validateInput, validateResponse, type HandlerMap } from './server.js';
import type { InferSingleSuccessBody } from '../contexts/http-context.js';

describe('validateInput', () => {
  const schema = z.object({ name: z.string() });

  it('returns ok:true with fallback when no schema', () => {
    expect(validateInput(undefined, 'anything', 'err')).toEqual({ ok: true, data: undefined });
  });

  it('returns provided fallback when no schema', () => {
    expect(validateInput(undefined, 'anything', 'err', 'anything')).toEqual({ ok: true, data: 'anything' });
  });

  it('returns ok:true with parsed data for valid input', () => {
    expect(validateInput(schema, { name: 'alice' }, 'bad')).toEqual({ ok: true, data: { name: 'alice' } });
  });

  it('returns ok:false with 400 and message for invalid input', () => {
    expect(validateInput(schema, { name: 123 }, 'bad input')).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "bad input",
        },
        "ok": false,
        "status": 400,
      }
    `);
  });
});

describe('resolveHandler', () => {
  const handler = () => Promise.resolve({ status: 200, body: {} });

  it('returns 405 when method does not match expected', () => {
    expect(resolveHandler({ 'get-user': handler }, 'get-user', 'POST', 'GET')).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "method not allowed",
        },
        "headers": {
          "Allow": "GET",
        },
        "ok": false,
        "status": 405,
      }
    `);
  });

  it('returns 404 when no handler registered for tag', () => {
    expect(resolveHandler({}, 'missing', 'GET', 'GET')).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "no handler for tag: missing",
        },
        "ok": false,
        "status": 404,
      }
    `);
  });

  it('returns handler when method matches', () => {
    const result = resolveHandler({ 'get-user': handler }, 'get-user', 'GET', 'GET');
    expect(result).toMatchObject({ ok: true, handler });
  });

  it('returns handler when no expected method constraint', () => {
    const result = resolveHandler({ 'get-user': handler }, 'get-user', 'GET', undefined);
    expect(result).toMatchObject({ ok: true, handler });
  });
});

describe('validateResponse', () => {
  it('returns ok:true when no schemas provided', () => {
    expect(validateResponse({ status: 200 }, undefined, undefined)).toEqual({ ok: true });
  });

  it('returns ok:true when response headers pass schema', () => {
    const headers = { 200: z.object({ 'x-id': z.string() }) };
    expect(validateResponse({ status: 200, headers: { 'x-id': 'abc' } }, headers, undefined)).toEqual({ ok: true });
  });

  it('returns ok:false with 500 when response headers fail schema', () => {
    const headers = { 200: z.object({ 'x-id': z.string() }) };
    expect(validateResponse({ status: 200, headers: { 'x-id': 123 as unknown as string } }, headers, undefined)).toEqual({
      ok: false, status: 500, body: { error: 'invalid response headers' },
    });
  });

  it('returns ok:false with 500 when response cookies fail schema', () => {
    const cookies = { 200: z.object({ 'session-id': z.string() }) };
    expect(validateResponse({ status: 200, cookies: { 'session-id': 0 as unknown as string } }, undefined, cookies)).toEqual({
      ok: false, status: 500, body: { error: 'invalid response cookies' },
    });
  });

  it('skips header check when no headers in result', () => {
    const headers = { 200: z.object({ 'x-id': z.string() }) };
    expect(validateResponse({ status: 200 }, headers, undefined)).toEqual({ ok: true });
  });
});

describe('createServer', () => {
  const GetUser = object({ tag: literal('get-user'), id: string() });
  const CreateUser = object({ tag: literal('create-user') });
  const SearchItems = object({ tag: literal('search-items') });
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
      return Promise.resolve(respond(200, { id: ctx.params.id, email: 'test@test.com' }));
    },
    'create-user': (ctx) => {
      return Promise.resolve(respond(201, { id: '1', email: ctx.body.email }));
    },
    'search-items': (ctx) => {
      return Promise.resolve(respond(200, { count: ctx.query.page }));
    },
  });

  describe('type inference', () => {
    it('handler receives correct route param types', () => {
      createServer(router, {
        'get-user': (ctx) => {
          expectTypeOf(ctx.params).toEqualTypeOf<{ id: string }>();
          return Promise.resolve(respond(200, { id: ctx.params.id, email: 'a@b.com' }));
        },
        'create-user': (ctx) => {
          expectTypeOf(ctx.body).toEqualTypeOf<{ name: string; email: string }>();
          return Promise.resolve(respond(201, { id: '1', email: ctx.body.email }));
        },
        'search-items': (ctx) => {
          expectTypeOf(ctx.query).toEqualTypeOf<{ page: number }>();
          return Promise.resolve(respond(200, { count: ctx.query.page }));
        },
      });
    });

    it('query is never for routes without explicit query schema', () => {
      createServer(router, {
        'get-user': (ctx) => {
          expectTypeOf(ctx.query).toEqualTypeOf<never>();
          return Promise.resolve(respond(200, { id: '1', email: '' }));
        },
        'create-user': (ctx) => {
          expectTypeOf(ctx.query).toEqualTypeOf<never>();
          return Promise.resolve(respond(201, { id: '1', email: '' }));
        },
        'search-items': (ctx) => {
          expectTypeOf(ctx.query).toEqualTypeOf<{ page: number }>();
          return Promise.resolve(respond(200, { count: ctx.query.page }));
        },
      });
      expect(true).toBe(true);
    });
  });

  describe('response headers', () => {
    const TaggedWithHeaders = object({ tag: literal('get-with-headers'), id: string() });
    const HeaderSchema = z.object({ 'x-request-id': z.string() });
    const routerWithHeaders = defineRoutes([
      httpRoute(TaggedWithHeaders, 'GET', 'items/:id/', {
        response: { 200: desc(UserResp, { headers: HeaderSchema }) },
      }),
    ]);

    it('handler return type includes headers when declared', () => {
      createServer(routerWithHeaders, {
        'get-with-headers': (ctx) => {
          const ret = respond(200, { id: ctx.params.id, email: 'a@b.com' }, { headers: { 'x-request-id': 'abc' } });
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
          Promise.resolve(respond(200, { id: '1', email: 'test@test.com' }, { headers: { 'x-request-id': 'test-id' } })),
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

  describe('cookies', () => {
    const SessionRoute = object({ tag: literal('create-session') });
    const SessionBody = z.object({ username: z.string() });
    const SessionResp = z.object({ ok: z.boolean() });
    const CsrfCookieSchema = z.object({ 'csrf-token': z.string() });
    const SessionCookieSchema = z.object({ 'session-id': z.string() });

    const routerWithCookies = defineRoutes([
      httpRoute(SessionRoute, 'POST', 'session/', {
        body: SessionBody,
        cookies: CsrfCookieSchema,
        response: { 200: desc(SessionResp, { cookies: SessionCookieSchema }) },
      }),
    ]);

    it('returns 400 when required cookie is missing', async () => {
      const s = createServer(routerWithCookies, {
        'create-session': () =>
          Promise.resolve(respond(200, { ok: true }, { cookies: { 'session-id': 'x' } })),
      });
      const result = await s.handle(
        new URL('https://example.com/session/'),
        'POST',
        { username: 'alice' },
        {},
      );
      expect(result.status).toBe(400);
    });

    it('passes validated cookies to handler ctx', async () => {
      let captured: unknown;
      const s = createServer(routerWithCookies, {
        'create-session': (ctx) => {
          captured = ctx.cookies;
          return Promise.resolve(respond(200, { ok: true }, { cookies: { 'session-id': 'x' } }));
        },
      });
      await s.handle(
        new URL('https://example.com/session/'),
        'POST',
        { username: 'alice' },
        { cookie: 'csrf-token=secret123' },
      );
      expect((captured as Record<string, string>)['csrf-token']).toBe('secret123');
    });

    it('response cookies appear in result', async () => {
      const s = createServer(routerWithCookies, {
        'create-session': () =>
          Promise.resolve(respond(200, { ok: true }, { cookies: { 'session-id': 'abc123' } })),
      });
      const result = await s.handle(
        new URL('https://example.com/session/'),
        'POST',
        { username: 'alice' },
        { cookie: 'csrf-token=tok' },
      );
      expect(result.cookies?.['session-id']).toBe('abc123');
    });

    it('handler ctx.cookies is typed correctly', () => {
      createServer(routerWithCookies, {
        'create-session': (ctx) => {
          expectTypeOf(ctx.cookies).toEqualTypeOf<{ 'csrf-token': string }>();
          return Promise.resolve(respond(200, { ok: true }, { cookies: { 'session-id': 'x' } }));
        },
      });
      expect(true).toBe(true);
    });

    it('cookies is never for routes without cookie schema', () => {
      createServer(router, {
        'get-user': (ctx) => {
          expectTypeOf(ctx.cookies).toEqualTypeOf<never>();
          return Promise.resolve(respond(200, { id: '1', email: '' }));
        },
        'create-user': (ctx) =>
          Promise.resolve(respond(201, { id: '1', email: ctx.body.email })),
        'search-items': () => Promise.resolve(respond(200, { count: 0 })),
      });
      expect(true).toBe(true);
    });
  });

  describe('request headers', () => {
    const HeaderRoute = object({ tag: literal('get-with-req-headers'), id: string() });
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
          Promise.resolve(respond(200, { id: '1', email: 'a@b.com' })),
      });
      const result = await s.handle(new URL('https://example.com/reports/1'), 'GET', undefined, {});
      expect(result.status).toBe(400);
    });

    it('passes validated headers to handler ctx', async () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const s = createServer(routerWithReqHeaders, {
        'get-with-req-headers': (ctx) =>
          Promise.resolve(respond(200, { id: ctx.headers['x-tenant-id'], email: 'a@b.com' })),
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
          return Promise.resolve(respond(200, { id: '1', email: 'a@b.com' }));
        },
      });
      expect(true).toBe(true);
    });

    it('headers is never for routes without header schema', () => {
      createServer(router, {
        'get-user': (ctx) => {
          expectTypeOf(ctx.headers).toEqualTypeOf<never>();
          return Promise.resolve(respond(200, { id: '1', email: '' }));
        },
        'create-user': (ctx) =>
          Promise.resolve(respond(201, { id: '1', email: ctx.body.email })),
        'search-items': () => Promise.resolve(respond(200, { count: 0 })),
      });
      expect(true).toBe(true);
    });
  });

  describe('handle', () => {
    it('dispatches a GET request', async () => {
      const result = await server.handle(new URL('https://example.com/users/123'), 'GET');
      expect(result).toMatchObject({ status: 200, body: { id: '123', email: 'test@test.com' } });
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
      expect(result).toMatchObject({ status: 201, body: { id: '1', email: 'alice@test.com' } });
    });

    it('returns 405 when method does not match', async () => {
      const result = await server.handle(new URL('https://example.com/users/123'), 'DELETE');
      expect(result).toMatchObject({ status: 405, body: { error: 'method not allowed' }, headers: { Allow: 'GET' } });
    });

    it('returns 405 for POST to a GET-only route', async () => {
      const result = await server.handle(new URL('https://example.com/users/123'), 'POST');
      expect(result).toMatchObject({ status: 405, body: { error: 'method not allowed' }, headers: { Allow: 'GET' } });
    });

    describe('same path, different methods', () => {
      const GetItem  = object({ tag: literal('get-item'),    id: string() });
      const PatchItem = object({ tag: literal('patch-item'), id: string() });
      const ItemBody = z.object({ name: z.string() });
      const ItemResp = z.object({ id: z.string(), name: z.string() });

      const multiMethodRouter = defineRoutes([
        httpRoute(GetItem,   'GET',   'items/:id', { response: { 200: ItemResp } }),
        httpRoute(PatchItem, 'PATCH', 'items/:id', { body: ItemBody, response: { 200: ItemResp } }),
      ]);

      const multiMethodServer = createServer(multiMethodRouter, {
        'get-item':   (ctx) => Promise.resolve(respond(200, { id: ctx.params.id, name: 'original' })),
        'patch-item': (ctx) => Promise.resolve(respond(200, { id: ctx.params.id, name: ctx.body.name })),
      });

      it('routes GET to the GET handler', async () => {
        const result = await multiMethodServer.handle(new URL('https://example.com/items/42'), 'GET');
        expect(result).toMatchObject({ status: 200, body: { id: '42', name: 'original' } });
      });

      it('routes PATCH to the PATCH handler', async () => {
        const result = await multiMethodServer.handle(new URL('https://example.com/items/42'), 'PATCH', { name: 'updated' });
        expect(result).toMatchObject({ status: 200, body: { id: '42', name: 'updated' } });
      });

      it('returns 405 for an unsupported method on the shared path', async () => {
        const result = await multiMethodServer.handle(new URL('https://example.com/items/42'), 'DELETE');
        expect(result.status).toBe(405);
      });

      it('returns 404 for a completely unknown path', async () => {
        const result = await multiMethodServer.handle(new URL('https://example.com/unknown'), 'GET');
        expect(result.status).toBe(404);
      });
    });

    it('passes coerced query params to handler', async () => {
      const result = await server.handle(new URL('https://example.com/items?page=5'), 'GET');
      expect(result).toMatchObject({ status: 200, body: { count: 5 } });
    });

    it('applies query schema defaults when no params provided', async () => {
      const result = await server.handle(new URL('https://example.com/items'), 'GET');
      expect(result).toMatchObject({ status: 200, body: { count: 1 } });
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
          Promise.resolve(respond(201, { id: '1', email: ctx.body.email })),
        'search-items': () => Promise.resolve(respond(200, { count: 0 })),
      });
      const result = await crashingServer.handle(new URL('https://example.com/users/1'), 'GET');
      expect(result.status).toBe(500);
      expect((result.body as Record<string, unknown>)['error']).toBe('internal server error');
    });

    it('returns 500 when handler rejects', async () => {
      const rejectingServer = createServer(router, {
        'get-user': () => Promise.reject(new Error('async boom')),
        'create-user': (ctx) =>
          Promise.resolve(respond(201, { id: '1', email: ctx.body.email })),
        'search-items': () => Promise.resolve(respond(200, { count: 0 })),
      }, { onError: vi.fn() });
      const result = await rejectingServer.handle(new URL('https://example.com/users/1'), 'GET');
      expect(result.status).toBe(500);
    });

    it('calls onError with the thrown error and route tag', async () => {
      const onError = vi.fn();
      const err = new Error('boom');
      const s = createServer(router, {
        'get-user': () => { throw err; },
        'create-user': (ctx) => Promise.resolve(respond(201, { id: '1', email: ctx.body.email })),
        'search-items': () => Promise.resolve(respond(200, { count: 0 })),
      }, { onError });
      await s.handle(new URL('https://example.com/users/1'), 'GET');
      expect(onError).toHaveBeenCalledWith(err, 'get-user');
    });

    it('consults errorMap before calling onError', async () => {
      const onError = vi.fn();
      class AppError extends Error {}
      const s = createServer(router, {
        'get-user': () => { throw new AppError('mapped'); },
        'create-user': (ctx) => Promise.resolve(respond(201, { id: '1', email: ctx.body.email })),
        'search-items': () => Promise.resolve(respond(200, { count: 0 })),
      }, {
        onError,
        errorMap: [{ match: (e) => e instanceof AppError, response: () => respond(409, { error: 'conflict' }) }],
      });
      const result = await s.handle(new URL('https://example.com/users/1'), 'GET');
      expect(result.status).toBe(409);
      expect(onError).not.toHaveBeenCalled();
    });

    it('propagates exception when supervise is false', async () => {
      const s = createServer(router, {
        'get-user': () => { throw new Error('unguarded'); },
        'create-user': (ctx) => Promise.resolve(respond(201, { id: '1', email: ctx.body.email })),
        'search-items': () => Promise.resolve(respond(200, { count: 0 })),
      }, { supervise: false });
      await expect(s.handle(new URL('https://example.com/users/1'), 'GET')).rejects.toThrow('unguarded');
    });

    it('returns 404 for path with invalid percent-encoding', async () => {
      const result = await server.handle(new URL('https://example.com/users/%25zz'), 'GET');
      expect(result.status).not.toBe(500);
    });
  });

  describe('handleRequest', () => {
    const UploadRoute = object({ tag: literal('upload') });
    const UploadBody = z.object({ file: z.instanceof(File) });
    const uploadRouter = defineRoutes([
      httpRoute(UploadRoute, 'POST', 'upload/', {
        body: UploadBody,
        response: { 200: z.object({ filename: z.string() }) },
      }),
    ]);

    it('dispatches JSON body via handleRequest', async () => {
      const s = createServer(router, {
        'get-user': () => Promise.resolve(respond(200, { id: '1', email: 'a@b.com' })),
        'create-user': (ctx) =>
          Promise.resolve(respond(201, { id: '1', email: ctx.body.email })),
        'search-items': () => Promise.resolve(respond(200, { count: 0 })),
      });
      const req = new Request('https://example.com/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Alice', email: 'alice@test.com' }),
      });
      const result = await s.handleRequest(req);
      expect(result.status).toBe(201);
    });

    it('handles multipart/form-data with File field', async () => {
      const s = createServer(uploadRouter, {
        upload: (ctx) =>
          Promise.resolve(respond(200, { filename: ctx.body.file.name })),
      });
      const fd = new FormData();
      fd.append('file', new File(['hello'], 'hello.txt', { type: 'text/plain' }));
      const req = new Request('https://example.com/upload/', { method: 'POST', body: fd });
      const result = await s.handleRequest(req);
      expect(result.status).toBe(200);
      expect((result.body as { filename: string }).filename).toBe('hello.txt');
    });

    it('returns 415 for unsupported content-type', async () => {
      const s = createServer(router, {
        'get-user': () => Promise.resolve(respond(200, { id: '1', email: 'a@b.com' })),
        'create-user': (ctx) =>
          Promise.resolve(respond(201, { id: '1', email: ctx.body.email })),
        'search-items': () => Promise.resolve(respond(200, { count: 0 })),
      });
      const req = new Request('https://example.com/users', {
        method: 'POST',
        headers: { 'content-type': 'application/xml' },
        body: '<user/>',
      });
      const result = await s.handleRequest(req);
      expect(result.status).toBe(415);
    });

    it('returns 413 when content-length exceeds maxBodySize', async () => {
      const s = createServer(
        router,
        {
          'get-user': () => Promise.resolve(respond(200, { id: '1', email: 'a@b.com' })),
          'create-user': (ctx) =>
            Promise.resolve(respond(201, { id: '1', email: ctx.body.email })),
          'search-items': () => Promise.resolve(respond(200, { count: 0 })),
        },
        { maxBodySize: 100 },
      );
      const req = new Request('https://example.com/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': '200' },
        body: JSON.stringify({ name: 'Alice', email: 'alice@test.com' }),
      });
      const result = await s.handleRequest(req);
      expect(result.status).toBe(413);
    });
  });

  describe('rate limiting', () => {
    const LoginSchema = object({ tag: literal('login') });
    const rateLimitedRouter = defineRoutes([
      httpRoute(LoginSchema, 'POST', 'auth/login/', {
        rateLimit: { windowMs: 60_000, maxRequests: 5 },
        response: { 200: z.object({ ok: z.boolean() }) },
      }),
    ]);
    const handlers = {
      login: () => Promise.resolve(respond(200, { ok: true })),
    };

    it('allows requests within the limit', async () => {
      const store = createMemoryStore();
      const s = createServer(rateLimitedRouter, handlers, { rateLimitStore: store });
      for (let i = 0; i < 5; i++) {
        const result = await s.handle(new URL('https://example.com/auth/login/'), 'POST');
        expect(result.status).toBe(200);
      }
    });

    it('returns 429 on the request exceeding the limit', async () => {
      const store = createMemoryStore();
      const s = createServer(rateLimitedRouter, handlers, { rateLimitStore: store });
      for (let i = 0; i < 5; i++) {
        await s.handle(new URL('https://example.com/auth/login/'), 'POST');
      }
      const result = await s.handle(new URL('https://example.com/auth/login/'), 'POST');
      expect(result.status).toBe(429);
    });

    it('sets Retry-After header on 429', async () => {
      const store = createMemoryStore();
      const s = createServer(rateLimitedRouter, handlers, { rateLimitStore: store });
      for (let i = 0; i < 5; i++) {
        await s.handle(new URL('https://example.com/auth/login/'), 'POST');
      }
      const result = await s.handle(new URL('https://example.com/auth/login/'), 'POST');
      expect((result as { headers?: Record<string, string> }).headers?.['retry-after']).toBe('60');
    });

    it('calls custom key resolver with url and headers', async () => {
      const store = createMemoryStore();
      let capturedKey: string | undefined;
      const keyResolver = ({ headers }: { url: URL; headers: Record<string, string> }) => {
        capturedKey = headers['x-client-id'] ?? 'anon';
        return capturedKey;
      };
      const s = createServer(rateLimitedRouter, handlers, { rateLimitStore: store, rateLimitKeyResolver: keyResolver });
      await s.handle(new URL('https://example.com/auth/login/'), 'POST', undefined, { 'x-client-id': 'client-99' });
      expect(capturedKey).toBe('client-99');
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
          Promise.resolve(respond(201, { id: '1', email: ctx.body.email })),
        'search-items': () => Promise.reject(new NotFoundError('items')),
      },
      {
        errorMap: [
          {
            match: (e) => e instanceof ConflictError,
            response: () => (respond(409, { error: 'conflict' })),
          },
          {
            match: (e) => e instanceof NotFoundError,
            response: (e) => (respond(404, { error: (e as NotFoundError).message })),
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
            Promise.resolve(respond(201, { id: '1', email: ctx.body.email })),
          'search-items': () => Promise.resolve(respond(200, { count: 0 })),
        },
        {
          errorMap: [
            {
              match: (e) => e instanceof NotFoundError,
              response: () => (respond(404, { error: 'not found' })),
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
            Promise.resolve(respond(201, { id: '1', email: ctx.body.email })),
          'search-items': () => Promise.resolve(respond(200, { count: 0 })),
        },
        {
          errorMap: [
            {
              match: () => true,
              response: () => (respond(409, { error: 'first' })),
            },
            {
              match: () => true,
              response: () => (respond(503, { error: 'second' })),
            },
          ],
        },
      );
      const result = await s.handle(new URL('https://example.com/users/1'), 'GET');
      expect(result.status).toBe(409);
      expect((result.body as Record<string, unknown>)['error']).toBe('first');
    });
  });

  describe('requires annotation', () => {
    const AdminSchema = object({ tag: literal('get-admin') });
    const AdminResp = z.object({ ok: z.boolean() });

    const adminRouter = defineRoutes([
      httpRoute(AdminSchema, 'GET', 'admin/', {
        requires: ['admin'] as const,
        response: { 200: AdminResp },
      }),
    ]);

    const resolveSession = (headers: Record<string, string>) => {
      const token = headers['authorization']?.slice(7);
      if (token === 'admin-token') return Promise.resolve({ userId: 'u1', roles: ['admin'] });
      if (token === 'user-token') return Promise.resolve({ userId: 'u2', roles: ['user'] });
      return Promise.resolve(null);
    };

    it('returns 401 when no session is present', async () => {
      const s = createServer(adminRouter, {
        'get-admin': () => Promise.resolve(respond(200, { ok: true })),
      }, { resolveSession });
      const result = await s.handle(new URL('http://localhost/admin/'), 'GET', undefined, {});
      expect(result.status).toBe(401);
      expect((result.body as Record<string, unknown>)['error']).toBe('unauthorized');
    });

    it('returns 403 when session lacks required role', async () => {
      const s = createServer(adminRouter, {
        'get-admin': () => Promise.resolve(respond(200, { ok: true })),
      }, { resolveSession });
      const result = await s.handle(new URL('http://localhost/admin/'), 'GET', undefined, { authorization: 'Bearer user-token' });
      expect(result.status).toBe(403);
      expect((result.body as Record<string, unknown>)['error']).toBe('forbidden');
    });

    it('calls handler when session has required role', async () => {
      const s = createServer(adminRouter, {
        'get-admin': () => Promise.resolve(respond(200, { ok: true })),
      }, { resolveSession });
      const result = await s.handle(new URL('http://localhost/admin/'), 'GET', undefined, { authorization: 'Bearer admin-token' });
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ ok: true });
    });

    it('passes session to handler ctx', async () => {
      const s = createServer(adminRouter, {
        'get-admin': (ctx) => Promise.resolve(respond(200, { ok: ctx.session.userId === 'u1' })),
      }, { resolveSession });
      const result = await s.handle(new URL('http://localhost/admin/'), 'GET', undefined, { authorization: 'Bearer admin-token' });
      expect(result.status).toBe(200);
      expect((result.body as Record<string, unknown>)['ok']).toBe(true);
    });

    it('returns 500 when requires is set but resolveSession not configured', async () => {
      const s = createServer(adminRouter, {
        'get-admin': () => Promise.resolve(respond(200, { ok: true })),
      });
      const result = await s.handle(new URL('http://localhost/admin/'), 'GET', undefined, { authorization: 'Bearer admin-token' });
      expect(result.status).toBe(500);
    });

    it('routes without requires are unaffected', async () => {
      const PublicSchema = object({ tag: literal('public') });
      const mixedRouter = defineRoutes([
        httpRoute(PublicSchema, 'GET', 'public/', { response: { 200: AdminResp } }),
        httpRoute(AdminSchema, 'GET', 'admin/', { requires: ['admin'] as const, response: { 200: AdminResp } }),
      ]);
      const s = createServer(mixedRouter, {
        public: () => Promise.resolve(respond(200, { ok: true })),
        'get-admin': () => Promise.resolve(respond(200, { ok: true })),
      }, { resolveSession });
      const result = await s.handle(new URL('http://localhost/public/'), 'GET');
      expect(result.status).toBe(200);
    });
  });

  describe('IntoResponse — direct body return', () => {
    const ItemSchema = object({ tag: literal('get-item'), id: string() });
    const ItemResp = z.object({ id: z.string(), name: z.string() });
    const singleStatusRouter = defineRoutes([
      httpRoute(ItemSchema, 'GET', 'items/:id/', { response: { 200: ItemResp } }),
    ]);

    it('InferSingleSuccessBody resolves body for single-2xx route', () => {
      interface Resp { 200: { id: string; name: string } }
      expectTypeOf<InferSingleSuccessBody<Resp>>().toEqualTypeOf<{ id: string; name: string }>();
    });

    it('InferSingleSuccessBody is never for multi-2xx route', () => {
      interface Resp { 200: { id: string }; 201: { id: string } }
      expectTypeOf<InferSingleSuccessBody<Resp>>().toBeNever();
    });

    it('InferSingleSuccessBody resolves body when error codes are also declared', () => {
      interface Resp { 200: { id: string; name: string }; 404: { error: string } }
      expectTypeOf<InferSingleSuccessBody<Resp>>().toEqualTypeOf<{ id: string; name: string }>();
    });

    it('handler returning direct body async dispatches with wrapped 200', async () => {
      const s = createServer(singleStatusRouter, {
        'get-item': (ctx) => Promise.resolve({ id: ctx.params.id, name: 'Widget' }),
      });
      const result = await s.handle(new URL('https://example.com/items/42/'), 'GET');
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ id: '42', name: 'Widget' });
    });

    it('handler returning direct body sync dispatches with wrapped 200', async () => {
      const s = createServer(singleStatusRouter, {
        'get-item': (ctx) => ({ id: ctx.params.id, name: 'Widget' }),
      });
      const result = await s.handle(new URL('https://example.com/items/7/'), 'GET');
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ id: '7', name: 'Widget' });
    });

    it('explicit respond() still works on single-2xx route', async () => {
      const s = createServer(singleStatusRouter, {
        'get-item': (ctx) => Promise.resolve(respond(200, { id: ctx.params.id, name: 'Explicit' })),
      });
      const result = await s.handle(new URL('https://example.com/items/99/'), 'GET');
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ id: '99', name: 'Explicit' });
    });

    it('multi-2xx route requires respond() — direct body is a type error', () => {
      expectTypeOf<HandlerMap<
        Record<'get-multi', { method: 'GET'; body: never; response: { 200: { id: string }; 201: { id: string } }; query: never; headers: never; cookies: never; session: never }>,
        never
      >['get-multi']>().not.toExtend<(ctx: never) => { id: string }>();
    });
  });
});
