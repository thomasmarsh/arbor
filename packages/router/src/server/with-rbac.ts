import type { Enricher } from './enrichers.js';

export function withRbac<BaseCtx extends { session: { roles: string[] } }>(
  requiredRoles: string[],
): Enricher<BaseCtx, Record<never, never>> {
  return (ctx) => {
    const { roles } = ctx.session;
    const hasRole = requiredRoles.some((r) => roles.includes(r));
    if (!hasRole) {
      return Promise.resolve({
        ok: false as const,
        response: new Response(JSON.stringify({ error: 'forbidden' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
      });
    }
    return Promise.resolve({ ok: true as const, ctx });
  };
}
