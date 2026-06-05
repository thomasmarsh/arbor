// Session-typed WebSocket: wsSessionRoute declares a structured send/recv
// protocol; the server handler uses ops.recv()/ops.send() in order; the client
// mirrors with createWsSessionClient and drives the same sequence in reverse.
import z from 'zod';
import {
  createWsAdapterPair,
  createWsSessionClient,
  createWsSessionServer,
  defineRoutes,
  literal,
  object,
  wsSessionRoute,
} from '../src/index.js';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const JoinSchema = z.object({ username: z.string() });
const WelcomeSchema = z.object({ roomId: z.string(), memberCount: z.number() });

// ─── Route ────────────────────────────────────────────────────────────────────

// `undefined as never` defers the session type to the handler — type is
// inferred from the schemas passed to ops.recv()/ops.send() at each call site.
const lobbyRoute = wsSessionRoute(
  object({ tag: literal('ws/lobby') }),
  'ws/lobby',
  undefined as never,
);

const router = defineRoutes([lobbyRoute]);

// ─── Server ───────────────────────────────────────────────────────────────────

const server = createWsSessionServer(router, {
  'ws/lobby': async ({ ops }) => {
    // Protocol: receive join → send welcome
    const join = await ops.recv(JoinSchema).run();
    console.log(`  server: "${join.username}" joined`);
    await ops.send({ roomId: `room-${join.username}`, memberCount: 1 }, WelcomeSchema).run();
  },
});

// ─── In-process transport (no network needed) ─────────────────────────────────

const [serverAdapter, clientAdapter] = createWsAdapterPair();
void server.handleConnection('ws/lobby', {}, serverAdapter);

// ─── Client ───────────────────────────────────────────────────────────────────

const client = createWsSessionClient('ws://localhost', router, {
  connect: () => clientAdapter,
});

const parsed = router.parse(new URL('http://localhost/ws/lobby'));
if (!parsed.isOk()) throw new Error(parsed.error);

const ops = client.connectSession(parsed.value);

console.log('WebSocket session (in-process):');

// Client drives the dual of the server protocol: send join → receive welcome
await ops.send({ username: 'alice' }, JoinSchema).run();
const welcome = await ops.recv(WelcomeSchema).run();
console.log(`  client: welcome to "${welcome.roomId}" (${welcome.memberCount} member)`);

console.log('Session complete.');
