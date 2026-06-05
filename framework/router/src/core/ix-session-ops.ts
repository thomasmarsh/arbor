/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Branch, Recv, Select, Send, Session } from './session.js';
import { IxSession, done, type ChoiceResult, type Done } from './ix-session.js';
import { syncValidate, type UserSchema } from './schema.js';

// ─── SessionAdapter ───────────────────────────────────────────────────────────
//
// Mirror of WsAdapter from ws-context.ts. Defined here so core/ stays
// import-free from contexts/. WsAdapter satisfies this interface structurally.

export interface SessionAdapter {
  onMessage(handler: (raw: string) => void): void;
  onClose(handler: () => void): void;
  send(data: string): void;
  close(code?: number): void;
}

// ─── IxSessionOps ─────────────────────────────────────────────────────────────

export interface IxSessionOps {
  recv<T>(schema: UserSchema<T>): IxSession<Recv<T, any>, any, T>;
  send<T>(v: T, schema: UserSchema<T>): IxSession<Send<T, any>, any, undefined>;
  branchTo<C extends Record<string, Session>, K extends keyof C & string>(
    k: K,
  ): IxSession<Branch<C>, C[K], undefined>;
  chooseFrom<C extends Record<string, Session>>(): IxSession<Select<C>, any, ChoiceResult<C>>;
  close(): Promise<Done>;
}

// ─── buildIxSessionOps ────────────────────────────────────────────────────────
//
// Creates an ops object bound to a single adapter. Call once per connection.
// Registers one onMessage handler that feeds a shared queue; all recv/chooseFrom
// calls on this ops object consume from that queue in order. Not safe for
// concurrent recv callers.

export function buildIxSessionOps(adapter: SessionAdapter): IxSessionOps {
  const queue: string[] = [];
  const waiters: ((raw: string) => void)[] = [];

  adapter.onMessage((raw) => {
    const waiter = waiters.shift();
    if (waiter !== undefined) {
      waiter(raw);
    } else {
      queue.push(raw);
    }
  });

  function dequeue(): Promise<string> {
    const msg = queue.shift();
    if (msg !== undefined) return Promise.resolve(msg);
    return new Promise<string>((resolve) => waiters.push(resolve));
  }

  return {
    recv<T>(schema: UserSchema<T>): IxSession<Recv<T, any>, any, T> {
      return new IxSession<Recv<T, any>, any, T>((k) =>
        dequeue().then((raw) => {
          const result = syncValidate(schema, JSON.parse(raw) as unknown);
          if ('issues' in result) {
            return Promise.reject(new Error(`recv: ${JSON.stringify(result.issues)}`));
          }
          return k(result.value);
        }),
      );
    },

    send<T>(v: T, schema: UserSchema<T>): IxSession<Send<T, any>, any, undefined> {
      return new IxSession<Send<T, any>, any, undefined>((k) => {
        const result = syncValidate(schema, v as unknown);
        if ('issues' in result) {
          return Promise.reject(new Error(`send: ${JSON.stringify(result.issues)}`));
        }
        adapter.send(JSON.stringify(result.value));
        return k(undefined);
      });
    },

    branchTo<C extends Record<string, Session>, K extends keyof C & string>(
      k: K,
    ): IxSession<Branch<C>, C[K], undefined> {
      return new IxSession<Branch<C>, C[K], undefined>((cont) => {
        adapter.send(JSON.stringify({ tag: k }));
        return cont(undefined);
      });
    },

    chooseFrom<C extends Record<string, Session>>(): IxSession<Select<C>, any, ChoiceResult<C>> {
      return new IxSession<Select<C>, any, ChoiceResult<C>>((k) =>
        dequeue().then((raw) => {
          const envelope = JSON.parse(raw) as { tag: keyof C & string };
          // Intentional double-cast: constructing the runtime form of the discriminated union.
          const choice = {
            tag: envelope.tag,
            pick: () => IxSession.of(undefined),
          } as unknown as ChoiceResult<C>;
          return k(choice);
        }),
      );
    },

    close(): Promise<Done> {
      adapter.close();
      return Promise.resolve(done);
    },
  };
}
