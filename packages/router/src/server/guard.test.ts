import { describe, expect, expectTypeOf, it } from 'vitest';
import { composeGuards, type Guard, withGuard } from './guard.js';

interface Base {
  params: { id: string };
}

describe('withGuard', () => {
  describe('type inference', () => {
    it('Extra fields appear in wrapped handler ctx', () => {
      interface Extra {
        session: { userId: string };
      }
      const guard: Guard<Base, Extra> = (ctx) =>
        Promise.resolve({ ok: true, ctx: { ...ctx, session: { userId: '1' } } });
      withGuard(guard, (ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<Base & Extra>();
        expectTypeOf(ctx.session).toEqualTypeOf<{ userId: string }>();
        expectTypeOf(ctx.params).toEqualTypeOf<{ id: string }>();
        return Promise.resolve(new Response());
      });
    });

    it('return type of withGuard is (ctx: BaseCtx) => Promise<Response>', () => {
      const guard: Guard<Base, { x: number }> = (ctx) =>
        Promise.resolve({ ok: true, ctx: { ...ctx, x: 1 } });
      const wrapped = withGuard(guard, () => Promise.resolve(new Response()));
      expectTypeOf(wrapped).toEqualTypeOf<(ctx: Base) => Promise<Response>>();
    });
  });

  describe('runtime behaviour', () => {
    it('passes enriched ctx to handler when guard succeeds', async () => {
      const guard: Guard<Base, { session: string }> = (ctx) =>
        Promise.resolve({ ok: true, ctx: { ...ctx, session: 'tok-123' } });
      let received: string | undefined;
      const handler = withGuard(guard, ({ session }) => {
        received = session;
        return Promise.resolve(new Response());
      });
      await handler({ params: { id: 'abc' } });
      expect(received).toBe('tok-123');
    });

    it('short-circuits without calling handler when guard fails', async () => {
      let called = false;
      const shortCircuit: Guard<Base, { x: number }> = () =>
        Promise.resolve({ ok: false, response: new Response(null, { status: 401 }) });
      const handler = withGuard(shortCircuit, () => {
        called = true;
        return Promise.resolve(new Response());
      });
      const resp = await handler({ params: { id: 'abc' } });
      expect(called).toBe(false);
      expect(resp.status).toBe(401);
    });
  });
});

describe('composeGuards', () => {
  describe('type inference', () => {
    it('both guard additions visible in innermost handler ctx', () => {
      interface Session {
        session: string;
      }
      interface RateInfo {
        rateInfo: number;
      }
      const withSession: Guard<Base, Session> = (ctx) =>
        Promise.resolve({ ok: true, ctx: { ...ctx, session: 'tok' } });
      const withRate: Guard<Base & Session, RateInfo> = (ctx) =>
        Promise.resolve({ ok: true, ctx: { ...ctx, rateInfo: 42 } });
      const composed = composeGuards(withSession, withRate);
      withGuard(composed, (ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<Base & Session & RateInfo>();
        return Promise.resolve(new Response());
      });
    });
  });

  describe('runtime behaviour', () => {
    it('runs both guards and merges ctx', async () => {
      const g1: Guard<Base, { a: number }> = (ctx) => Promise.resolve({ ok: true, ctx: { ...ctx, a: 1 } });
      const g2: Guard<Base & { a: number }, { b: string }> = (ctx) =>
        Promise.resolve({ ok: true, ctx: { ...ctx, b: 'hi' } });
      const composed = composeGuards(g1, g2);
      let result: { a: number; b: string } | undefined;
      const handler = withGuard(composed, ({ a, b }) => {
        result = { a, b };
        return Promise.resolve(new Response());
      });
      await handler({ params: { id: 'x' } });
      expect(result).toEqual({ a: 1, b: 'hi' });
    });

    it('short-circuits at first guard without running second or handler', async () => {
      let secondCalled = false;
      let handlerCalled = false;
      const g1: Guard<Base, { a: number }> = () =>
        Promise.resolve({ ok: false, response: new Response(null, { status: 403 }) });
      const g2: Guard<Base & { a: number }, { b: string }> = (ctx) => {
        secondCalled = true;
        return Promise.resolve({ ok: true, ctx: { ...ctx, b: 'hi' } });
      };
      const composed = composeGuards(g1, g2);
      const handler = withGuard(composed, () => {
        handlerCalled = true;
        return Promise.resolve(new Response());
      });
      const resp = await handler({ params: { id: 'x' } });
      expect(secondCalled).toBe(false);
      expect(handlerCalled).toBe(false);
      expect(resp.status).toBe(403);
    });

    it('short-circuits at second guard without running handler', async () => {
      let handlerCalled = false;
      const g1: Guard<Base, { a: number }> = (ctx) => Promise.resolve({ ok: true, ctx: { ...ctx, a: 1 } });
      const g2: Guard<Base & { a: number }, { b: string }> = () =>
        Promise.resolve({ ok: false, response: new Response(null, { status: 429 }) });
      const composed = composeGuards(g1, g2);
      const handler = withGuard(composed, () => {
        handlerCalled = true;
        return Promise.resolve(new Response());
      });
      const resp = await handler({ params: { id: 'x' } });
      expect(handlerCalled).toBe(false);
      expect(resp.status).toBe(429);
    });
  });
});
