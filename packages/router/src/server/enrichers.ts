export type Enricher<BaseCtx, Extra> = (
  ctx: BaseCtx,
) => Promise<{ ok: true; ctx: BaseCtx & Extra } | { ok: false; response: Response }>;

export function withEnricher<BaseCtx, Extra>(
  enricher: Enricher<BaseCtx, Extra>,
  handler: (ctx: BaseCtx & Extra) => Promise<Response>,
): (ctx: BaseCtx) => Promise<Response> {
  return async (ctx) => {
    const result = await enricher(ctx);
    if (!result.ok) return result.response;
    return handler(result.ctx);
  };
}

// 2-arity compose only — variadic accumulation fights the compiler the same way _child did.
// For >2, nest: composeEnrichers(a, composeEnrichers(b, c))
export function composeEnrichers<BaseCtx, A, B>(
  first: Enricher<BaseCtx, A>,
  second: Enricher<BaseCtx & A, B>,
): Enricher<BaseCtx, A & B> {
  return async (ctx) => {
    const r1 = await first(ctx);
    if (!r1.ok) return r1;
    const r2 = await second(r1.ctx);
    if (!r2.ok) return r2;
    return { ok: true, ctx: r2.ctx };
  };
}
