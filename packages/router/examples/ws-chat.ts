// Typed bidirectional WebSocket: wsRoute declares in/out schemas; the server
// handler receives a WsChannel typed from the server perspective; the client's
// connect() returns the dual — send/receive types automatically swapped.
import z from 'zod';
import {
  createWsAdapterPair,
  createWsClient,
  createWsServer,
  defineRoutes,
  wsRoute,
} from '../src/index.js';

const InSchema = z.object({ text: z.string() });
const OutSchema = z.object({ reply: z.string() });
const ChatSchema = z.object({ tag: z.literal('ws/chat') });

const router = defineRoutes([
  wsRoute(ChatSchema, 'ws/chat', { in: InSchema, out: OutSchema }),
]);

// ─── Server ───────────────────────────────────────────────────────────────────

const server = createWsServer(router, {
  'ws/chat': async ({ channel }) => {
    // channel.messages: AsyncIterable<{ text: string }>
    // channel.send:     (v: { reply: string }) => void
    for await (const msg of channel.messages) {
      console.log(`  server received: "${msg.text}"`);
      channel.send({ reply: `echo: ${msg.text}` });
    }
  },
});

// ─── In-process transport (no network needed) ─────────────────────────────────

const [serverAdapter, clientAdapter] = createWsAdapterPair();
void server.handleConnection('ws/chat', {}, serverAdapter);

// ─── Client ───────────────────────────────────────────────────────────────────

const client = createWsClient('ws://localhost', router, { connect: () => clientAdapter });

const parsed = router.parse(new URL('http://localhost/ws/chat'));
if (!parsed.isOk()) throw new Error(parsed.error);

const channel = client.connect(parsed.value);
// channel.send:     (v: { text: string }) => void
// channel.messages: AsyncIterable<{ reply: string }>

const messages = ['hello', 'world', 'goodbye'];
console.log('WebSocket chat (in-process):');

for (const text of messages) {
  channel.send({ text });
}

let received = 0;
for await (const ev of channel.messages) {
  // ev is fully typed: { reply: string }
  console.log(`  client received: "${ev.reply}"`);
  received++;
  if (received >= messages.length) {
    channel.close();
    break;
  }
}

console.log('WebSocket exchange complete.');
