import { describe, expect, expectTypeOf, it } from 'vitest';
import { composeEnrichers, type Enricher, withEnricher } from './enrichers.js';

interface Base {
  params: { id: string };
}

describe('withEnricher', () => {
  describe('type inference', () => {
    it('Extra fields appear in wrapped handler ctx', () => {
      interface Extra {
        session: { userId: string };
      }
      const enricher: Enricher<Base, Extra> = (ctx) =>
        Promise.resolve({ ok: true, ctx: { ...ctx, session: { userId: '1' } } });
      withEnricher(enricher, (ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<Base & Extra>();
        expectTypeOf(ctx.session).toEqualTypeOf<{ userId: string }>();
        expectTypeOf(ctx.params).toEqualTypeOf<{ id: string }>();
        return Promise.resolve(new Response());
      });
    });

    it('return type of withEnricher is (ctx: BaseCtx) => Promise<Response>', () => {
      const enricher: Enricher<Base, { x: number }> = (ctx) =>
        Promise.resolve({ ok: true, ctx: { ...ctx, x: 1 } });
      const wrapped = withEnricher(enricher, () => Promise.resolve(new Response()));
      expectTypeOf(wrapped).toEqualTypeOf<(ctx: Base) => Promise<Response>>();
    });
  });

  describe('runtime behaviour', () => {
    it('passes enriched ctx to handler when enricher succeeds', async () => {
      const enricher: Enricher<Base, { session: string }> = (ctx) =>
        Promise.resolve({ ok: true, ctx: { ...ctx, session: 'tok-123' } });
      let received: string | undefined;
      const handler = withEnricher(enricher, ({ session }) => {
        received = session;
        return Promise.resolve(new Response());
      });
      await handler({ params: { id: 'abc' } });
      expect(received).toBe('tok-123');
    });

    it('short-circuits without calling handler when enricher fails', async () => {
      let called = false;
      const shortCircuit: Enricher<Base, { x: number }> = () =>
        Promise.resolve({ ok: false, response: new Response(null, { status: 401 }) });
      const handler = withEnricher(shortCircuit, () => {
        called = true;
        return Promise.resolve(new Response());
      });
      const resp = await handler({ params: { id: 'abc' } });
      expect(called).toBe(false);
      expect(resp.status).toBe(401);
    });
  });
});

describe('composeEnrichers', () => {
  describe('type inference', () => {
    it('both enricher additions visible in innermost handler ctx', () => {
      interface Session {
        session: string;
      }
      interface RateInfo {
        rateInfo: number;
      }
      const withSession: Enricher<Base, Session> = (ctx) =>
        Promise.resolve({ ok: true, ctx: { ...ctx, session: 'tok' } });
      const withRate: Enricher<Base & Session, RateInfo> = (ctx) =>
        Promise.resolve({ ok: true, ctx: { ...ctx, rateInfo: 42 } });
      const composed = composeEnrichers(withSession, withRate);
      withEnricher(composed, (ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<Base & Session & RateInfo>();
        return Promise.resolve(new Response());
      });
    });
  });

  describe('runtime behaviour', () => {
    it('runs both enrichers and merges ctx', async () => {
      const e1: Enricher<Base, { a: number }> = (ctx) => Promise.resolve({ ok: true, ctx: { ...ctx, a: 1 } });
      const e2: Enricher<Base & { a: number }, { b: string }> = (ctx) =>
        Promise.resolve({ ok: true, ctx: { ...ctx, b: 'hi' } });
      const composed = composeEnrichers(e1, e2);
      let result: { a: number; b: string } | undefined;
      const handler = withEnricher(composed, ({ a, b }) => {
        result = { a, b };
        return Promise.resolve(new Response());
      });
      await handler({ params: { id: 'x' } });
      expect(result).toEqual({ a: 1, b: 'hi' });
    });

    it('short-circuits at first enricher without running second or handler', async () => {
      let secondCalled = false;
      let handlerCalled = false;
      const e1: Enricher<Base, { a: number }> = () =>
        Promise.resolve({ ok: false, response: new Response(null, { status: 403 }) });
      const e2: Enricher<Base & { a: number }, { b: string }> = (ctx) => {
        secondCalled = true;
        return Promise.resolve({ ok: true, ctx: { ...ctx, b: 'hi' } });
      };
      const composed = composeEnrichers(e1, e2);
      const handler = withEnricher(composed, () => {
        handlerCalled = true;
        return Promise.resolve(new Response());
      });
      const resp = await handler({ params: { id: 'x' } });
      expect(secondCalled).toBe(false);
      expect(handlerCalled).toBe(false);
      expect(resp.status).toBe(403);
    });

    it('short-circuits at second enricher without running handler', async () => {
      let handlerCalled = false;
      const e1: Enricher<Base, { a: number }> = (ctx) => Promise.resolve({ ok: true, ctx: { ...ctx, a: 1 } });
      const e2: Enricher<Base & { a: number }, { b: string }> = () =>
        Promise.resolve({ ok: false, response: new Response(null, { status: 429 }) });
      const composed = composeEnrichers(e1, e2);
      const handler = withEnricher(composed, () => {
        handlerCalled = true;
        return Promise.resolve(new Response());
      });
      const resp = await handler({ params: { id: 'x' } });
      expect(handlerCalled).toBe(false);
      expect(resp.status).toBe(429);
    });
  });
});
