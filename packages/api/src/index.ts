import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { apiEnv } from './env.js';
import { hello } from './routes/hello.js';

const app = new Hono();

app.use('*', logger());

// Mount routes
app.route('/api/hello', hello);

// Health check (useful for OpenShift liveness/readiness probes)
app.get('/healthz', (c) => c.json({ status: 'ok' }));

serve({ fetch: app.fetch, port: apiEnv.API_PORT }, (info) => {
  console.log(`API listening on port ${info.port.toString()}`);
});
