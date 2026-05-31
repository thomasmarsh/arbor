import { describe, expect, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { defineRoutes } from '../../core/define-routes.js';
import type { InferSession, Send } from '../../core/session.js';
import { createSseClient, type SseFetchLike } from '../../client/sse-client.js';
import { createSseServer } from '../../server/sse-dispatch.js';
import { sseRoute, type SseContext, type SseMeta } from './sse-context.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const EventSchema = z.object({ count: z.number() });
const ParamSchema = z.object({ tag: z.literal('stream/counter') });

const counterRoute = sseRoute(ParamSchema, 'stream/counter', { events: EventSchema });
const router = defineRoutes([counterRoute]);

// ─── Type-level tests ─────────────────────────────────────────────────────────

describe('sseRoute types', () => {
  it('_meta carries the event type', () => {
    type EventType = typeof counterRoute extends { _meta?: infer M }
      ? M extends SseMeta<infer E>
        ? E
        : never
      : never;
    expectTypeOf<EventType>().toEqualTypeOf<{ count: number }>();
  });

  it('SseContext events field is the event type', () => {
    expectTypeOf<SseContext<{ count: number }>['events']>().toEqualTypeOf<{ count: number }>();
  });

  it('_meta carries Send<E> session type for plan-90/91 tooling', () => {
    type S = InferSession<typeof counterRoute>;
    expectTypeOf<S>().toEqualTypeOf<Send<{ count: number }>>();
  });

  it('handler returning wrong event type is a type error', () => {
    const _server = createSseServer(router, {
      // @ts-expect-error — number is not assignable to { count: number }
      'stream/counter': async function* () { yield 42; await Promise.resolve(); },
    });
    void _server;
  });

  it('subscribe return type is the event type', () => {
    const _client = createSseClient('http://localhost', router);
    type ClientEvents = typeof _client extends { subscribe(r: infer _R): AsyncIterable<infer E> } ? E : never;
    expectTypeOf<ClientEvents>().toEqualTypeOf<{ count: number }>();
  });
});

// ─── Runtime tests ────────────────────────────────────────────────────────────

describe('sseRoute runtime', () => {
  it('builds a route node with eventSchema in _meta', () => {
    const r = sseRoute(
      z.object({ tag: z.literal('test') }),
      'test',
      { events: z.object({ msg: z.string() }) },
    );
    expect((r._meta as SseMeta<unknown>).eventSchema).toBeDefined();
  });

  it('is parseable via defineRoutes', () => {
    const parsed = router.parse(new URL('http://localhost/stream/counter'));
    expect(parsed.isOk()).toBe(true);
    expect(parsed.value?.tag).toBe('stream/counter');
  });
});

// ─── Server helpers ───────────────────────────────────────────────────────────

async function* counter(n: number): AsyncIterable<{ count: number }> {
  for (let i = 0; i < n; i++) {
    yield { count: i };
    await Promise.resolve();
  }
}

describe('createSseServer', () => {
  it('streams events as text/event-stream', async () => {
    const server = createSseServer(router, { 'stream/counter': () => counter(3) });
    const res = await server.handleRequest(new Request('http://localhost/stream/counter'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');

    const text = await res.text();
    const frames = text.trim().split('\n\n').filter(Boolean);
    expect(frames).toHaveLength(3);
    expect(JSON.parse(frames.at(0)?.replace('data: ', '') ?? '{}')).toEqual({ count: 0 });
    expect(JSON.parse(frames.at(1)?.replace('data: ', '') ?? '{}')).toEqual({ count: 1 });
    expect(JSON.parse(frames.at(2)?.replace('data: ', '') ?? '{}')).toEqual({ count: 2 });
  });

  it('returns 404 for unmatched path', async () => {
    const server = createSseServer(router, { 'stream/counter': () => counter(0) });
    const res = await server.handleRequest(new Request('http://localhost/unknown'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when no handler registered for tag', async () => {
    const server = createSseServer(router, {} as never);
    const res = await server.handleRequest(new Request('http://localhost/stream/counter'));
    expect(res.status).toBe(404);
  });
});

// ─── Client + server end-to-end ───────────────────────────────────────────────

describe('createSseClient', () => {
  it('subscribe yields typed events', async () => {
    const server = createSseServer(router, { 'stream/counter': () => counter(3) });

    const mockFetch: SseFetchLike = async (url, init) => {
      const res = await server.handleRequest(new Request(url, { method: init.method }));
      return { status: res.status, body: res.body as ReadableStream<Uint8Array> | null };
    };

    const client = createSseClient('http://localhost', router, { fetch: mockFetch });

    const parsed = router.parse(new URL('http://localhost/stream/counter'));
    expect(parsed.isOk()).toBe(true);
    if (!parsed.isOk()) return;

    const events: { count: number }[] = [];
    for await (const ev of client.subscribe(parsed.value)) {
      events.push(ev);
    }

    expect(events).toEqual([{ count: 0 }, { count: 1 }, { count: 2 }]);
    expectTypeOf(events.at(0)).toEqualTypeOf<{ count: number } | undefined>();
  });
});
