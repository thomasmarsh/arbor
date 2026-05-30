import type { Enricher } from './enrichers.js';

export interface ApiKeyOptions {
  via: 'header' | 'query';
  name: string;
}

export function withApiKey<BaseCtx extends { headers?: Record<string, string>; query?: Record<string, string> }, Identity>(
  options: ApiKeyOptions,
  resolveApiKey: (key: string, ctx: BaseCtx) => Promise<Identity | null>,
): Enricher<BaseCtx, { apiKey: Identity }> {
  return async (ctx) => {
    const raw = options.via === 'header'
      ? ctx.headers?.[options.name.toLowerCase()]
      : ctx.query?.[options.name];

    if (!raw) {
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      };
    }

    const identity = await resolveApiKey(raw, ctx);
    if (identity === null) {
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      };
    }

    return { ok: true, ctx: { ...ctx, apiKey: identity } };
  };
}
