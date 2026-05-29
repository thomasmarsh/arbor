import type { Enricher } from './enrichers.js';

export interface RateLimitPolicy {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<number>;
  reset(key: string): Promise<void>;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

export function createMemoryStore(): RateLimitStore {
  const map = new Map<string, WindowEntry>();
  return {
    increment(key: string, windowMs: number): Promise<number> {
      const now = Date.now();
      const entry = map.get(key);
      if (!entry || now >= entry.resetAt) {
        map.set(key, { count: 1, resetAt: now + windowMs });
        return Promise.resolve(1);
      }
      entry.count++;
      return Promise.resolve(entry.count);
    },
    reset(key: string): Promise<void> {
      map.delete(key);
      return Promise.resolve();
    },
  };
}

export function withRateLimit<BaseCtx>(
  policy: RateLimitPolicy,
  store: RateLimitStore,
  keyResolver?: (ctx: BaseCtx) => string,
): Enricher<BaseCtx, Record<never, never>> {
  return async (ctx: BaseCtx) => {
    const key = keyResolver ? keyResolver(ctx) : 'default';
    const count = await store.increment(key, policy.windowMs);
    if (count > policy.maxRequests) {
      const retryAfter = String(Math.ceil(policy.windowMs / 1000));
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: 'too many requests' }), {
          status: 429,
          headers: { 'retry-after': retryAfter, 'content-type': 'application/json' },
        }),
      };
    }
    return { ok: true, ctx: ctx as BaseCtx & Record<never, never> };
  };
}
