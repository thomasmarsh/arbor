import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { makePool } from './db/pg.js';
import { liveEnv, parseProcessEnv } from './env.js';
import { hello } from './routes/hello.js';

const app = new Hono();

app.use('*', logger());

const config = parseProcessEnv();
const env = liveEnv(makePool(config.ARBO_PG_URL));

// Mount routes
app.route('/api/hello', hello);

// Health check (useful for OpenShift liveness/readiness probes)
app.get('/healthz', (c) => c.json({ status: 'ok' }));

serve({ fetch: app.fetch, port: env.config.API_PORT }, (info) => {
  console.log(`API listening on port ${info.port.toString()}`);
});
