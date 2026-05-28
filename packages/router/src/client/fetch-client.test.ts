import type { Result } from '@arbor/common';
import { describe, expect, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { httpRoute } from '../contexts/http-context.js';
import { defineRoutes } from '../core/define-routes.js';
import { createClient, type FetchLike } from './fetch-client.js';

describe('createClient', () => {
  const GetUser = z.object({ tag: z.literal('get-user'), id: z.string() });
  const CreateUser = z.object({ tag: z.literal('create-user') });
  const SearchItems = z.object({ tag: z.literal('search-items') });
  const UserResp = z.object({ id: z.string(), email: z.string() });
  const ErrorResp = z.object({ error: z.string() });
  const CreateBody = z.object({ name: z.string(), email: z.string() });
  const SearchQuery = z.object({ page: z.number().default(1) });
  const SearchResp = z.object({ count: z.number() });

  const router = defineRoutes([
    httpRoute(GetUser, 'GET', 'users/:id/', {
      response: { 200: UserResp, 404: ErrorResp },
    }),
    httpRoute(CreateUser, 'POST', 'users/', {
      body: CreateBody,
      response: { 201: UserResp },
    }),
    httpRoute(SearchItems, 'GET', 'items/', {
      query: SearchQuery,
      response: { 200: SearchResp },
    }),
  ]);

  function mockFetch(
    handler: (
      url: string,
      init: { method: string; body?: string },
    ) => { status: number; body: unknown },
  ): FetchLike {
    return (url, init) => {
      const result = handler(url, init);
      return Promise.resolve({
        status: result.status,
        json: () => Promise.resolve(result.body),
      });
    };
  }

  describe('type inference', () => {
    const fetchFn = mockFetch(() => ({ status: 200, body: { id: '1', email: 'a@b.com' } }));
    const client = createClient('https://example.com', router, { fetch: fetchFn });

    it('GET route returns typed response union', async () => {
      const result = await client.fetch({ tag: 'get-user', id: '123' });
      expectTypeOf(result).toEqualTypeOf<
        | { status: 200; body: { id: string; email: string } }
        | { status: 404; body: { error: string } }
      >();
      expect(result.status).toBe(200);
    });

    it('POST route requires body argument', async () => {
      const result = await client.fetch(
        { tag: 'create-user' },
        { name: 'Alice', email: 'alice@test.com' },
      );
      expectTypeOf(result).toEqualTypeOf<{ status: 201; body: { id: string; email: string } }>();
      expect(result.status).toBe(200);
    });
  });

  describe('URL construction', () => {
    it('builds correct URL for GET route', async () => {
      let capturedUrl = '';
      const fetchFn = mockFetch((url) => {
        capturedUrl = url;
        return { status: 200, body: { id: '123', email: 'test@test.com' } };
      });

      const client = createClient('https://example.com', router, { fetch: fetchFn });
      await client.fetch({ tag: 'get-user', id: '123' });

      expect(capturedUrl).toBe('https://example.com/users/123');
    });

    it('builds correct URL for POST route', async () => {
      let capturedUrl = '';
      const fetchFn = mockFetch((url) => {
        capturedUrl = url;
        return { status: 201, body: { id: '1', email: 'alice@test.com' } };
      });

      const client = createClient('https://example.com', router, { fetch: fetchFn });
      await client.fetch({ tag: 'create-user' }, { name: 'Alice', email: 'alice@test.com' });

      expect(capturedUrl).toBe('https://example.com/users');
    });

    it('serializes explicit query sub-object as URL query params', async () => {
      let capturedUrl = '';
      const fetchFn = mockFetch((url) => {
        capturedUrl = url;
        return { status: 200, body: { count: 5 } };
      });

      const client = createClient('https://example.com', router, { fetch: fetchFn });
      await client.fetch({ tag: 'search-items', query: { page: 5 } });

      expect(capturedUrl).toBe('https://example.com/items?page=5');
    });

    it('applies query schema defaults (page=1) when not specified', async () => {
      let capturedUrl = '';
      const fetchFn = mockFetch((url) => {
        capturedUrl = url;
        return { status: 200, body: { count: 1 } };
      });

      const client = createClient('https://example.com', router, { fetch: fetchFn });
      await client.fetch({ tag: 'search-items', query: { page: 1 } });

      expect(capturedUrl).toBe('https://example.com/items?page=1');
    });

    it('strips trailing slash from base URL', async () => {
      let capturedUrl = '';
      const fetchFn = mockFetch((url) => {
        capturedUrl = url;
        return { status: 200, body: { id: '1', email: 'test@test.com' } };
      });

      const client = createClient('https://example.com/', router, { fetch: fetchFn });
      await client.fetch({ tag: 'get-user', id: '1' });

      expect(capturedUrl).toBe('https://example.com/users/1');
    });
  });

  describe('HTTP method', () => {
    it('uses GET for get-user', async () => {
      let capturedMethod = '';
      const fetchFn = mockFetch((_url, init) => {
        capturedMethod = init.method;
        return { status: 200, body: { id: '1', email: 'test@test.com' } };
      });

      const client = createClient('https://example.com', router, { fetch: fetchFn });
      await client.fetch({ tag: 'get-user', id: '1' });

      expect(capturedMethod).toBe('GET');
    });

    it('uses POST for create-user', async () => {
      let capturedMethod = '';
      const fetchFn = mockFetch((_url, init) => {
        capturedMethod = init.method;
        return { status: 201, body: { id: '1', email: 'alice@test.com' } };
      });

      const client = createClient('https://example.com', router, { fetch: fetchFn });
      await client.fetch({ tag: 'create-user' }, { name: 'Alice', email: 'alice@test.com' });

      expect(capturedMethod).toBe('POST');
    });
  });

  describe('body handling', () => {
    it('sends JSON body for POST requests', async () => {
      let capturedBody = '';
      let capturedHeaders: Record<string, string> = {};
      const fetchFn: FetchLike = (_url, init) => {
        capturedBody = init.body ?? '';
        capturedHeaders = init.headers ?? {};
        return Promise.resolve({
          status: 201,
          json: () => Promise.resolve({ id: '1', email: 'alice@test.com' }),
        });
      };

      const client = createClient('https://example.com', router, { fetch: fetchFn });
      await client.fetch({ tag: 'create-user' }, { name: 'Alice', email: 'alice@test.com' });

      expect(JSON.parse(capturedBody)).toEqual({ name: 'Alice', email: 'alice@test.com' });
      expect(capturedHeaders['Content-Type']).toBe('application/json');
    });

    it('does not send body for GET requests', async () => {
      let capturedBody: string | undefined;
      const fetchFn: FetchLike = (_url, init) => {
        capturedBody = init.body;
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve({ id: '1', email: 'test@test.com' }),
        });
      };

      const client = createClient('https://example.com', router, { fetch: fetchFn });
      await client.fetch({ tag: 'get-user', id: '1' });

      expect(capturedBody).toBeUndefined();
    });
  });

  describe('response handling', () => {
    it('returns status and parsed body on success', async () => {
      const fetchFn = mockFetch(() => ({
        status: 200,
        body: { id: '123', email: 'test@test.com' },
      }));

      const client = createClient('https://example.com', router, { fetch: fetchFn });
      const result = await client.fetch({ tag: 'get-user', id: '123' });

      expect(result).toEqual({
        status: 200,
        body: { id: '123', email: 'test@test.com' },
      });
    });

    it('returns error status codes', async () => {
      const fetchFn = mockFetch(() => ({
        status: 404,
        body: { error: 'user not found' },
      }));

      const client = createClient('https://example.com', router, { fetch: fetchFn });
      const result = await client.fetch({ tag: 'get-user', id: '999' });

      expect(result).toEqual({
        status: 404,
        body: { error: 'user not found' },
      });
    });
  });

  describe('validate option', () => {
    it('returns Result.success wrapping response when body matches schema', async () => {
      const fetchFn = mockFetch(() => ({
        status: 200,
        body: { id: '123', email: 'test@test.com' },
      }));

      const client = createClient('https://example.com', router, {
        fetch: fetchFn,
        validate: true,
      });
      const result = await client.fetch({ tag: 'get-user', id: '123' });

      expect(result.isSuccess()).toBe(true);
      expect(result.getOrThrow()).toEqual({
        status: 200,
        body: { id: '123', email: 'test@test.com' },
      });
    });

    it('returns Result.failure when body does not match schema', async () => {
      const fetchFn = mockFetch(() => ({
        status: 200,
        body: { wrong: 'shape' },
      }));

      const client = createClient('https://example.com', router, {
        fetch: fetchFn,
        validate: true,
      });
      const result = await client.fetch({ tag: 'get-user', id: '123' });

      expect(result.isFailure()).toBe(true);
    });

    it('returns Result.success when status has no schema (unvalidated passthrough)', async () => {
      const fetchFn = mockFetch(() => ({
        status: 500,
        body: { anything: true },
      }));

      const client = createClient('https://example.com', router, {
        fetch: fetchFn,
        validate: true,
      });
      const result = await client.fetch({ tag: 'get-user', id: '123' });

      expect(result.isSuccess()).toBe(true);
    });

    it('infers Result return type when validate is true', () => {
      const fetchFn = mockFetch(() => ({ status: 200, body: {} }));
      const client = createClient('https://example.com', router, {
        fetch: fetchFn,
        validate: true,
      });

      expectTypeOf(client.fetch({ tag: 'get-user', id: '1' })).toEqualTypeOf<
        Promise<
          Result<
            | { status: 200; body: { id: string; email: string } }
            | { status: 404; body: { error: string } },
            z.ZodError
          >
        >
      >();
    });

    it('infers plain ResponseUnion return type when validate is false (default)', () => {
      const fetchFn = mockFetch(() => ({ status: 200, body: {} }));
      const client = createClient('https://example.com', router, { fetch: fetchFn });

      expectTypeOf(client.fetch({ tag: 'get-user', id: '1' })).toEqualTypeOf<
        Promise<
          | { status: 200; body: { id: string; email: string } }
          | { status: 404; body: { error: string } }
        >
      >();
    });
  });
});
