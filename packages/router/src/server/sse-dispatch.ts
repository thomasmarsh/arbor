/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Result } from '@arbor/common';
import type { RouteNode } from '../core/route-node.js';
import { walkCollect } from '../core/walk.js';
import { type SseContext, type SseWalkNode, getSseMeta } from '../contexts/sse-context.js';

// ─── Handler types ────────────────────────────────────────────────────────────

export interface SseHandlerCtx<Routes, Tag extends string> {
  params: Omit<Extract<Routes, { tag: Tag }>, 'tag' | 'child' | 'query'>;
}

export type SseHandlerMap<
  Map extends Record<string, SseContext<any>>,
  Routes,
> = {
  [Tag in keyof Map & string]: (
    ctx: SseHandlerCtx<Routes, Tag>,
  ) => AsyncIterable<Map[Tag]['events']> | Promise<AsyncIterable<Map[Tag]['events']>>;
};

// ─── SSE router contract ──────────────────────────────────────────────────────

export interface SseRouterContract<
  Route extends { tag: string },
  Map extends Record<string, SseContext<any>>,
> {
  _type: Route;
  _ctxMap: Map;
  children: RouteNode<unknown, any, any, any, any>[];
  parse(url: URL): Result<Route, string>;
  print(route: Route): string;
}

// ─── Wire format ──────────────────────────────────────────────────────────────

function serializeEvent(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

// ─── Server factory ───────────────────────────────────────────────────────────

export function createSseServer<
  Route extends { tag: string },
  Map extends Record<string, SseContext<any>>,
>(
  router: SseRouterContract<Route, Map>,
  handlers: SseHandlerMap<Map, Route>,
): { handleRequest(req: Request): Promise<Response> } {
  const eventSchemaMap = walkCollect(
    router.children as SseWalkNode[],
    (n) => getSseMeta(n)?.eventSchema,
  );

  return {
    handleRequest(req: Request): Promise<Response> {
      const url = new URL(req.url);
      const parsed = router.parse(url);

      if (!parsed.isOk()) {
        return Promise.resolve(new Response(JSON.stringify({ error: parsed.error }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }));
      }

      const route = parsed.value;
      const { tag } = route as { tag: string };

      const handler = (handlers as Record<string, (ctx: unknown) => unknown>)[tag];
      if (!handler) {
        return Promise.resolve(new Response(JSON.stringify({ error: `no handler for tag: ${tag}` }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }));
      }

      const schema = eventSchemaMap[tag];
      const params = Object.fromEntries(
        Object.entries(route as Record<string, unknown>).filter(
          ([k]) => k !== 'tag' && k !== 'child' && k !== 'query',
        ),
      );

      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          try {
            const iterable = await Promise.resolve(handler({ params })) as AsyncIterable<unknown>;
            for await (const event of iterable) {
              const validated = schema ? schema.parse(event) : event;
              controller.enqueue(encoder.encode(serializeEvent(validated)));
            }
          } catch {
            // Stream ends on error; client sees connection close
          } finally {
            controller.close();
          }
        },
      });

      return Promise.resolve(new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      }));
    },
  };
}
