export type Guard<BaseCtx, Extra> = (
  ctx: BaseCtx,
) => Promise<{ ok: true; ctx: BaseCtx & Extra } | { ok: false; response: Response }>;

export function withGuard<BaseCtx, Extra>(
  guard: Guard<BaseCtx, Extra>,
  handler: (ctx: BaseCtx & Extra) => Promise<Response>,
): (ctx: BaseCtx) => Promise<Response> {
  return async (ctx) => {
    const result = await guard(ctx);
    if (!result.ok) return result.response;
    return handler(result.ctx);
  };
}

// 2-arity compose only — variadic accumulation fights the compiler the same way _child did.
// For >2, nest: composeGuards(a, composeGuards(b, c))
export function composeGuards<BaseCtx, A, B>(
  first: Guard<BaseCtx, A>,
  second: Guard<BaseCtx & A, B>,
): Guard<BaseCtx, A & B> {
  return async (ctx) => {
    const r1 = await first(ctx);
    if (!r1.ok) return r1;
    const r2 = await second(r1.ctx);
    if (!r2.ok) return r2;
    return { ok: true, ctx: r2.ctx };
  };
}
