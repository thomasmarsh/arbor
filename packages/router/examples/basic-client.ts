// Type-safe HTTP client wired to an in-memory server (no real HTTP needed).
import z from 'zod';
import type { FetchLike } from '../src/index.js';
import { createClient, createServer, defineRoutes, httpRoute } from '../src/index.js';

const GetUser = z.object({ tag: z.literal('get-user'), id: z.string() });
const UserResp = z.object({ id: z.string(), name: z.string() });

const router = defineRoutes([
  httpRoute(GetUser, 'GET', 'users/:id', {
    response: { 200: UserResp, 404: z.object({ error: z.string() }) },
  }),
]);

const server = createServer(router, {
  'get-user': async (ctx) =>
    Promise.resolve({
      status: 200 as const,
      body: { id: ctx.params.id, name: 'Alice' },
    }),
});

// Mock fetch delegates to the in-memory server so no real HTTP is needed.
const mockFetch: FetchLike = async (url, init) => {
  const result = await server.handle(new URL(url), init.method);
  return { status: result.status, json: async () => Promise.resolve(result.body) };
};

const client = createClient('http://localhost', router, { fetch: mockFetch });

const route = router.parse(new URL('http://localhost/users/7')).getOrThrow();
// response is statically typed as:
//   { status: 200; body: { id: string; name: string } }
// | { status: 404; body: { error: string } }
const response = await client.fetch(route);
console.log(response);
