// Typed HTTP client: options object API, request headers, TypedClient utility type.
import z from 'zod';
import type { FetchLike, TypedClient } from '../src/index.js';
import { createClient, createServer, defineRoutes, httpRoute, respond } from '../src/index.js';

const AuthHeader = z.object({ authorization: z.string() });
const GetMe = z.object({ tag: z.literal('get-me') });
const CreatePost = z.object({ tag: z.literal('create-post') });
const MeResp = z.object({ id: z.string(), name: z.string() });
const PostBody = z.object({ title: z.string() });
const PostResp = z.object({ id: z.string(), title: z.string() });

const router = defineRoutes([
  // Route with typed request headers — omitting `headers` at the call site is a type error.
  httpRoute(GetMe, 'GET', 'me/', {
    headers: AuthHeader,
    response: { 200: MeResp, 401: z.object({ error: z.string() }) },
  }),
  // Route with a body — the options object keeps body and headers orthogonal.
  httpRoute(CreatePost, 'POST', 'posts/', {
    body: PostBody,
    response: { 201: PostResp },
  }),
]);

// TypedClient<Route, Map> lets you annotate a variable without repeating generics.
type Router = typeof router;

const server = createServer(router, {
  'get-me': async (ctx) => {
    const auth = ctx.headers?.authorization ?? '';
    return Promise.resolve(
      auth.startsWith('Bearer ')
        ? respond(200, { id: '1', name: auth.slice(7) })
        : respond(401, { error: 'unauthorized' }),
    );
  },
  'create-post': async (ctx) =>
    Promise.resolve(respond(201, { id: '42', title: ctx.body.title })),
});

const mockFetch: FetchLike = async (url, init) => {
  const reqHeaders: Record<string, string> = init.headers ?? {};
  const body: unknown = init.body ? JSON.parse(init.body) : undefined;
  const result = await server.handle(new URL(url), init.method, body, reqHeaders);
  return { status: result.status, json: async () => Promise.resolve(result.body) };
};

const client: TypedClient<Router['_type'], Router['_ctxMap']> = createClient(
  'http://localhost',
  router,
  { fetch: mockFetch },
);

// Request headers are typed — { authorization: string } is required here.
const me = await client.fetch({ tag: 'get-me' }, { headers: { authorization: 'Bearer alice' } });
console.log('get-me (authed):', me);

const unauthed = await client.fetch({ tag: 'get-me' }, { headers: { authorization: 'invalid' } });
console.log('get-me (unauthed):', unauthed);

// Body routes use the same options object.
const post = await client.fetch({ tag: 'create-post' }, { body: { title: 'Hello world' } });
console.log('create-post:', post);
