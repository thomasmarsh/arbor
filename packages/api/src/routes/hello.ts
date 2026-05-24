import { Hono } from 'hono';
import type { HelloResponse } from '@arbo/common';

const hello = new Hono();

// Caller identity is forwarded by the BFF via internal headers.
// These are set by packages/bff/src/index.ts after session validation.
// TODO: in production, validate a shared secret or mTLS cert here instead of
// trusting headers blindly (this is only safe inside a private cluster network).

hello.get('/', (c) => {
  const callerSub = c.req.header('x-arbo-sub') ?? 'unknown';

  const response: HelloResponse = {
    message:   `Hello from API (caller: ${callerSub})`,
    timestamp: new Date().toISOString(),
  };

  return c.json(response);
});

export { hello };
