import { describe, expect, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { defineRoutes } from './define-routes.js';
import { httpRoute } from './http-context.js';
import { createServer } from './server.js';

describe('createServer', () => {
  const GetUser = z.object({ tag: z.literal('get-user'), id: z.string() });
  const CreateUser = z.object({ tag: z.literal('create-user') });
  const UserResp = z.object({ id: z.string(), email: z.string() });
  const ErrorResp = z.object({ error: z.string() });
  const CreateBody = z.object({ name: z.string(), email: z.string() });

  const router = defineRoutes([
    httpRoute(GetUser, 'GET', 'users/:id/', {
      response: { 200: UserResp, 404: ErrorResp },
    }),
    httpRoute(CreateUser, 'POST', 'users/', {
      body: CreateBody,
      response: { 201: UserResp },
    }),
  ]);

  const server = createServer(router, {
    'get-user': async (route) => {
      return { status: 200 as const, body: { id: route.id, email: 'test@test.com' } };
    },
    'create-user': async (_route, body) => {
      return { status: 201 as const, body: { id: '1', email: body.email } };
    },
  });

  describe('type inference', () => {
    it('handler receives correct route param types', () => {
      createServer(router, {
        'get-user': async (route) => {
          expectTypeOf(route).toEqualTypeOf<{ tag: 'get-user'; id: string }>();
          return { status: 200 as const, body: { id: route.id, email: 'a@b.com' } };
        },
        'create-user': async (route, body) => {
          expectTypeOf(route).toEqualTypeOf<{ tag: 'create-user' }>();
          expectTypeOf(body).toEqualTypeOf<{ name: string; email: string }>();
          return { status: 201 as const, body: { id: '1', email: body.email } };
        },
      });
    });
  });

  describe('handle', () => {
    it('dispatches a GET request', async () => {
      const result = await server.handle(new URL('https://example.com/users/123'));
      expect(result).toEqual({ status: 200, body: { id: '123', email: 'test@test.com' } });
    });

    it('returns 404 for unknown routes', async () => {
      const result = await server.handle(new URL('https://example.com/unknown'));
      expect(result.status).toBe(404);
    });
  });
});
