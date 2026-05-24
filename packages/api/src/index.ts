import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { hello } from './routes/hello.js';

const app = new Hono();

app.use('*', logger());

// Mount routes
app.route('/api/hello', hello);

// Health check (useful for OpenShift liveness/readiness probes)
app.get('/healthz', (c) => c.json({ status: 'ok' }));

const port = parseInt(process.env['PORT'] ?? '3000', 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port.toString()}`);
});
