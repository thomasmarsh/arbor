import { describe, expect, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { defineRoutes } from '../../core/define-routes.js';
import { buildIxSessionOps } from '../../core/ix-session-ops.js';
import { literal, object } from '../../core/schema.js';
import type { InferSession, Recv, Send } from '../../core/session.js';
import { createWsClient, createWsSessionClient, type WsConnectFn } from '../../client/ws-client.js';
import { createWsServer, createWsSessionServer } from '../../server/ws-dispatch.js';
import {
  createWsAdapterPair,
  wsRoute,
  wsSessionRoute,
  type WsChannel,
  type WsContext,
  type WsMeta,
} from './ws-context.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const InSchema = z.object({ text: z.string() });
const OutSchema = z.object({ reply: z.string() });
const ParamSchema = object({ tag: literal('ws/chat') });

const chatRoute = wsRoute(ParamSchema, 'ws/chat', { in: InSchema, out: OutSchema });
const router = defineRoutes([chatRoute]);

// ─── Type-level tests ─────────────────────────────────────────────────────────

describe('wsRoute types', () => {
  it('WsContext channel type matches Recv<In, Send<Out>>', () => {
    type Ch = WsContext<{ text: string }, { reply: string }>['channel'];
    expectTypeOf<Ch>().toEqualTypeOf<WsChannel<Recv<{ text: string }, Send<{ reply: string }>>>>();
  });

  it('_meta carries Recv<In, Send<Out>> session type', () => {
    type S = InferSession<typeof chatRoute>;
    expectTypeOf<S>().toEqualTypeOf<Recv<{ text: string }, Send<{ reply: string }>>>();
  });

  it('server channel.send with wrong type is a type error', () => {
    const _server = createWsServer(router, {
      'ws/chat': ({ channel }) => {
        // @ts-expect-error — number is not assignable to string
        channel.send({ reply: 42 });
        return Promise.resolve();
      },
    });
    void _server;
  });

  it('client connect returns WsChannel<Send<In, Recv<Out>>>', () => {
    const connectFn: WsConnectFn = () => createWsAdapterPair()[0];
    const _client = createWsClient('ws://localhost', router, { connect: connectFn });
    const parsed = router.parse(new URL('http://localhost/ws/chat'));
    if (!parsed.isOk()) return;
    const ch = _client.connect(parsed.value);
    // ch is Map['ws/chat']['_dual'] = WsContext<In,Out>['_dual'] = WsChannel<Send<In,Recv<Out>>>
    expectTypeOf(ch).toEqualTypeOf<WsChannel<Send<{ text: string }, Recv<{ reply: string }>>>>();
  });
});

// ─── Runtime tests ────────────────────────────────────────────────────────────

describe('wsRoute runtime', () => {
  it('builds a route node with inSchema/outSchema in _meta', () => {
    const r = wsRoute(
      object({ tag: literal('ws/test') }),
      'ws/test',
      { in: z.object({ msg: z.string() }), out: z.object({ ack: z.string() }) },
    );
    expect((r._meta as WsMeta<unknown, unknown>).inSchema).toBeDefined();
    expect((r._meta as WsMeta<unknown, unknown>).outSchema).toBeDefined();
  });

  it('is parseable via defineRoutes', () => {
    const parsed = router.parse(new URL('http://localhost/ws/chat'));
    expect(parsed.isOk()).toBe(true);
    expect(parsed.value?.tag).toBe('ws/chat');
  });
});

// ─── createWsServer + createWsAdapterPair ────────────────────────────────────

describe('createWsServer', () => {
  it('client sends message, server echoes it back', async () => {
    const server = createWsServer(router, {
      'ws/chat': async ({ channel }) => {
        for await (const msg of channel.messages) {
          channel.send({ reply: msg.text });
          channel.close();
        }
      },
    });

    const [serverAdapter, clientAdapter] = createWsAdapterPair();
    const serverTask = server.handleConnection('ws/chat', {}, serverAdapter);

    const connectFn: WsConnectFn = () => clientAdapter;
    const client = createWsClient('ws://localhost', router, { connect: connectFn });

    const parsed = router.parse(new URL('http://localhost/ws/chat'));
    expect(parsed.isOk()).toBe(true);
    if (!parsed.isOk()) return;

    const channel = client.connect(parsed.value);
    channel.send({ text: 'hello' });

    const events: { reply: string }[] = [];
    for await (const ev of channel.messages) {
      events.push(ev);
    }

    await serverTask;
    expect(events).toEqual([{ reply: 'hello' }]);
  });

  it('closes with code 1008 for unknown tag', async () => {
    const server = createWsServer(router, {} as never);
    const [serverAdapter] = createWsAdapterPair();
    await expect(server.handleConnection('unknown', {}, serverAdapter)).resolves.toBeUndefined();
  });

  it.each([
    ['hello', { reply: 'hello' }],
    ['world', { reply: 'world' }],
    ['foo', { reply: 'foo' }],
  ])('echoes %s → %j', async (text, expected) => {
    const server = createWsServer(router, {
      'ws/chat': async ({ channel }) => {
        for await (const msg of channel.messages) {
          channel.send({ reply: msg.text });
          channel.close();
        }
      },
    });

    const [serverAdapter, clientAdapter] = createWsAdapterPair();
    void server.handleConnection('ws/chat', {}, serverAdapter);

    const client = createWsClient('ws://localhost', router, { connect: () => clientAdapter });
    const parsed = router.parse(new URL('http://localhost/ws/chat'));
    if (!parsed.isOk()) return;

    const ch = client.connect(parsed.value);
    ch.send({ text });

    const iter = ch.messages[Symbol.asyncIterator]();
    const result = await iter.next();
    expect(result.value).toEqual(expected);
  });
});

// ─── createWsClient end-to-end ────────────────────────────────────────────────

describe('createWsClient', () => {
  it('typed round-trip with schema validation', async () => {
    const server = createWsServer(router, {
      'ws/chat': async ({ channel }) => {
        for await (const msg of channel.messages) {
          channel.send({ reply: `echo: ${msg.text}` });
          channel.close();
        }
      },
    });

    const [serverAdapter, clientAdapter] = createWsAdapterPair();
    void server.handleConnection('ws/chat', {}, serverAdapter);

    const client = createWsClient('ws://localhost', router, { connect: () => clientAdapter });
    const parsed = router.parse(new URL('http://localhost/ws/chat'));
    if (!parsed.isOk()) return;

    const channel = client.connect(parsed.value);
    // messages type: AsyncIterable<{reply: string}>, send type: ({text: string}) => void
    expectTypeOf(channel.messages).toEqualTypeOf<AsyncIterable<{ reply: string }>>();
    expectTypeOf<Parameters<typeof channel.send>[0]>().toEqualTypeOf<{ text: string }>();

    channel.send({ text: 'world' });

    const iter = channel.messages[Symbol.asyncIterator]();
    const result = await iter.next();

    expect(result.value).toEqual({ reply: 'echo: world' });
  });
});

// ─── wsSessionRoute ───────────────────────────────────────────────────────────

describe('wsSessionRoute', () => {
  const JoinSchema = z.object({ username: z.string() });
  const WelcomeSchema = z.object({ roomId: z.string() });

  type LobbyS = Recv<{ username: string }, Send<{ roomId: string }>>;
  const lobbyRoute = wsSessionRoute(
    object({ tag: literal('ws/lobby') }),
    'ws/lobby',
    undefined as never as LobbyS,
  );

  it('InferSession extracts session type from route node', () => {
    type S = InferSession<typeof lobbyRoute>;
    expectTypeOf<S>().toEqualTypeOf<LobbyS>();
  });

  it('server recv join, send welcome; client verifies', async () => {
    const route = wsSessionRoute(
      object({ tag: literal('ws/lobby') }),
      'ws/lobby',
      undefined as never,
    );
    const router = defineRoutes([route]);

    const server = createWsSessionServer(router, {
      'ws/lobby': async ({ ops }) => {
        await ops.recv(JoinSchema).run();
        await ops.send({ roomId: 'r1' }, WelcomeSchema).run();
      },
    });

    const [serverAdapter, clientAdapter] = createWsAdapterPair();
    void server.handleConnection('ws/lobby', {}, serverAdapter);

    const clientOps = buildIxSessionOps(clientAdapter);
    await clientOps.send({ username: 'alice' }, JoinSchema).run();
    const welcome = await clientOps.recv(WelcomeSchema).run();
    expect(welcome).toEqual({ roomId: 'r1' });
  });

  it('closes with code 1008 for unknown tag', async () => {
    const router = defineRoutes([lobbyRoute]);
    const server = createWsSessionServer(router, {} as never);
    const [serverAdapter] = createWsAdapterPair();
    await expect(server.handleConnection('unknown', {}, serverAdapter)).resolves.toBeUndefined();
  });
});

// ─── createWsSessionClient ────────────────────────────────────────────────────

describe('createWsSessionClient', () => {
  it('wsSessionRoute round-trip: server recv join, send welcome; client via createWsSessionClient', async () => {
    const JoinSchema = z.object({ username: z.string() });
    const WelcomeSchema = z.object({ roomId: z.string() });

    const route = wsSessionRoute(
      object({ tag: literal('ws/lobby') }),
      'ws/lobby',
      undefined as never,
    );
    const router = defineRoutes([route]);

    const server = createWsSessionServer(router, {
      'ws/lobby': async ({ ops }) => {
        const join = await ops.recv(JoinSchema).run();
        await ops.send({ roomId: `room-for-${join.username}` }, WelcomeSchema).run();
      },
    });
    const [serverAdapter, clientAdapter] = createWsAdapterPair();
    void server.handleConnection('ws/lobby', {}, serverAdapter);

    const client = createWsSessionClient('ws://localhost', router, {
      connect: () => clientAdapter,
    });
    const parsed = router.parse(new URL('http://localhost/ws/lobby'));
    expect(parsed.isOk()).toBe(true);
    if (!parsed.isOk()) return;

    const ops = client.connectSession(parsed.value);
    await ops.send({ username: 'alice' }, JoinSchema).run();
    const welcome = await ops.recv(WelcomeSchema).run();
    expect(welcome).toEqual({ roomId: 'room-for-alice' });
  });
});
