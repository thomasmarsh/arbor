/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Session } from './session.js';

// ─── Done token ───────────────────────────────────────────────────────────────
//
// Unique symbol — the only inhabitant of Done is `done`. External callers
// cannot construct Done values without `as any`, making it an unforgeable
// proof of protocol completion.

const _done = Symbol('Done');
export type Done = typeof _done;
export const done: Done = _done;

// ─── IxSession<Before, After, A> ─────────────────────────────────────────────
//
// An indexed monad over session state. Represents a protocol computation that
// transitions from state Before to state After and yields value A.
//
// Before/After are phantom type parameters — never used at runtime.
// Implementation: CPS. _run takes a continuation and calls it with A.

export class IxSession<_Before, _After, A> {
  constructor(private readonly _run: <R>(k: (a: A) => Promise<R>) => Promise<R>) {}

  // Sequence this step with the next. TypeScript enforces that the output state
  // of this step (_After) matches the input state of f's result.
  then<NewAfter, B>(
    f: (a: A) => IxSession<_After, NewAfter, B>,
  ): IxSession<_Before, NewAfter, B> {
    return new IxSession((k) => this._run((a) => f(a)._run(k)));
  }

  run(): Promise<A> {
    return this._run((a) => Promise.resolve(a));
  }

  // Lift a plain value with no state change.
  static of<S, A>(a: A): IxSession<S, S, A> {
    return new IxSession((k) => k(a));
  }
}

// ─── ChoiceResult<C> ─────────────────────────────────────────────────────────
//
// Discriminated union for branch/select handling. Narrowing `choice.tag`
// also narrows `pick()`'s return type to the correct IxSession for that branch.

// Record<keyof C, Session> (not Record<string, Session>) so callers can pass
// plain object types without an index signature.
export type ChoiceResult<C extends Record<keyof C, Session>> = {
  [K in keyof C]: { readonly tag: K; pick(): IxSession<C[K], any, any> };
}[keyof C];
