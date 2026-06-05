import { afterEach, expect } from 'vitest';
import { proxy, snapshot } from 'valtio';
import type { Reducer } from './store.js';

export class TestStore<S, A, R> {
  private proxyState: { state: S };
  private reducer: Reducer<S, A, R>;
  private environment: R;
  private pending: A[] = [];

  constructor(reducer: Reducer<S, A, R>, environment: R, initialState: S) {
    // structuredClone so mutations inside the store never write back to the caller's fixture.
    this.proxyState = proxy({ state: structuredClone(initialState) });
    this.reducer = reducer;
    this.environment = environment;
  }

  private step(action: A, assert: ((draft: S) => void) | undefined): void {
    // Freeze a copy of state before the action so we can diff after.
    const before = snapshot(this.proxyState).state as S;

    const effect = this.reducer(this.proxyState, action, this.environment);
    effect?.unsafeRunSync((a) => this.pending.push(a));

    // Build the expected state: start from before, apply the caller's mutations.
    // structuredClone is intentional here — snapshot is deeply frozen so we need
    // a mutable copy for the assertion closure to write into.
    const expected = structuredClone(before);
    assert?.(expected);

    expect(snapshot(this.proxyState).state).toEqual(expected);
  }

  send(action: A, assert?: (draft: S) => void): this {
    this.step(action, assert);
    return this;
  }

  receive(expected: A, assert?: (draft: S) => void): this {
    if (this.pending.length === 0) {
      throw new Error(
        `Expected to receive ${JSON.stringify(expected)}, but no effects have been dispatched`,
      );
    }
    const actual = this.pending.shift() as A;
    expect(actual).toEqual(expected);
    this.step(actual, assert);
    return this;
  }

  assertDrained(): void {
    if (this.pending.length > 0) {
      throw new Error(
        `TestStore has ${String(this.pending.length)} unhandled action(s) at end of test: ${JSON.stringify(this.pending)}`,
      );
    }
  }
}

/**
 * Creates a TestStore and registers an afterEach that fails the test if any
 * effect-dispatched actions were not consumed via .receive().
 */
export function createTestStore<S, A, R>(
  reducer: Reducer<S, A, R>,
  environment: R,
  initialState: S,
): TestStore<S, A, R> {
  const store = new TestStore(reducer, environment, initialState);
  afterEach(() => { store.assertDrained(); });
  return store;
}
