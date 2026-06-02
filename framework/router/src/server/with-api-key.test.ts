import { describe, expect, expectTypeOf, it } from 'vitest';
import { withGuard } from './guard.js';
import { withApiKey } from './with-api-key.js';

interface Ctx {
  headers: Record<string, string>;
  query: Record<string, string>;
}

interface KeyIdentity {
  clientId: string;
  scopes: string[];
}

const resolveApiKey = (_key: string, _ctx: Ctx): Promise<KeyIdentity | null> => {
  if (_key === 'valid-key') return Promise.resolve({ clientId: 'client-abc', scopes: ['read'] });
  return Promise.resolve(null);
};

describe('withApiKey', () => {
  describe('type inference', () => {
    it('apiKey appears in enriched handler ctx (header)', () => {
      const guard = withApiKey({ via: 'header', name: 'x-api-key' }, resolveApiKey);
      withGuard(guard, (ctx) => {
        expectTypeOf(ctx.apiKey).toEqualTypeOf<KeyIdentity>();
        expectTypeOf(ctx.headers).toEqualTypeOf<Record<string, string>>();
        return Promise.resolve(new Response());
      });
      expect(true).toBe(true);
    });

    it('return type is Guard<Ctx, { apiKey: KeyIdentity }>', () => {
      const guard = withApiKey({ via: 'header', name: 'x-api-key' }, resolveApiKey);
      expectTypeOf(guard).toEqualTypeOf<
        (ctx: Ctx) => Promise<{ ok: true; ctx: Ctx & { apiKey: KeyIdentity } } | { ok: false; response: Response }>
      >();
    });
  });

  describe('runtime behaviour — header', () => {
    it('returns 401 when header is absent', async () => {
      const guard = withApiKey({ via: 'header', name: 'x-api-key' }, resolveApiKey);
      const handler = withGuard(guard, () => Promise.resolve(new Response('ok')));
      const resp = await handler({ headers: {}, query: {} });
      expect(resp.status).toBe(401);
    });

    it('returns 401 when key is invalid', async () => {
      const guard = withApiKey({ via: 'header', name: 'x-api-key' }, resolveApiKey);
      const handler = withGuard(guard, () => Promise.resolve(new Response('ok')));
      const resp = await handler({ headers: { 'x-api-key': 'bad-key' }, query: {} });
      expect(resp.status).toBe(401);
    });

    it('injects identity when key is valid', async () => {
      const guard = withApiKey({ via: 'header', name: 'x-api-key' }, resolveApiKey);
      let received: KeyIdentity | undefined;
      const handler = withGuard(guard, ({ apiKey }) => {
        received = apiKey;
        return Promise.resolve(new Response('ok'));
      });
      const resp = await handler({ headers: { 'x-api-key': 'valid-key' }, query: {} });
      expect(resp.status).toBe(200);
      expect(received).toEqual({ clientId: 'client-abc', scopes: ['read'] });
    });

    it('does not call handler when key is missing', async () => {
      const guard = withApiKey({ via: 'header', name: 'x-api-key' }, resolveApiKey);
      let called = false;
      const handler = withGuard(guard, () => {
        called = true;
        return Promise.resolve(new Response('ok'));
      });
      await handler({ headers: {}, query: {} });
      expect(called).toBe(false);
    });
  });

  describe('runtime behaviour — query', () => {
    it('returns 401 when query param is absent', async () => {
      const guard = withApiKey({ via: 'query', name: 'api_key' }, resolveApiKey);
      const handler = withGuard(guard, () => Promise.resolve(new Response('ok')));
      const resp = await handler({ headers: {}, query: {} });
      expect(resp.status).toBe(401);
    });

    it('injects identity when query key is valid', async () => {
      const guard = withApiKey({ via: 'query', name: 'api_key' }, resolveApiKey);
      let received: KeyIdentity | undefined;
      const handler = withGuard(guard, ({ apiKey }) => {
        received = apiKey;
        return Promise.resolve(new Response('ok'));
      });
      const resp = await handler({ headers: {}, query: { api_key: 'valid-key' } });
      expect(resp.status).toBe(200);
      expect(received).toEqual({ clientId: 'client-abc', scopes: ['read'] });
    });
  });
});
