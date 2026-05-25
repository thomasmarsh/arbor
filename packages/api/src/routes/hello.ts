import type { HelloResponse } from '@arbor/common';
import { Hono } from 'hono';

const hello = new Hono();

// Caller identity is forwarded by the BFF via internal headers.
// These are set by packages/bff/src/auth/core.ts (handleProxy) after session validation.
// TODO: in production, validate a shared secret or mTLS cert here instead of
// trusting headers blindly (this is only safe inside a private cluster network).

hello.get('/', (c) => {
  const callerSub = c.req.header('x-arbor-sub') ?? 'unknown';

  const response: HelloResponse = {
    message: `Hello from API (caller: ${callerSub})`,
    timestamp: new Date().toISOString(),
  };

  return c.json(response);
});

export { hello };
