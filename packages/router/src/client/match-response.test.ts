import { describe, expect, expectTypeOf, it } from 'vitest';
import { matchResponse } from './match-response.js';

type Res = { status: 200; body: { id: number } } | { status: 404; body: { error: string } };

// Function return types prevent TypeScript from narrowing to a specific union
// member, keeping the full Res union as the response type for all tests.
function makeOk(): Res {
  return { status: 200, body: { id: 1 } };
}
function makeNotFound(): Res {
  return { status: 404, body: { error: 'not found' } };
}

describe('matchResponse', () => {
  it('calls the matching status handler', () => {
    const result = matchResponse(makeOk(), {
      200: (body) => `ok:${String(body.id)}`,
      404: (body) => `err:${body.error}`,
    });
    expect(result).toBe('ok:1');
  });

  it('calls the 404 handler for a 404 response', () => {
    const result = matchResponse(makeNotFound(), {
      200: (body) => `ok:${String(body.id)}`,
      404: (body) => `err:${body.error}`,
    });
    expect(result).toBe('err:not found');
  });

  it('falls through to _ when specific handler is absent', () => {
    const result = matchResponse(makeNotFound(), {
      200: () => 'ok',
      _: (res) => `fallback:${String(res.status)}`,
    });
    expect(result).toBe('fallback:404');
  });

  it('calls _ for the matched status if specific handler absent', () => {
    const result = matchResponse(makeOk(), {
      _: (res) => `fallback:${String(res.status)}`,
    });
    expect(result).toBe('fallback:200');
  });

  it('infers return type as union of handler returns', () => {
    const result = matchResponse(makeOk(), {
      200: (_body) => 1 as const,
      404: (_body) => 'two' as const,
    });
    expectTypeOf(result).toEqualTypeOf<1 | 'two'>();
  });

  it('infers body types for each status', () => {
    matchResponse(makeOk(), {
      200: (body) => {
        expectTypeOf(body).toEqualTypeOf<{ id: number }>();
        return 0;
      },
      404: (body) => {
        expectTypeOf(body).toEqualTypeOf<{ error: string }>();
        return 0;
      },
    });
  });

  it('missing branch without _ is a compile-time type error', () => {
    // @ts-expect-error — 404 handler missing and no _ fallback
    matchResponse(makeOk(), { 200: (body) => body.id });
  });
});
