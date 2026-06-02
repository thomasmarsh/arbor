// createTestClient: in-memory typed client for test suites — no boilerplate needed.
import z from 'zod';
import { createTestClient, defineRoutes, httpRoute, respond } from '../src/index.js';

const GetUser = z.object({ tag: z.literal('get-user'), id: z.string() });
const CreateUser = z.object({ tag: z.literal('create-user') });
const UserResp = z.object({ id: z.string(), name: z.string() });
const CreateBody = z.object({ name: z.string() });

const router = defineRoutes([
  httpRoute(GetUser, 'GET', 'users/:id', {
    response: { 200: UserResp, 404: z.object({ error: z.string() }) },
  }),
  httpRoute(CreateUser, 'POST', 'users', {
    body: CreateBody,
    response: { 201: UserResp },
  }),
]);

// One call wires up the in-memory server and returns a typed client.
const client = createTestClient(router, {
  'get-user': (ctx) => Promise.resolve(respond(200, { id: ctx.params.id, name: 'Alice' })),
  'create-user': (ctx) => Promise.resolve(respond(201, { id: 'new', name: ctx.body.name })),
});

const route = router.parse(new URL('http://localhost/users/7')).getOrThrow();
// Statically typed as { status: 200; body: { id: string; name: string } }
//                    | { status: 404; body: { error: string } }
const response = await client.fetch(route);
console.log('GET response:', response);

const postResp = await client.fetch({ tag: 'create-user' }, { body: { name: 'Bob' } });
console.log('POST response:', postResp);
