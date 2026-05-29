import { describe, expect, it } from 'vitest';
import { createMemoryStore, withRateLimit } from './rate-limit.js';

describe('createMemoryStore', () => {
  it('increments count within the same window', async () => {
    const store = createMemoryStore();
    expect(await store.increment('key', 60_000)).toBe(1);
    expect(await store.increment('key', 60_000)).toBe(2);
    expect(await store.increment('key', 60_000)).toBe(3);
  });

  it('resets count after window expires', async () => {
    const store = createMemoryStore();
    await store.increment('key', 1); // 1 ms window — expires immediately
    await new Promise((r) => setTimeout(r, 10));
    expect(await store.increment('key', 60_000)).toBe(1);
  });

  it('reset clears the key', async () => {
    const store = createMemoryStore();
    await store.increment('key', 60_000);
    await store.increment('key', 60_000);
    await store.reset('key');
    expect(await store.increment('key', 60_000)).toBe(1);
  });

  it('tracks separate keys independently', async () => {
    const store = createMemoryStore();
    await store.increment('a', 60_000);
    await store.increment('a', 60_000);
    expect(await store.increment('b', 60_000)).toBe(1);
    expect(await store.increment('a', 60_000)).toBe(3);
  });
});

describe('withRateLimit', () => {
  const policy = { windowMs: 60_000, maxRequests: 2 };

  it('passes through when within limit', async () => {
    const store = createMemoryStore();
    const enricher = withRateLimit(policy, store);
    const ctx = { params: {} };
    expect((await enricher(ctx)).ok).toBe(true);
    expect((await enricher(ctx)).ok).toBe(true);
  });

  it('returns 429 when limit is exceeded', async () => {
    const store = createMemoryStore();
    const enricher = withRateLimit(policy, store);
    const ctx = { params: {} };
    await enricher(ctx);
    await enricher(ctx);
    const r3 = await enricher(ctx);
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.response.status).toBe(429);
  });

  it('sets Retry-After header when limit is exceeded', async () => {
    const store = createMemoryStore();
    const enricher = withRateLimit(policy, store);
    const ctx = {};
    await enricher(ctx);
    await enricher(ctx);
    const r3 = await enricher(ctx);
    if (!r3.ok) expect(r3.response.headers.get('retry-after')).toBe('60');
  });

  it('uses custom key resolver', async () => {
    const store = createMemoryStore();
    let resolved: string | undefined;
    const keyResolver = (ctx: { userId: string }) => {
      resolved = `user:${ctx.userId}`;
      return resolved;
    };
    const enricher = withRateLimit(policy, store, keyResolver);
    await enricher({ userId: 'abc' });
    expect(resolved).toBe('user:abc');
  });

  it('different keys have independent limits', async () => {
    const store = createMemoryStore();
    const enricher = withRateLimit(policy, store, (ctx: { id: string }) => ctx.id);
    await enricher({ id: 'a' });
    await enricher({ id: 'a' });
    const aResult = await enricher({ id: 'a' }); // 'a' exceeded
    const bResult = await enricher({ id: 'b' }); // 'b' first request
    expect(aResult.ok).toBe(false);
    expect(bResult.ok).toBe(true);
  });
});
