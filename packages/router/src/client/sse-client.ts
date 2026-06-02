/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Result } from '@arbor/common';
import type { RouteNode } from '../core/route-node.js';
import type { SseContext, SseWalkNode } from '../contexts/realtime/sse-context.js';
import { walkCollect } from '../core/walk.js';
import { getSseMeta } from '../contexts/realtime/sse-context.js';

// ─── Transport abstraction ────────────────────────────────────────────────────

export type SseFetchLike = (
  url: string,
  init: { method: string; headers?: Record<string, string> },
) => Promise<{
  status: number;
  body: ReadableStream<Uint8Array> | null;
}>;

// ─── SSE client types ─────────────────────────────────────────────────────────

export interface SseClient<
  Route extends { tag: string },
  Map extends Record<string, SseContext<any>>,
> {
  subscribe<Tag extends keyof Map & string>(
    route: Extract<Route, { tag: Tag }>,
  ): AsyncIterable<Map[Tag]['events']>;
}

interface SseRouterLike<
  Route extends { tag: string },
  Map extends Record<string, SseContext<any>>,
> {
  _type: Route;
  _ctxMap: Map;
  children: RouteNode<unknown, any, any, any, any, any>[];
  parse(url: URL): Result<Route, string>;
  print(route: Route): string;
}

// ─── Client factory ───────────────────────────────────────────────────────────

export function createSseClient<
  Route extends { tag: string },
  Map extends Record<string, SseContext<any>>,
>(
  baseUrl: string,
  router: SseRouterLike<Route, Map>,
  options?: { fetch?: SseFetchLike },
): SseClient<Route, Map> {
  const eventSchemaMap = walkCollect(
    router.children as SseWalkNode[],
    (n) => getSseMeta(n)?.eventSchema,
  );

  const fetchFn: SseFetchLike = options?.fetch ?? globalThis.fetch;

  return {
    subscribe<Tag extends keyof Map & string>(
      route: Extract<Route, { tag: Tag }>,
    ): AsyncIterable<Map[Tag]['events']> {
      const tag = route.tag;
      const path = router.print(route);
      const url = `${baseUrl.replace(/\/$/, '')}${path}`;
      const schema = eventSchemaMap[tag];

      return {
        [Symbol.asyncIterator](): AsyncIterator<Map[Tag]['events']> {
          let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
          let buffer = '';
          let done = false;

          async function initReader(): Promise<ReadableStreamDefaultReader<Uint8Array>> {
            if (reader) return reader;
            const response = await fetchFn(url, { method: 'GET', headers: { Accept: 'text/event-stream' } });
            if (!response.body) throw new Error('SSE response has no body');
            reader = response.body.getReader();
            return reader;
          }

          const decoder = new TextDecoder();

          return {
            async next(): Promise<IteratorResult<Map[Tag]['events']>> {
              if (done) return { value: undefined as never, done: true };

              const r = await initReader();

              for (;;) {
                // Parse complete SSE frames already in buffer
                const doubleNewline = buffer.indexOf('\n\n');
                if (doubleNewline !== -1) {
                  const frame = buffer.slice(0, doubleNewline);
                  buffer = buffer.slice(doubleNewline + 2);
                  const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
                  if (dataLine) {
                    const raw = JSON.parse(dataLine.slice(6)) as unknown;
                    const value = (schema ? schema.parse(raw) : raw) as Map[Tag]['events'];
                    return { value, done: false };
                  }
                  continue;
                }

                // Need more data
                const chunk = await r.read();
                if (chunk.done) {
                  done = true;
                  return { value: undefined as never, done: true };
                }
                buffer += decoder.decode(chunk.value, { stream: true });
              }
            },

            async return(): Promise<IteratorResult<Map[Tag]['events']>> {
              done = true;
              if (reader) {
                await reader.cancel();
              }
              return { value: undefined as never, done: true };
            },
          };
        },
      };
    },
  };
}
