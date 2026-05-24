import { proxy, snapshot, type Snapshot } from 'valtio';
import type { Effect } from './effect.js';

interface Draft<S> {
  state: S;
}

export type Reducer<S, A, R> = (state: Draft<S>, action: A, environment: R) => Effect<A>;

export class Store<S, A, R> {
  private proxyState: Draft<S>;
  private queue: A[] = [];
  private reducer: Reducer<S, A, R>;
  private environment: R;
  private isSending = false;

  constructor(reducer: Reducer<S, A, R>, environment: R, initialState: S) {
    this.proxyState = proxy({ state: initialState });
    this.reducer = reducer;
    this.environment = environment;
  }

  public getSnapshot(): Snapshot<S> {
    return snapshot(this.proxyState).state;
  }

  private drain() {
    while (this.queue.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const action = this.queue.shift()!;
      const effect = this.reducer(this.proxyState, action, this.environment);
      effect.unsafeRun(this.send);
    }
  }

  // Arrow function for safely binding this
  public send = (initialAction: A) => {
    this.queue.push(initialAction);

    if (this.isSending) {
      return;
    }
    this.isSending = true;

    try {
      this.drain();
    } finally {
      this.isSending = false;
    }
  };
}
