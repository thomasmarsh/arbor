import type { HandlerMap } from '../server/server.js';
import { createServer } from '../server/server.js';
import { createClient, type FetchLike, type TypedClient } from './fetch-client.js';
import type { AnyCtxMap, RouterContract } from '../core/router-contract.js';

export function createTestClient<
  Route extends { tag: string },
  Map extends AnyCtxMap,
>(
  router: RouterContract<Route, Map>,
  handlers: HandlerMap<Map, Route>,
  options?: {
    baseUrl?: string;
    serverOptions?: {
      maxBodySize?: number;
    };
  },
): TypedClient<Route, Map> {
  const server = createServer(router, handlers, options?.serverOptions);
  const baseUrl = options?.baseUrl ?? 'http://localhost';

  const mockFetch: FetchLike = async (url, init) => {
    const bodyText = typeof init.body === 'string' ? init.body : undefined;
    const body = bodyText ? (JSON.parse(bodyText) as unknown) : undefined;
    const headers: Record<string, string> = {};
    if (init.headers) {
      for (const [k, v] of Object.entries(init.headers)) headers[k] = v;
    }
    const result = await server.handle(new URL(url), init.method, body, headers);
    return { status: result.status, json: () => Promise.resolve(result.body) };
  };

  return createClient(baseUrl, router, { fetch: mockFetch });
}
