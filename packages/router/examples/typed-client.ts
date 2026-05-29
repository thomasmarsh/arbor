// Typed HTTP client: options object API, request headers, TypedClient utility type.
import z from 'zod';
import { createClient, createServer, defineRoutes, httpRoute } from '../src/index.js';
import type { FetchLike, TypedClient } from '../src/index.js';

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
let client: TypedClient<Router['_type'], Router['_ctxMap']>;

const server = createServer(router, {
  'get-me': async (ctx) => {
    const auth = ctx.headers?.authorization ?? '';
    if (!auth.startsWith('Bearer ')) {
      return { status: 401 as const, body: { error: 'unauthorized' } };
    }
    return { status: 200 as const, body: { id: '1', name: auth.slice(7) } };
  },
  'create-post': async (ctx) => ({
    status: 201 as const,
    body: { id: '42', title: ctx.body.title },
  }),
});

const mockFetch: FetchLike = async (url, init) => {
  const reqHeaders: Record<string, string> = init.headers ?? {};
  const body: unknown = init.body ? JSON.parse(init.body) : undefined;
  const result = await server.handle(new URL(url), init.method, body, reqHeaders);
  return { status: result.status, json: async () => result.body };
};

client = createClient('http://localhost', router, { fetch: mockFetch });

// Request headers are typed — { authorization: string } is required here.
const me = await client.fetch({ tag: 'get-me' }, { headers: { authorization: 'Bearer alice' } });
console.log('get-me (authed):', me);

const unauthed = await client.fetch({ tag: 'get-me' }, { headers: { authorization: 'invalid' } });
console.log('get-me (unauthed):', unauthed);

// Body routes use the same options object.
const post = await client.fetch({ tag: 'create-post' }, { body: { title: 'Hello world' } });
console.log('create-post:', post);
