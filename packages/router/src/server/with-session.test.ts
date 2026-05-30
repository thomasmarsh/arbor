import { describe, expect, expectTypeOf, it } from 'vitest';
import { withGuard } from './guard.js';
import { withSession } from './with-session.js';

interface Ctx {
  headers: Record<string, string>;
}

interface Session {
  userId: string;
  role: string;
}

const resolveSession = (ctx: Ctx): Promise<Session | null> => {
  const auth = ctx.headers['authorization'] ?? '';
  if (!auth.startsWith('Bearer ')) return Promise.resolve(null);
  const token = auth.slice(7);
  if (token === 'valid-token') return Promise.resolve({ userId: 'user-123', role: 'admin' });
  return Promise.resolve(null);
};

describe('withSession', () => {
  describe('type inference', () => {
    it('session appears in enriched handler ctx', () => {
      const guard = withSession(resolveSession);
      withGuard(guard, (ctx) => {
        expectTypeOf(ctx.session).toEqualTypeOf<Session>();
        expectTypeOf(ctx.headers).toEqualTypeOf<Record<string, string>>();
        return Promise.resolve(new Response());
      });
      expect(true).toBe(true);
    });

    it('return type of withSession is Guard<BaseCtx, { session: Session }>', () => {
      const guard = withSession(resolveSession);
      expectTypeOf(guard).toEqualTypeOf<
        (ctx: Ctx) => Promise<{ ok: true; ctx: Ctx & { session: Session } } | { ok: false; response: Response }>
      >();
    });
  });

  describe('runtime behaviour', () => {
    it('returns 401 when resolveSession returns null (missing token)', async () => {
      const guard = withSession(resolveSession);
      const handler = withGuard(guard, () => Promise.resolve(new Response('ok')));
      const resp = await handler({ headers: {} });
      expect(resp.status).toBe(401);
    });

    it('returns 401 when resolveSession returns null (invalid token)', async () => {
      const guard = withSession(resolveSession);
      const handler = withGuard(guard, () => Promise.resolve(new Response('ok')));
      const resp = await handler({ headers: { authorization: 'Bearer bad-token' } });
      expect(resp.status).toBe(401);
    });

    it('passes session to handler when token is valid', async () => {
      const guard = withSession(resolveSession);
      let received: Session | undefined;
      const handler = withGuard(guard, ({ session }) => {
        received = session;
        return Promise.resolve(new Response('ok'));
      });
      const resp = await handler({ headers: { authorization: 'Bearer valid-token' } });
      expect(resp.status).toBe(200);
      expect(received).toEqual({ userId: 'user-123', role: 'admin' });
    });

    it('does not call handler when session is missing', async () => {
      const guard = withSession(resolveSession);
      let called = false;
      const handler = withGuard(guard, () => {
        called = true;
        return Promise.resolve(new Response('ok'));
      });
      await handler({ headers: {} });
      expect(called).toBe(false);
    });
  });
});
