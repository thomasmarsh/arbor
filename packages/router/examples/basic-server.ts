// Minimal HTTP server: one GET route, in-memory dispatch.
import z from 'zod';
import { createServer, defineRoutes, httpRoute } from '../src/index.js';

const GetUser = z.object({ tag: z.literal('get-user'), id: z.string() });
const UserResp = z.object({ id: z.string(), name: z.string() });

const router = defineRoutes([
  httpRoute(GetUser, 'GET', 'users/:id', {
    response: { 200: UserResp, 404: z.object({ error: z.string() }) },
  }),
]);

const server = createServer(router, {
  'get-user': async (ctx) => {
    if (ctx.params.id === '42') {
      return { status: 200 as const, body: { id: '42', name: 'Alice' } };
    }
    return { status: 404 as const, body: { error: 'user not found' } };
  },
});

console.log(await server.handle(new URL('http://localhost/users/42'), 'GET'));
// { status: 200, body: { id: '42', name: 'Alice' } }

console.log(await server.handle(new URL('http://localhost/users/99'), 'GET'));
// { status: 404, body: { error: 'user not found' } }

console.log(await server.handle(new URL('http://localhost/unknown'), 'GET'));
// { status: 404, body: { error: 'no route: /unknown' } }
