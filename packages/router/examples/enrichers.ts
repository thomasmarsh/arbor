// withEnricher + composeEnrichers: type-safe pre-handler steps that can short-circuit.
import { type Enricher, composeEnrichers, withEnricher } from '../src/index.js';

interface BaseCtx { req: Request }

// Enrichers are typed explicitly so composeEnrichers can thread the Extra types.
const authEnricher: Enricher<BaseCtx, { userId: string }> = (ctx) => {
  const auth = ctx.req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) {
    return Promise.resolve({ ok: false, response: new Response('Unauthorized', { status: 401 }) });
  }
  return Promise.resolve({ ok: true, ctx: { ...ctx, userId: auth.slice(7) } });
};

const planEnricher: Enricher<BaseCtx & { userId: string }, { plan: string }> = (ctx) => {
  const plan = ctx.req.headers.get('x-plan') ?? 'free';
  if (plan === 'blocked') {
    return Promise.resolve({ ok: false, response: new Response('Forbidden', { status: 403 }) });
  }
  return Promise.resolve({ ok: true, ctx: { ...ctx, plan } });
};

// withEnricher: wrap a handler with a single pre-handler step.
const authHandler = withEnricher(authEnricher, (ctx) => Promise.resolve(new Response(`Hello, ${ctx.userId}`)));

const authed = await authHandler({ req: new Request('http://localhost/', { headers: { authorization: 'Bearer alice' } }) });
console.log('authed status:', authed.status);           // 200
console.log('authed body:', await authed.text());       // Hello, alice

const unauthed = await authHandler({ req: new Request('http://localhost/') });
console.log('unauthed status:', unauthed.status);       // 401

// composeEnrichers: chain two enrichers — both must pass for the handler to run.
const composed = composeEnrichers(authEnricher, planEnricher);
const composedHandler = withEnricher(
  composed,
  (ctx) => Promise.resolve(new Response(`user=${ctx.userId} plan=${ctx.plan}`)),
);

const ok = await composedHandler({
  req: new Request('http://localhost/', {
    headers: { authorization: 'Bearer bob', 'x-plan': 'pro' },
  }),
});
console.log('composed status:', ok.status);             // 200
console.log('composed body:', await ok.text());         // user=bob plan=pro

const blocked = await composedHandler({
  req: new Request('http://localhost/', {
    headers: { authorization: 'Bearer bob', 'x-plan': 'blocked' },
  }),
});
console.log('blocked status:', blocked.status);         // 403
