import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { handleProxy } from '../auth/core.js';
import type { BffEnvironment } from '../env.js';
import { SESSION_COOKIE } from '../session.js';

export function createProxyRouter(env: BffEnvironment) {
  const proxy = new Hono();

  proxy.all('/*', async (c) => {
    const result = await handleProxy(
      env,
      {
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        search: new URL(c.req.url).search,
        sessionToken: getCookie(c, SESSION_COOKIE),
        body:
          c.req.method !== 'GET' && c.req.method !== 'HEAD' ? () => c.req.arrayBuffer() : undefined,
      },
      env.config.ARBO_AUTH_DISABLED,
    );

    switch (result.tag) {
      case 'unauthorized':
        return c.json({ error: 'Unauthorized' }, 401);
      case 'expired':
        return c.json({ error: 'Session expired' }, 401);
      case 'ok':
        return new Response(result.body, {
          status: result.status,
          headers: result.headers,
        });
    }
  });

  return proxy;
}
