import { describe, expect, expectTypeOf, it } from 'vitest';
import z from 'zod';
import type { InferContext } from '../core/define-routes.js';
import { literal, object, string } from '../core/schema.js';
import type { Branch, Dual, InferDual, InferSession, Recv, Select, Send, Session } from '../core/session.js';
import {
  httpRoute,
  desc,
  type HttpContext,
  type HttpMethod,
  type HttpResponseUnion,
  type HttpSession,
  type HttpResponseSelect,
  type SessionCtx,
} from './http-context.js';

describe('HttpMethod', () => {
  it('is a union of HTTP verbs', () => {
    expectTypeOf<HttpMethod>().toEqualTypeOf<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>();
    expect(true).toBe(true);
  });
});

describe('HttpContext', () => {
  it('carries method, body, and response', () => {
    type GetUser = HttpContext<'GET', never, { 200: { id: string } }>;

    expectTypeOf<GetUser['method']>().toEqualTypeOf<'GET'>();
    expectTypeOf<GetUser['body']>().toEqualTypeOf<never>();
    expectTypeOf<GetUser['response']>().toEqualTypeOf<{ 200: { id: string } }>();
    expect(true).toBe(true);
  });

  it('supports a POST with body', () => {
    type CreateUser = HttpContext<'POST', { name: string }, { 201: { id: string } }>;

    expectTypeOf<CreateUser['method']>().toEqualTypeOf<'POST'>();
    expectTypeOf<CreateUser['body']>().toEqualTypeOf<{ name: string }>();
    expectTypeOf<CreateUser['response']>().toEqualTypeOf<{ 201: { id: string } }>();
    expect(true).toBe(true);
  });

  it('supports multiple response status codes', () => {
    type Update = HttpContext<
      'PUT',
      { name: string },
      { 200: { id: string }; 404: { error: string } }
    >;

    expectTypeOf<Update['response']>().toEqualTypeOf<{
      200: { id: string };
      404: { error: string };
    }>();
    expect(true).toBe(true);
  });
});

describe('httpRoute', () => {
  const GetUser = object({ tag: literal('get-user'), id: string() });
  const UserResponse = z.object({ id: z.string(), email: z.string() });

  it('creates a RouteNode with HttpContext', () => {
    const r = httpRoute(GetUser, 'GET', ':id/', {
      response: { 200: UserResponse },
    });

    expect(r.path).toBe(':id/');
    expect(r.schema).toBe(GetUser);
    expect(r.children).toEqual([]);
    expect(r._meta).toBeDefined();
  });

  it('infers method from the constructor', () => {
    const r = httpRoute(GetUser, 'GET', ':id/', {
      response: { 200: UserResponse },
    });
    expect(r._meta).toBeDefined();

    type T = InferContext<typeof r>;
    expectTypeOf<T['method']>().toEqualTypeOf<'GET'>();
  });

  it('infers body as never when not provided', () => {
    const r = httpRoute(GetUser, 'GET', ':id/', {
      response: { 200: UserResponse },
    });
    expect(r._meta).toBeDefined();

    type T = InferContext<typeof r>;
    expectTypeOf<T['body']>().toEqualTypeOf<never>();
  });

  it('infers response types from Zod schemas', () => {
    const r = httpRoute(GetUser, 'GET', ':id/', {
      response: { 200: UserResponse },
    });
    expect(r._meta).toBeDefined();

    type T = InferContext<typeof r>;
    expectTypeOf<T['response']>().toEqualTypeOf<{ 200: { id: string; email: string } }>();
  });

  it('infers body type from Zod schema', () => {
    const CreateUser = object({ tag: literal('create-user') });
    const BodySchema = z.object({ name: z.string(), email: z.string() });

    const r = httpRoute(CreateUser, 'POST', 'users/', {
      body: BodySchema,
      response: { 201: UserResponse },
    });
    expect(r._meta).toBeDefined();

    type T = InferContext<typeof r>;
    expectTypeOf<T['method']>().toEqualTypeOf<'POST'>();
    expectTypeOf<T['body']>().toEqualTypeOf<{ name: string; email: string }>();
    expectTypeOf<T['response']>().toEqualTypeOf<{ 201: { id: string; email: string } }>();
  });

  it('supports multiple response status codes', () => {
    const ErrorResponse = z.object({ error: z.string() });

    const r = httpRoute(GetUser, 'GET', ':id/', {
      response: { 200: UserResponse, 404: ErrorResponse },
    });
    expect(r._meta).toBeDefined();

    type T = InferContext<typeof r>;
    expectTypeOf<T['response']>().toEqualTypeOf<{
      200: { id: string; email: string };
      404: { error: string };
    }>();
  });

  it('infers query as never when not provided', () => {
    const r = httpRoute(GetUser, 'GET', ':id/', {
      response: { 200: UserResponse },
    });

    type T = InferContext<typeof r>;
    expectTypeOf<T['query']>().toEqualTypeOf<never>();
    expect(r._meta).toBeDefined();
  });

  describe('body/method type safety', () => {
    const Schema = object({ tag: literal('x') });
    const BodySchema = z.object({ name: z.string() });

    it('GET + body is a type error', () => {
      // @ts-expect-error body is forbidden on GET
      httpRoute(Schema, 'GET', 'x/', { body: BodySchema, response: {} });
      expect(true).toBe(true);
    });

    it('DELETE + body is a type error', () => {
      // @ts-expect-error body is forbidden on DELETE
      httpRoute(Schema, 'DELETE', 'x/', { body: BodySchema, response: {} });
      expect(true).toBe(true);
    });

    it('POST + body compiles cleanly', () => {
      const r = httpRoute(Schema, 'POST', 'x/', { body: BodySchema, response: {} });
      expect(r._meta).toBeDefined();
    });

    it('POST without body compiles cleanly', () => {
      const r = httpRoute(Schema, 'POST', 'x/', { response: {} });
      expect(r._meta).toBeDefined();
    });
  });

  it('infers query type from Zod schema', () => {
    const ListUsers = object({ tag: literal('list-users') });
    const QuerySchema = z.object({ page: z.number(), search: z.string().optional() });

    const r = httpRoute(ListUsers, 'GET', 'users/', {
      query: QuerySchema,
      response: { 200: UserResponse },
    });

    type T = InferContext<typeof r>;
    expectTypeOf<T['query']>().toEqualTypeOf<{ page: number; search?: string | undefined }>();
    expect(r._meta).toBeDefined();
  });

  it('stores querySchema in _meta at runtime', () => {
    const ListUsers = object({ tag: literal('list-users') });
    const QuerySchema = z.object({ page: z.number() });

    const r = httpRoute(ListUsers, 'GET', 'users/', {
      query: QuerySchema,
      response: { 200: UserResponse },
    });

    expect(r._meta?.querySchema).toBe(QuerySchema);
  });

  describe('response header descriptors', () => {
    const HeaderSchema = z.object({ 'x-request-id': z.uuid() });

    it('infers headers type from descriptor object', () => {
      const r = httpRoute(GetUser, 'GET', ':id/', {
        response: { 200: desc(UserResponse, { headers: HeaderSchema }) },
      });
      expect(r._meta).toBeDefined();

      type T = InferContext<typeof r>;
      expectTypeOf<T['response']>().toEqualTypeOf<{
        200: { body: { id: string; email: string }; headers: { 'x-request-id': string } };
      }>();
    });

    it('stores body schema in responseSchemas when using descriptor', () => {
      const r = httpRoute(GetUser, 'GET', ':id/', {
        response: { 200: desc(UserResponse, { headers: HeaderSchema }) },
      });
      expect(r._meta?.responseSchemas?.[200]).toBe(UserResponse);
    });

    it('stores header schema in responseHeaderSchemas', () => {
      const r = httpRoute(GetUser, 'GET', ':id/', {
        response: { 200: desc(UserResponse, { headers: HeaderSchema }) },
      });
      expect(r._meta?.responseHeaderSchemas?.[200]).toBe(HeaderSchema);
    });

    it('bare ZodType still works and has no responseHeaderSchemas entry', () => {
      const r = httpRoute(GetUser, 'GET', ':id/', {
        response: { 200: UserResponse },
      });
      expect(r._meta?.responseHeaderSchemas).toBeUndefined();
    });

    it('mixed descriptor and bare ZodType in same route', () => {
      const ErrorResponse = z.object({ error: z.string() });
      const r = httpRoute(GetUser, 'GET', ':id/', {
        response: {
          200: desc(UserResponse, { headers: HeaderSchema }),
          404: ErrorResponse,
        },
      });
      expect(r._meta?.responseSchemas?.[200]).toBe(UserResponse);
      expect(r._meta?.responseSchemas?.[404]).toBe(ErrorResponse);
      expect(r._meta?.responseHeaderSchemas?.[200]).toBe(HeaderSchema);
      expect(r._meta?.responseHeaderSchemas?.[404]).toBeUndefined();
    });
  });

  describe('requires annotation', () => {
    it('ctx session is never when requires is absent', () => {
      const _r = httpRoute(GetUser, 'GET', ':id/', { response: { 200: UserResponse } });
      type T = InferContext<typeof _r>;
      expectTypeOf<T['session']>().toEqualTypeOf<never>();
    });

    it('ctx session is SessionCtx when requires is present', () => {
      const _r = httpRoute(GetUser, 'GET', ':id/', {
        requires: ['admin'] as const,
        response: { 200: UserResponse },
      });
      type T = InferContext<typeof _r>;
      expectTypeOf<T['session']>().toEqualTypeOf<SessionCtx>();
    });

    it('stores requires in _meta at runtime', () => {
      const r = httpRoute(GetUser, 'GET', ':id/', {
        requires: ['admin', 'super-user'] as const,
        response: { 200: UserResponse },
      });
      expect(r._meta?.requires).toEqual(['admin', 'super-user']);
    });

    it('_meta.requires is absent when requires is not passed', () => {
      const r = httpRoute(GetUser, 'GET', ':id/', { response: { 200: UserResponse } });
      expect(r._meta?.requires).toBeUndefined();
    });
  });
});

// ─── Session annotation ───────────────────────────────────────────────────────

describe('HttpSession annotation', () => {
  // Local utility — proves BranchToUnion<Dual<HttpSession<Res>>> ≡ HttpResponseUnion<Res>
  type BranchToUnion<S extends Session> =
    S extends Branch<infer Cases extends Record<string, Session>>
      ? { [K in keyof Cases]: Cases[K] extends Recv<infer T, Session> ? { status: K; body: T } : never }[keyof Cases]
      : never;

  const GetUser = object({ tag: literal('get-user'), id: string() });
  const UserResponse = z.object({ id: z.string(), email: z.string() });
  const ErrorResponse = z.object({ error: z.string() });

  const _route = httpRoute(GetUser, 'GET', ':id/', {
    response: { 200: UserResponse, 404: ErrorResponse },
  });

  interface RouteRes { 200: { id: string; email: string }; 404: { error: string } }

  it('HttpResponseSelect encodes response map as a Select over Send cases', () => {
    type Sel = HttpResponseSelect<RouteRes>;
    type Expected = Select<{
      200: Send<{ id: string; email: string }>;
      404: Send<{ error: string }>;
    }>;
    expectTypeOf<Sel>().toEqualTypeOf<Expected>();
    expect(true).toBe(true);
  });

  it('InferSession resolves to HttpSession<Res> (not never)', () => {
    type S = InferSession<typeof _route>;
    type Expected = HttpSession<RouteRes>;
    expectTypeOf<S>().toEqualTypeOf<Expected>();
    expect(true).toBe(true);
  });

  it('InferDual resolves to Dual<HttpSession<Res>>', () => {
    type D = InferDual<typeof _route>;
    type Expected = Dual<HttpSession<RouteRes>>;
    expectTypeOf<D>().toEqualTypeOf<Expected>();
    expect(true).toBe(true);
  });

  it('BranchToUnion<Dual<HttpSession<Res>>> equals HttpResponseUnion<Res>', () => {
    type ClientSession = InferDual<typeof _route>;
    type ClientBranch = ClientSession extends Send<void, infer N extends Session> ? N : never;
    type FromSession = BranchToUnion<ClientBranch>;
    type FromUnion = HttpResponseUnion<RouteRes>;
    expectTypeOf<FromSession>().toEqualTypeOf<FromUnion>();
    expect(true).toBe(true);
  });

  it('InferSession result is not never', () => {
    type S = InferSession<typeof _route>;
    type _notNever = [S] extends [never] ? false : true;
    const _ok: _notNever = true;
    expect(_ok).toBe(true);
  });
});
