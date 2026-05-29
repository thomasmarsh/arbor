import { describe, expect, it, vi } from 'vitest';
import z from 'zod';
import { httpRoute } from '../contexts/http-context.js';
import { defineRoutes } from '../core/define-routes.js';
import { createServer } from './server.js';
import { withMetrics, type RequestMetric } from './with-metrics.js';

const GetUser = z.object({ tag: z.literal('get-user'), id: z.string() });
const router = defineRoutes([
  httpRoute(GetUser, 'GET', 'users/:id/', { response: { 200: z.object({ id: z.string() }) } }),
]);
const server = createServer(router, {
  'get-user': (ctx) => Promise.resolve({ status: 200 as const, body: { id: ctx.params.id } }),
});

describe('withMetrics', () => {
  it('calls emitter once per request', async () => {
    const emitter = vi.fn<(m: RequestMetric) => void>();
    const tracked = withMetrics(server, emitter);
    await tracked.handle(new URL('http://localhost/users/1'), 'GET', undefined, {});
    expect(emitter).toHaveBeenCalledTimes(1);
  });

  it("tag is 'unmatched' when no route matches", async () => {
    const emitter = vi.fn<(m: RequestMetric) => void>();
    const tracked = withMetrics(server, emitter);
    await tracked.handle(new URL('http://localhost/no-such-route'), 'GET', undefined, {});
    const metric = emitter.mock.calls[0]?.[0];
    expect(metric?.tag).toBe('unmatched');
  });

  it('durationMs is a non-negative number', async () => {
    const emitter = vi.fn<(m: RequestMetric) => void>();
    const tracked = withMetrics(server, emitter);
    await tracked.handle(new URL('http://localhost/users/1'), 'GET', undefined, {});
    const metric = emitter.mock.calls[0]?.[0];
    expect(metric?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('status matches the actual response status code', async () => {
    const emitter = vi.fn<(m: RequestMetric) => void>();
    const tracked = withMetrics(server, emitter);
    await tracked.handle(new URL('http://localhost/users/1'), 'GET', undefined, {});
    const metric = emitter.mock.calls[0]?.[0];
    expect(metric?.status).toBe(200);
  });

  it('emits correct method', async () => {
    const emitter = vi.fn<(m: RequestMetric) => void>();
    const tracked = withMetrics(server, emitter);
    await tracked.handle(new URL('http://localhost/users/1'), 'GET', undefined, {});
    expect(emitter.mock.calls[0]?.[0]?.method).toBe('GET');
  });

  it('emits timestamp as a number', async () => {
    const emitter = vi.fn<(m: RequestMetric) => void>();
    const tracked = withMetrics(server, emitter);
    await tracked.handle(new URL('http://localhost/users/1'), 'GET', undefined, {});
    expect(typeof emitter.mock.calls[0]?.[0]?.timestamp).toBe('number');
  });

  it('wraps handleRequest and emits once', async () => {
    const emitter = vi.fn<(m: RequestMetric) => void>();
    const tracked = withMetrics(server, emitter);
    await tracked.handleRequest(new Request('http://localhost/users/1', { method: 'GET' }));
    expect(emitter).toHaveBeenCalledTimes(1);
    expect(emitter.mock.calls[0]?.[0]?.status).toBe(200);
  });

  it('tag is matched route tag when route matches', async () => {
    const emitter = vi.fn<(m: RequestMetric) => void>();
    const tracked = withMetrics(server, emitter);
    await tracked.handle(new URL('http://localhost/users/42'), 'GET', undefined, {});
    expect(emitter.mock.calls[0]?.[0]?.tag).toBe('get-user');
  });
});
