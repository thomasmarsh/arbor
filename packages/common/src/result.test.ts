import { describe, expect, it } from 'vitest';
import { Result } from './result.js';

describe('Result type', () => {
  describe('Constructors & Guards', () => {
    it('should create and guard a success instance', () => {
      const res = Result.ok('hello');
      expect(res.isOk()).toBe(true);
      expect(res.isErr()).toBe(false);
      expect(res.value).toBe('hello');
      expect(res.error).toBeUndefined();
    });

    it('should create and guard a failure instance', () => {
      const res = Result.err(new Error('boom'));
      expect(res.isOk()).toBe(false);
      expect(res.isErr()).toBe(true);
      expect(res.error?.message).toBe('boom');
      expect(res.value).toBeUndefined();
    });
  });

  describe('Unwrapping & Fallbacks', () => {
    it('should return value on getOrThrow for ok instances', () => {
      expect(Result.ok(42).getOrThrow()).toBe(42);
    });

    it('should crash safely on getOrThrow for err instances with details', () => {
      const res = Result.err({ code: 'AUTH_FAILED' });
      expect(() => res.getOrThrow()).toThrow(
        'Force unwrap expected ok, but was err: {"code":"AUTH_FAILED"}',
      );
    });

    it('should handle circular objects without throwing inside getOrThrow', () => {
      const circular: Record<string, unknown> = {};
      circular['self'] = circular;
      const res = Result.err(circular);
      expect(() => res.getOrThrow()).toThrow(
        'Force unwrap expected ok, but was err: [Unserializable Circular Object]',
      );
    });

    it('should extract error on getErrorOrThrow', () => {
      const res = Result.err('unauthorized');
      expect(res.getErrorOrThrow()).toBe('unauthorized');
      expect(() => Result.ok(1).getErrorOrThrow()).toThrow('Force unwrap expected err, but was ok');
    });

    it('should fallback gracefully with getOrElse', () => {
      expect(Result.ok('primary').getOrElse('fallback')).toBe('primary');
      expect(Result.err('error').getOrElse('fallback' as never)).toBe('fallback');
    });

    it('should branch execution with fold', () => {
      const okVal = Result.ok(10).fold(
        (n) => n * 2,
        () => 0,
      );
      const errVal = Result.err<number, string>('fail').fold(
        () => 0,
        (e) => e + 'ed',
      );
      expect(okVal).toBe(20);
      expect(errVal).toBe('failed');
    });
  });

  describe('Memory Optimization & Allocations', () => {
    it('should return the exact same instance during unmatched map operations', () => {
      const original = Result.err('network_error');
      const transformed = original.map((val) => String(val));
      expect(transformed).toBe(original); // Checks physical reference equality
    });

    it('should return the exact same instance during unmatched mapError operations', () => {
      const original = Result.ok(100);
      const transformed = original.mapError((err) => String(err));
      expect(transformed).toBe(original); // Checks physical reference equality
    });
  });

  describe('Monadic Transformers (Chaining)', () => {
    it('should map successful values and short-circuit errors', () => {
      const okMap = Result.ok(2).map((n) => n * 10);
      expect(okMap.getOrThrow()).toBe(20);

      const errInstance = Result.err<number, string>('error');
      const errMap = errInstance.map((n) => n * 10);
      expect(errMap.error).toBe('error');
    });

    it('should flatMap structural dependent calls', () => {
      const getNextResult = (n: number) => Result.ok(n + 1);
      const res = Result.ok(5).flatMap(getNextResult);
      expect(res.getOrThrow()).toBe(6);
    });

    it('should transform errors via mapError', () => {
      const res = Result.err('short').mapError((e) => e.toUpperCase());
      expect(res.error).toBe('SHORT');
    });

    it('should chain error fallbacks with flatMapError', () => {
      const res = Result.err('original').flatMapError((_e) => Result.ok('recovered'));
      expect(res.getOrThrow()).toBe('recovered');
    });
  });

  describe('Asynchronous Factories & Chaining', () => {
    it('should capture resolving promises via fromPromise and fromAsync', async () => {
      const resPromise = await Result.fromPromise(Promise.resolve('data'));
      const resAsync = await Result.fromAsync(async () => 'lazy-data');
      expect(resPromise.getOrThrow()).toBe('data');
      expect(resAsync.getOrThrow()).toBe('lazy-data');
    });

    it('should catch rejecting promises into failure states', async () => {
      const promise = Promise.reject(new Error('network-down'));
      const res = await Result.fromPromise(promise);
      expect(res.isErr()).toBe(true);
      expect(res.error?.message).toBe('network-down');
    });

    it('should safely map values asynchronously using mapAsync', async () => {
      const original = Result.ok(5);
      const asyncMapped = await original.mapAsync(async (n) => n * 2);
      expect(asyncMapped.getOrThrow()).toBe(10);

      const errorChain = Result.err<number, string>('bad_state');
      const shortCircuited = await errorChain.mapAsync(async (n) => n * 2);
      expect(shortCircuited.error).toBe('bad_state');
    });

    it('should catch inner execution errors inside mapAsync fallback', async () => {
      const original = Result.ok('payload');
      const failedAsync = await original.mapAsync(
        async () => {
          throw new Error('inner');
        },
        (err) => (err as Error).message + '_caught',
      );
      expect(failedAsync.error).toBe('inner_caught');
    });

    it('should chain asynchronous processes cleanly via flatMapAsync', async () => {
      const original = Result.ok('token_id');
      const asyncFlatMapped = await original.flatMapAsync(async (id) => Result.ok(id + '_valid'));
      expect(asyncFlatMapped.getOrThrow()).toBe('token_id_valid');
    });
  });

  describe('Collection Managers (Combine & Settled)', () => {
    it('should collect array values if all results are ok', () => {
      const list = [Result.ok(1), Result.ok(2), Result.ok(3)];
      const combined = Result.combine(list);
      expect(combined.isOk()).toBe(true);
      expect(combined.getOrThrow()).toEqual([1, 2, 3]);
    });

    it('should short-circuit and return the first failure encountered', () => {
      const list = [Result.ok(1), Result.err('first failure'), Result.err('second')];
      const combined = Result.combine(list);
      expect(combined.isErr()).toBe(true);
      expect(combined.error).toBe('first failure');
    });

    it('should resolve and categorize everything using settled without short-circuiting', () => {
      const list = [
        Result.ok('user1'),
        Result.err('timeout_db'),
        Result.ok('user2'),
        Result.err('invalid_schema'),
      ];
      const batch = Result.settled(list);
      expect(batch.successes).toEqual(['user1', 'user2']);
      expect(batch.failures).toEqual(['timeout_db', 'invalid_schema']);
    });
  });
});
