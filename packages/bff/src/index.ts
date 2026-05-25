// packages/bff/src/index.ts
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { env } from './env.js';
import { auth } from './routes/auth.js';
import { proxy } from './routes/proxy.js';

const app = new Hono();

app.use('*', logger());

app.route('/auth', auth);
app.route('/api', proxy);

app.get('/healthz', (c) => c.json({ status: 'ok' }));

// ── Static UI (production only) ────────────────────────────────────────────────
// In development, Vite runs separately and proxies /auth + /api to this BFF.
// In production, the BFF serves the built UI directly.

if (env.NODE_ENV === 'production') {
  const uiDist = env.ARBO_UI_DIST ?? path.resolve(import.meta.dirname, '../../../ui/dist');

  app.use('/*', serveStatic({ root: uiDist }));
  app.get('*', serveStatic({ path: path.join(uiDist, 'index.html') }));
}

serve(
  {
    fetch: app.fetch,
    port: env.BFF_PORT,
    ...(env.VITE_USE_HTTPS
      ? {
          createServer: () =>
            https.createServer({
              key: fs.readFileSync('../../certs/localhost+2-key.pem'),
              cert: fs.readFileSync('../../certs/localhost+2.pem'),
            }),
        }
      : {}),
  },
  (_) => {
    const scheme = env.VITE_USE_HTTPS ? 'https' : 'http';
    console.log(
      `BFF listening on ${scheme}://localhost:${String(env.BFF_PORT)}` +
        (env.ARBO_AUTH_DISABLED ? '  [AUTH DISABLED]' : ''),
    );
  },
);
