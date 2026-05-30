import { beforeEach, describe, expect, it, vi } from 'vitest';
import z from 'zod';
import { httpRoute } from '../contexts/http-context.js';
import { defineRoutes } from '../core/define-routes.js';
import { createServer } from './server.js';
import { withCors } from './with-cors.js';

const GetUser = z.object({ tag: z.literal('get-user'), id: z.string() });
const router = defineRoutes([
  httpRoute(GetUser, 'GET', 'users/:id/', { response: { 200: z.object({ id: z.string() }) } }),
]);
const handler = vi.fn((ctx: { params: { id: string }; body: unknown; query: unknown; headers: unknown }) =>
  Promise.resolve({ status: 200 as const, body: { id: ctx.params.id } }),
);
const server = createServer(router, { 'get-user': handler });

beforeEach(() => vi.clearAllMocks());

describe('withCors — origin policy', () => {
  it('adds ACAO header for allowed origin', async () => {
    const s = withCors(server, { origins: ['https://app.example.com'] });
    const result = await s.handle(new URL('http://localhost/users/1'), 'GET', undefined, {
      origin: 'https://app.example.com',
    });
    expect(result.headers?.['access-control-allow-origin']).toBe('https://app.example.com');
  });

  it('does not add ACAO header for disallowed origin', async () => {
    const s = withCors(server, { origins: ['https://app.example.com'] });
    const result = await s.handle(new URL('http://localhost/users/1'), 'GET', undefined, {
      origin: 'https://evil.com',
    });
    expect(result.headers?.['access-control-allow-origin']).toBeUndefined();
  });

  it('wildcard origins allows any origin and echoes *', async () => {
    const s = withCors(server, { origins: '*' });
    const result = await s.handle(new URL('http://localhost/users/1'), 'GET', undefined, {
      origin: 'https://any.example.com',
    });
    expect(result.headers?.['access-control-allow-origin']).toBe('*');
  });

  it('credentials: true adds allow-credentials header', async () => {
    const s = withCors(server, { origins: ['https://app.example.com'], credentials: true });
    const result = await s.handle(new URL('http://localhost/users/1'), 'GET', undefined, {
      origin: 'https://app.example.com',
    });
    expect(result.headers?.['access-control-allow-credentials']).toBe('true');
  });
});

describe('withCors — OPTIONS preflight', () => {
  it('returns 204 without calling any handler', async () => {
    const s = withCors(server, { origins: ['https://app.example.com'] });
    const result = await s.handle(new URL('http://localhost/users/1'), 'OPTIONS', undefined, {
      origin: 'https://app.example.com',
    });
    expect(result.status).toBe(204);
    expect(handler).not.toHaveBeenCalled();
  });

  it('includes allow-methods header when configured', async () => {
    const s = withCors(server, { origins: ['https://app.example.com'], methods: ['GET', 'POST'] });
    const result = await s.handle(new URL('http://localhost/'), 'OPTIONS', undefined, {
      origin: 'https://app.example.com',
    });
    expect(result.headers?.['access-control-allow-methods']).toBe('GET, POST');
  });

  it('includes allow-headers header when configured', async () => {
    const s = withCors(server, { origins: ['https://app.example.com'], allowedHeaders: ['content-type', 'x-csrf-token'] });
    const result = await s.handle(new URL('http://localhost/'), 'OPTIONS', undefined, {
      origin: 'https://app.example.com',
    });
    expect(result.headers?.['access-control-allow-headers']).toBe('content-type, x-csrf-token');
  });

  it('includes max-age header when configured', async () => {
    const s = withCors(server, { origins: ['https://app.example.com'], maxAge: 3600 });
    const result = await s.handle(new URL('http://localhost/'), 'OPTIONS', undefined, {
      origin: 'https://app.example.com',
    });
    expect(result.headers?.['access-control-max-age']).toBe('3600');
  });
});

describe('withCors — CSRF', () => {
  it('mismatch on mutating method returns 403', async () => {
    const s = withCors(server, { origins: '*', csrf: true });
    const result = await s.handle(new URL('http://localhost/users/1'), 'POST', {}, {
      'x-csrf-token': 'abc',
      cookie: 'csrf-token=xyz',
    });
    expect(result.status).toBe(403);
  });

  it('matching tokens on mutating method proceeds past CSRF check', async () => {
    const s = withCors(server, { origins: '*', csrf: true });
    const result = await s.handle(new URL('http://localhost/users/1'), 'POST', {}, {
      'x-csrf-token': 'secure',
      cookie: 'csrf-token=secure',
    });
    // CSRF passed — reached the route (405 because this is a GET-only route)
    expect(result.status).not.toBe(403);
  });

  it('GET requests bypass CSRF check', async () => {
    const s = withCors(server, { origins: '*', csrf: true });
    const result = await s.handle(new URL('http://localhost/users/1'), 'GET', undefined, {});
    expect(result.status).toBe(200);
  });

  it('missing token on mutating method returns 403', async () => {
    const s = withCors(server, { origins: '*', csrf: true });
    const result = await s.handle(new URL('http://localhost/users/1'), 'DELETE', undefined, {});
    expect(result.status).toBe(403);
  });

  it('csrf: false skips CSRF check for mutating methods', async () => {
    const s = withCors(server, { origins: '*' });
    const result = await s.handle(new URL('http://localhost/users/1'), 'POST', {}, {});
    expect(result.status).not.toBe(403);
  });
});

describe('withCors — per-route override', () => {
  const PublicPost = z.object({ tag: z.literal('list-posts'), slug: z.string() });
  const AdminDelete = z.object({ tag: z.literal('delete-post'), id: z.string() });
  const routerWithCorsRoutes = defineRoutes([
    httpRoute(PublicPost, 'GET', 'posts/:slug/', {
      response: { 200: z.object({ slug: z.string() }) },
      cors: { origins: '*' },
    }),
    httpRoute(AdminDelete, 'DELETE', 'admin/posts/:id/', {
      response: { 200: z.object({ ok: z.boolean() }) },
      cors: { origins: ['https://internal.app'], credentials: true },
    }),
  ]);
  const perRouteServer = createServer(routerWithCorsRoutes, {
    'list-posts': vi.fn((_ctx: { params: { slug: string }; body: unknown; query: unknown; headers: unknown }) =>
      Promise.resolve({ status: 200 as const, body: { slug: 'hello' } })),
    'delete-post': vi.fn((_ctx: { params: { id: string }; body: unknown; query: unknown; headers: unknown }) =>
      Promise.resolve({ status: 200 as const, body: { ok: true } })),
  });

  it('route-level cors overrides server-level: wildcard route allows any origin', async () => {
    const s = withCors(perRouteServer, { origins: ['https://strict.example.com'] }, { corsMap: routerWithCorsRoutes.corsMap });
    const result = await s.handle(new URL('http://localhost/posts/hello/'), 'GET', undefined, {
      origin: 'https://random.example.com',
    });
    expect(result.headers?.['access-control-allow-origin']).toBe('*');
  });

  it('route-level cors overrides server-level: restricted origin route', async () => {
    const s = withCors(perRouteServer, { origins: '*' }, { corsMap: routerWithCorsRoutes.corsMap });
    const result = await s.handle(new URL('http://localhost/admin/posts/42/'), 'DELETE', undefined, {
      origin: 'https://internal.app',
    });
    expect(result.headers?.['access-control-allow-origin']).toBe('https://internal.app');
    expect(result.headers?.['access-control-allow-credentials']).toBe('true');
  });

  it('route-level cors blocks origin not in route allowlist even if server allows *', async () => {
    const s = withCors(perRouteServer, { origins: '*' }, { corsMap: routerWithCorsRoutes.corsMap });
    const result = await s.handle(new URL('http://localhost/admin/posts/42/'), 'DELETE', undefined, {
      origin: 'https://evil.com',
    });
    expect(result.headers?.['access-control-allow-origin']).toBeUndefined();
  });

  it('route without cors field falls back to server-level config', async () => {
    const routerNoRouteCors = defineRoutes([
      httpRoute(GetUser, 'GET', 'users/:id/', { response: { 200: z.object({ id: z.string() }) } }),
    ]);
    const s = withCors(
      createServer(routerNoRouteCors, { 'get-user': handler }),
      { origins: ['https://app.example.com'] },
      { corsMap: routerNoRouteCors.corsMap },
    );
    const result = await s.handle(new URL('http://localhost/users/1/'), 'GET', undefined, {
      origin: 'https://app.example.com',
    });
    expect(result.headers?.['access-control-allow-origin']).toBe('https://app.example.com');
  });
});

describe('withCors — handleRequest', () => {
  it('OPTIONS preflight via handleRequest returns 204', async () => {
    const s = withCors(server, { origins: ['https://app.example.com'] });
    const result = await s.handleRequest(
      new Request('http://localhost/users/1', {
        method: 'OPTIONS',
        headers: { origin: 'https://app.example.com' },
      }),
    );
    expect(result.status).toBe(204);
    expect(handler).not.toHaveBeenCalled();
  });

  it('adds ACAO header via handleRequest for allowed origin', async () => {
    const s = withCors(server, { origins: ['https://app.example.com'] });
    const result = await s.handleRequest(
      new Request('http://localhost/users/1', {
        headers: { origin: 'https://app.example.com' },
      }),
    );
    expect(result.headers?.['access-control-allow-origin']).toBe('https://app.example.com');
  });

  it('CSRF mismatch via handleRequest returns 403', async () => {
    const s = withCors(server, { origins: '*', csrf: true });
    const result = await s.handleRequest(
      new Request('http://localhost/users/1', {
        method: 'POST',
        headers: {
          'x-csrf-token': 'abc',
          cookie: 'csrf-token=xyz',
        },
      }),
    );
    expect(result.status).toBe(403);
  });
});
