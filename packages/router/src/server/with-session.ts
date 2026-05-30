import type { Guard } from './guard.js';

export function withSession<BaseCtx, Session>(
  resolveSession: (ctx: BaseCtx) => Promise<Session | null>,
): Guard<BaseCtx, { session: Session }> {
  return async (ctx) => {
    const session = await resolveSession(ctx);
    if (session === null) {
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      };
    }
    return { ok: true, ctx: { ...ctx, session } };
  };
}
