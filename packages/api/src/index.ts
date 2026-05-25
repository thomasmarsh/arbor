import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { makePool } from './db/pg.js';
import type { ApiEnv } from './env.js';
import { liveEnv, parseProcessEnv } from './env.js';
import { hello } from './routes/hello.js';
import { users } from './routes/users.js';

const app = new Hono<{ Variables: { env: ApiEnv } }>();

app.use('*', logger());

const config = parseProcessEnv();
const env = liveEnv(makePool(config.ARBOR_PG_URL));

app.use('*', (c, next) => {
  c.set('env', env);
  return next();
});

// Mount routes
app.route('/api/hello', hello);
app.route('/api/users', users);

// Health check (useful for OpenShift liveness/readiness probes)
app.get('/healthz', (c) => c.json({ status: 'ok' }));

serve({ fetch: app.fetch, port: env.config.API_PORT }, (info) => {
  console.log(`API listening on port ${info.port.toString()}`);
});
