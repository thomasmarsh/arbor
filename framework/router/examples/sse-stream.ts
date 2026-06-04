// Typed server-sent events: sseRoute declares the event schema; the handler
// returns AsyncIterable<E>; the client's subscribe() yields the same type.
import z from 'zod';
import { type SseFetchLike, createSseClient, createSseServer, defineRoutes, literal, object, sseRoute } from '../src/index.js';

const TickEvent = z.object({ tick: z.number(), ts: z.number() });
const TickSchema = object({ tag: literal('stream/ticks') });

const router = defineRoutes([
  sseRoute(TickSchema, 'stream/ticks', { events: TickEvent }),
]);

// ─── Server ───────────────────────────────────────────────────────────────────

async function* ticks(count: number): AsyncIterable<{ tick: number; ts: number }> {
  for (let i = 0; i < count; i++) {
    yield { tick: i, ts: Date.now() };
    await new Promise((r) => setTimeout(r, 10));
  }
}

const server = createSseServer(router, {
  'stream/ticks': () => ticks(5),
});

// ─── In-process transport (no real network needed) ────────────────────────────

const mockFetch: SseFetchLike = async (url, init) => {
  const res = await server.handleRequest(new Request(url, { method: init.method }));
  return { status: res.status, body: res.body as ReadableStream<Uint8Array> | null };
};

// ─── Client ───────────────────────────────────────────────────────────────────

const client = createSseClient('http://localhost', router, { fetch: mockFetch });

const parsed = router.parse(new URL('http://localhost/stream/ticks'));
if (!parsed.isOk()) throw new Error(parsed.error);

console.log('Streaming ticks:');
for await (const event of client.subscribe(parsed.value)) {
  // event is fully typed: { tick: number; ts: number }
  console.log(`  tick=${String(event.tick)}  ts=${String(event.ts)}`);
}
console.log('Stream complete.');
