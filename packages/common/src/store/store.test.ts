import { describe, expect, it } from 'vitest';
import { Effect } from './effect.js';
import { Store, type Reducer } from './store.js';

interface State {
  count: number;
}

type Action = 'increment' | 'decrement';

interface Environment {
  log: (msg: string) => Effect<never>;
}

const mockEnvironment: Environment = {
  log: () =>
    new Effect(() => {
      /* empty */
    }),
};

const liveEnvironment: Environment = {
  log: (msg) =>
    new Effect(() => {
      console.log(msg);
    }),
};

const counterReducer: Reducer<State, Action, Environment> = ($, action, env) => {
  switch (action) {
    case 'decrement': {
      $.state.count -= 1;
      return env.log('decremented');
    }
    case 'increment': {
      $.state.count += 1;
      return env.log('incremented');
    }
  }
};

describe('Store', () => {
  it('should say hello', () => {
    const store = new Store(counterReducer, liveEnvironment, { count: 0 });
    store.send('increment');
  });

  it('should mock', () => {
    const store = new Store(counterReducer, mockEnvironment, { count: 0 });
    store.send('increment');
  });

  it('should update state', () => {
    const store = new Store(counterReducer, mockEnvironment, { count: 0 });
    expect(store.getProxyState().state.count).toBe(0);
    store.send('increment');
    expect(store.getProxyState().state.count).toBe(1);
  });
});
