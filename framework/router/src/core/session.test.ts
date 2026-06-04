import { describe, expectTypeOf, it } from 'vitest';
import { object, string } from './schema.js';
import type {
  Branch,
  Channel,
  Dual,
  End,
  InferDual,
  InferSession,
  Recv,
  Select,
  Send,
  Session,
  SessionMeta,
} from './session.js';
import { sessionRoute } from './session-route.js';

// ─── Dual correctness ────────────────────────────────────────────────────────

describe('Dual', () => {
  it('Send → Recv', () => {
    expectTypeOf<Dual<Send<string>>>().toEqualTypeOf<Recv<string>>();
  });

  it('Recv → Send', () => {
    expectTypeOf<Dual<Recv<number>>>().toEqualTypeOf<Send<number>>();
  });

  it('depth-3 chain', () => {
    type Server = Send<string, Recv<number, Send<boolean>>>;
    type Client = Dual<Server>;
    expectTypeOf<Client>().toEqualTypeOf<Recv<string, Send<number, Recv<boolean>>>>();
  });

  it('depth-5 chain', () => {
    type Server = Send<1, Recv<2, Send<3, Recv<4, Send<5>>>>>;
    type Client = Dual<Server>;
    expectTypeOf<Client>().toEqualTypeOf<Recv<1, Send<2, Recv<3, Send<4, Recv<5>>>>>>();
  });

  it('Branch ↔ Select', () => {
    type Server = Branch<{ ok: Send<string>; err: Send<Error> }>;
    type Client = Dual<Server>;
    expectTypeOf<Client>().toEqualTypeOf<Select<{ ok: Recv<string>; err: Recv<Error> }>>();
  });

  it('is its own inverse', () => {
    type S = Send<string, Recv<number, Send<boolean>>>;
    expectTypeOf<Dual<Dual<S>>>().toEqualTypeOf<S>();
  });
});

// ─── Channel typing ───────────────────────────────────────────────────────────

describe('Channel', () => {
  it('Send channel exposes send()', () => {
    type Ch = Channel<Send<string>>;
    expectTypeOf<Ch>().toHaveProperty('send');
    type SendFn = Ch extends { send: infer F } ? F : never;
    expectTypeOf<SendFn>().toEqualTypeOf<(v: string) => Channel<End>>();
  });

  it('Send channel has no recv()', () => {
    type Ch = Channel<Send<string>>;
    // @ts-expect-error — Send channel must not expose recv
    type _NoRecv = Ch['recv'];
  });

  it('Recv channel exposes recv()', () => {
    type Ch = Channel<Recv<number>>;
    expectTypeOf<Ch>().toHaveProperty('recv');
    type RecvFn = Ch extends { recv: infer F } ? F : never;
    expectTypeOf<RecvFn>().toEqualTypeOf<() => Promise<readonly [number, Channel<End>]>>();
  });

  it('Recv channel has no send()', () => {
    type Ch = Channel<Recv<number>>;
    // @ts-expect-error — Recv channel must not expose send
    type _NoSend = Ch['send'];
  });

  it('End channel exposes close()', () => {
    type Ch = Channel<End>;
    expectTypeOf<Ch>().toHaveProperty('close');
  });

  it('Branch channel exposes branch()', () => {
    type Ch = Channel<Branch<{ ok: Send<string>; fail: End }>>;
    expectTypeOf<Ch>().toHaveProperty('branch');
  });
});

// ─── SessionMeta ─────────────────────────────────────────────────────────────

describe('SessionMeta', () => {
  it('carries session type as optional phantom key', () => {
    type Meta = SessionMeta<Send<string>>;
    type Key = Meta extends { __session?: infer S } ? S : never;
    expectTypeOf<Key>().toEqualTypeOf<Send<string>>();
  });

  it('does not collide when intersected with plain record', () => {
    type Meta = SessionMeta<End> & { method: string };
    expectTypeOf<Meta>().toHaveProperty('method');
    expectTypeOf<Meta>().toHaveProperty('__session');
  });
});

// ─── sessionRoute ─────────────────────────────────────────────────────────────

describe('sessionRoute', () => {
  const schema = object({ id: string() });
  const _node = sessionRoute(schema, '/ws/:id', {} as Send<string, Recv<string>>);

  it('_meta carries SessionMeta with the declared S', () => {
    type Meta = NonNullable<typeof _node['_meta']>;
    type S = Meta extends SessionMeta<infer SS> ? SS : never;
    expectTypeOf<S>().toEqualTypeOf<Send<string, Recv<string>>>();
  });

  it('InferSession extracts S from the node', () => {
    expectTypeOf<InferSession<typeof _node>>().toEqualTypeOf<Send<string, Recv<string>>>();
  });

  it('InferDual extracts Dual<S> from the node', () => {
    type Expected = Dual<Send<string, Recv<string>>>;
    expectTypeOf<InferDual<typeof _node>>().toEqualTypeOf<Expected>();
  });

  it('route shape is inferred from schema', () => {
    type R = typeof _node['_type'];
    expectTypeOf<R>().toEqualTypeOf<{ id: string }>();
  });

  it('has no children', () => {
    expectTypeOf<typeof _node['children']>().toEqualTypeOf<[]>();
  });

  it('accepts any Session value', () => {
    const s: Session = {} as Send<number>;
    sessionRoute(schema, '/test', s);
  });
});
