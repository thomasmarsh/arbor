import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { makePool } from './db/pg.js';
import type { ApiEnv } from './env.js';
import { liveEnv, parseProcessEnv } from './env.js';
import { ledgerServer } from './ledger/routes.js';
import { hello } from './routes/hello.js';
import { users } from './routes/users.js';

export { ledgerRouter } from './ledger/router.js';
export type { LedgerRouter } from './ledger/router.js';

const app = new Hono<{ Variables: { env: ApiEnv } }>();

app.use('*', logger());
app.use('*', cors({ origin: 'http://localhost:5173' }));

const config = parseProcessEnv();
const env = liveEnv(makePool(config.ARBOR_PG_URL));

app.use('*', (c, next) => {
  c.set('env', env);
  return next();
});

// Mount routes
app.route('/api/hello', hello);
app.route('/api/users', users);

app.all('/api/ledger/*', async (c) => {
  const result = await ledgerServer.handleRequest(c.req.raw);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Hono ContentfulStatusCode is narrower than number
  return c.json(result.body, result.status as any);
});

// Health check (useful for OpenShift liveness/readiness probes)
app.get('/healthz', (c) => c.json({ status: 'ok' }));

serve({ fetch: app.fetch, port: env.config.API_PORT }, (info) => {
  console.log(`API listening on port ${info.port.toString()}`);
});
