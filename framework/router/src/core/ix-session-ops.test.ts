/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Branch, End, Recv, Select, Send, Session } from './session.js';
import { IxSession, done, type ChoiceResult, type Done } from './ix-session.js';
import {
  buildIxSessionOps,
  type IxSessionOps,
  type SessionAdapter,
} from './ix-session-ops.js';
import type { UserSchema } from './schema.js';

// ─── Test adapter pair ────────────────────────────────────────────────────────

function createTestAdapterPair(): [SessionAdapter, SessionAdapter] {
  const msgA: ((raw: string) => void)[] = [];
  const msgB: ((raw: string) => void)[] = [];
  const closeA: (() => void)[] = [];
  const closeB: (() => void)[] = [];
  const adapterA: SessionAdapter = {
    onMessage(h) { msgA.push(h); },
    onClose(h: () => void) { closeA.push(h); },
    send(data) { for (const h of msgB) h(data); },
    close() { for (const h of closeB) h(); },
  };
  const adapterB: SessionAdapter = {
    onMessage(h) { msgB.push(h); },
    onClose(h: () => void) { closeB.push(h); },
    send(data) { for (const h of msgA) h(data); },
    close() { for (const h of closeA) h(); },
  };
  return [adapterA, adapterB];
}

// ─── Inline schemas ───────────────────────────────────────────────────────────

function stringSchema(): UserSchema<string> {
  return {
    '~standard': {
      validate: (v) =>
        typeof v === 'string' ? { value: v } : { issues: [{ message: 'expected string' }] },
    },
  };
}

function numSchema(): UserSchema<number> {
  return {
    '~standard': {
      validate: (v) =>
        typeof v === 'number' ? { value: v } : { issues: [{ message: 'expected number' }] },
    },
  };
}

// ─── Type-level tests ─────────────────────────────────────────────────────────

describe('IxSessionOps — types', () => {
  it('recv: return type is IxSession<Recv<T, any>, any, T>', () => {
    type Check = IxSessionOps['recv'] extends
      <T>(schema: UserSchema<T>) => IxSession<Recv<T, any>, any, T>
      ? true : false;
    expectTypeOf<Check>().toEqualTypeOf<true>();
  });

  it('send: return type is IxSession<Send<T, any>, any, undefined>', () => {
    type Check = IxSessionOps['send'] extends
      <T>(v: T, schema: UserSchema<T>) => IxSession<Send<T, any>, any, undefined>
      ? true : false;
    expectTypeOf<Check>().toEqualTypeOf<true>();
  });

  it('branchTo: transitions Branch<C> → C[K] and yields undefined', () => {
    type Check = IxSessionOps['branchTo'] extends
      <C extends Record<string, Session>, K extends keyof C & string>(
        k: K
      ) => IxSession<Branch<C>, C[K], undefined>
      ? true : false;
    expectTypeOf<Check>().toEqualTypeOf<true>();
  });

  it('chooseFrom: return type is IxSession<Select<C>, any, ChoiceResult<C>>', () => {
    type Check = IxSessionOps['chooseFrom'] extends
      <C extends Record<string, Session>>() => IxSession<Select<C>, any, ChoiceResult<C>>
      ? true : false;
    expectTypeOf<Check>().toEqualTypeOf<true>();
  });

  it('close: return type is Promise<Done>', () => {
    type Check = IxSessionOps['close'] extends () => Promise<Done> ? true : false;
    expectTypeOf<Check>().toEqualTypeOf<true>();
  });
});

// ─── Runtime tests ────────────────────────────────────────────────────────────

describe('IxSessionOps — runtime', () => {
  it('recv + send roundtrip', async () => {
    const [adapterA, adapterB] = createTestAdapterPair();
    const opsA = buildIxSessionOps(adapterA);
    const opsB = buildIxSessionOps(adapterB);

    const recvPending = opsA.recv(stringSchema()).run();
    await opsB.send('hello', stringSchema()).run();
    expect(await recvPending).toBe('hello');
  });

  it('recv rejects when schema validation fails', async () => {
    const [adapterA, adapterB] = createTestAdapterPair();
    const opsA = buildIxSessionOps(adapterA);
    const opsB = buildIxSessionOps(adapterB);

    const recvPending = opsA.recv(numSchema()).run();
    await opsB.send('not-a-number', stringSchema()).run();
    await expect(recvPending).rejects.toThrow();
  });

  it('branchTo + chooseFrom roundtrip', async () => {
    const [adapterA, adapterB] = createTestAdapterPair();
    const opsA = buildIxSessionOps(adapterA);
    const opsB = buildIxSessionOps(adapterB);

    interface Cases extends Record<string, Session> { go: End; stop: End }
    await opsA.branchTo<Cases, 'go'>('go').run();
    const choice = await opsB.chooseFrom<Cases>().run();
    expect(choice.tag).toBe('go');
  });

  it('chooseFrom pick() returns an IxSession', async () => {
    const [adapterA, adapterB] = createTestAdapterPair();
    const opsA = buildIxSessionOps(adapterA);
    const opsB = buildIxSessionOps(adapterB);

    interface Cases extends Record<string, Session> { yes: End; no: End }
    await opsA.branchTo<Cases, 'yes'>('yes').run();
    const choice = await opsB.chooseFrom<Cases>().run();
    expect(choice.pick()).toBeInstanceOf(IxSession);
  });

  it('close() resolves to Done sentinel', async () => {
    const [adapterA] = createTestAdapterPair();
    const ops = buildIxSessionOps(adapterA);
    expect(await ops.close()).toBe(done);
  });
});
