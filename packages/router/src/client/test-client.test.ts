import { describe, expect, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { httpRoute, respond } from '../contexts/http-context.js';
import { defineRoutes } from '../core/define-routes.js';
import { createTestClient } from './test-client.js';

describe('createTestClient', () => {
  const GetUser = z.object({ tag: z.literal('get-user'), id: z.string() });
  const CreateUser = z.object({ tag: z.literal('create-user') });
  const UserResp = z.object({ id: z.string(), name: z.string() });
  const ErrorResp = z.object({ error: z.string() });
  const CreateBody = z.object({ name: z.string() });

  const router = defineRoutes([
    httpRoute(GetUser, 'GET', 'users/:id/', {
      response: { 200: UserResp, 404: ErrorResp },
    }),
    httpRoute(CreateUser, 'POST', 'users/', {
      body: CreateBody,
      response: { 201: UserResp },
    }),
  ]);

  const client = createTestClient(router, {
    'get-user': (ctx) => {
      if (ctx.params.id === '404') return Promise.resolve(respond(404, { error: 'not found' }));
      return Promise.resolve(respond(200, { id: ctx.params.id, name: 'Alice' }));
    },
    'create-user': (ctx) => Promise.resolve(respond(201, { id: 'new', name: ctx.body.name })),
  });

  it('returns a typed response for a GET route', async () => {
    const result = await client.fetch({ tag: 'get-user', id: '7' });
    expectTypeOf(result).toEqualTypeOf<
      { status: 200; body: { id: string; name: string } } | { status: 404; body: { error: string } }
    >();
    expect(result).toEqual({ status: 200, body: { id: '7', name: 'Alice' } });
  });

  it('returns a 404 response when handler returns it', async () => {
    const result = await client.fetch({ tag: 'get-user', id: '404' });
    expect(result).toEqual({ status: 404, body: { error: 'not found' } });
  });

  it('forwards request body to the handler', async () => {
    const result = await client.fetch({ tag: 'create-user' }, { body: { name: 'Bob' } });
    expectTypeOf(result).toEqualTypeOf<{ status: 201; body: { id: string; name: string } }>();
    expect(result).toEqual({ status: 201, body: { id: 'new', name: 'Bob' } });
  });
});
