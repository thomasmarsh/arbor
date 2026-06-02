import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { defineRoutes, createServer, respond } from '@arbor/router';
import { makePool } from './db/pg.js';
import { liveEnv, parseProcessEnv } from './env.js';
import { ledgerServer } from './ledger/routes.js';
import { helloRouter } from '@arbor/app-common';
import { usersRouter } from './routes/users.router.js';

export { ledgerRouter } from './ledger/router.js';
export type { LedgerRouter } from './ledger/router.js';

const config = parseProcessEnv();
const env = liveEnv(makePool(config.ARBOR_PG_URL));

const apiRouter = defineRoutes([
  ...helloRouter.children,
  ...usersRouter.children,
]);

const apiServer = createServer(apiRouter, {
  hello: (ctx) => {
    const callerSub = ctx.headers['x-arbor-sub'] ?? 'unknown';
    return Promise.resolve(respond(200, {
      message: `Hello from API (caller: ${callerSub})`,
      timestamp: new Date().toISOString(),
    }));
  },

  'users-list': async (_ctx) => {
    const result = await env.db.users.findAll();
    if (result.isOk()) return respond(200, result.value);
    return respond(500, { error: 'internal' });
  },

  'users-get': async (ctx) => {
    const result = await env.db.users.findById(ctx.params.id);
    if (result.isOk()) return respond(200, result.value);
    return result.error === 'not_found'
      ? respond(404, { error: 'not_found' })
      : respond(500, { error: 'internal' });
  },

  'users-create': async (ctx) => {
    const result = await env.db.users.create(ctx.body.email);
    if (result.isOk()) return respond(201, result.value);
    return respond(500, { error: 'internal' });
  },
});

const app = new Hono();

app.use('*', logger());
app.use('*', cors({ origin: 'http://localhost:5173' }));

app.all('/api/*', async (c) => {
  const url = new URL(c.req.url);
  const method = c.req.method;
  const ct = c.req.header('content-type') ?? '';
  const body: unknown = ct.startsWith('application/json') ? await c.req.json() as unknown : undefined;
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((v, k) => { headers[k] = v; });

  const apiResult = await apiServer.handle(url, method, body, headers);
  if (apiResult.tag !== 'unmatched') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Hono ContentfulStatusCode is narrower than number
    return c.json(apiResult.body, apiResult.status as any);
  }

  const ledgerResult = await ledgerServer.handle(url, method, body, headers);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Hono ContentfulStatusCode is narrower than number
  return c.json(ledgerResult.body, ledgerResult.status as any);
});

// Health check (useful for OpenShift liveness/readiness probes)
app.get('/healthz', (c) => c.json({ status: 'ok' }));

serve({ fetch: app.fetch, port: env.config.API_PORT }, (info) => {
  console.log(`API listening on port ${info.port.toString()}`);
});
