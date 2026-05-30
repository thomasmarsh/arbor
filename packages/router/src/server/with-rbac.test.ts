import { describe, expect, expectTypeOf, it } from 'vitest';
import { composeEnrichers, withEnricher } from './enrichers.js';
import { withRbac } from './with-rbac.js';
import { withSession } from './with-session.js';

interface Ctx {
  headers: Record<string, string>;
}

interface Session {
  userId: string;
  roles: string[];
}

const resolveSession = (ctx: Ctx): Promise<Session | null> => {
  const auth = ctx.headers['authorization'] ?? '';
  if (!auth.startsWith('Bearer ')) return Promise.resolve(null);
  const [, token] = auth.split(' ');
  if (token === 'admin-token') return Promise.resolve({ userId: 'user-1', roles: ['admin'] });
  if (token === 'user-token') return Promise.resolve({ userId: 'user-2', roles: ['user'] });
  return Promise.resolve(null);
};

describe('withRbac', () => {
  describe('type inference', () => {
    it('accepts a session context with roles', () => {
      const enricher = withRbac<Ctx & { session: Session }>(['admin']);
      expectTypeOf(enricher).toBeFunction();
      expect(true).toBe(true);
    });
  });

  describe('runtime behaviour', () => {
    it('calls handler when session has a matching role', async () => {
      const auth = composeEnrichers(withSession(resolveSession), withRbac(['admin']));
      let called = false;
      const handler = withEnricher(auth, () => {
        called = true;
        return Promise.resolve(new Response('ok'));
      });
      const resp = await handler({ headers: { authorization: 'Bearer admin-token' } });
      expect(resp.status).toBe(200);
      expect(called).toBe(true);
    });

    it('returns 403 when session lacks the required role', async () => {
      const auth = composeEnrichers(withSession(resolveSession), withRbac(['admin']));
      const handler = withEnricher(auth, () => Promise.resolve(new Response('ok')));
      const resp = await handler({ headers: { authorization: 'Bearer user-token' } });
      expect(resp.status).toBe(403);
      const body: unknown = await resp.json();
      expect(body).toEqual({ error: 'forbidden' });
    });

    it('returns 403 when session has none of several required roles', async () => {
      const auth = composeEnrichers(withSession(resolveSession), withRbac(['admin', 'super-user']));
      const handler = withEnricher(auth, () => Promise.resolve(new Response('ok')));
      const resp = await handler({ headers: { authorization: 'Bearer user-token' } });
      expect(resp.status).toBe(403);
    });

    it('returns 200 when session has one of several required roles', async () => {
      const auth = composeEnrichers(withSession(resolveSession), withRbac(['admin', 'super-user']));
      const handler = withEnricher(auth, () => Promise.resolve(new Response('ok')));
      const resp = await handler({ headers: { authorization: 'Bearer admin-token' } });
      expect(resp.status).toBe(200);
    });

    it('returns 401 (not 403) when request is unauthenticated', async () => {
      const auth = composeEnrichers(withSession(resolveSession), withRbac(['admin']));
      const handler = withEnricher(auth, () => Promise.resolve(new Response('ok')));
      const resp = await handler({ headers: {} });
      expect(resp.status).toBe(401);
    });

    it('does not call handler when role check fails', async () => {
      const auth = composeEnrichers(withSession(resolveSession), withRbac(['admin']));
      let called = false;
      const handler = withEnricher(auth, () => {
        called = true;
        return Promise.resolve(new Response('ok'));
      });
      await handler({ headers: { authorization: 'Bearer user-token' } });
      expect(called).toBe(false);
    });
  });
});
