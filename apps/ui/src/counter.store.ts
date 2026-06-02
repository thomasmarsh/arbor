import { Effect, type Reducer, type Result } from '@arbor/common';
import type { HelloResponse } from '@arbor/app-common';
import type { CounterEnv } from './counter.env';

export interface CounterState {
  amount: number;
  count: number;
  ticking: boolean;
  loadState: { tag: 'loading' } | { tag: 'loaded'; value: Result<HelloResponse, string> };
}

export type CounterAction =
  | { tag: 'increment' }
  | { tag: 'decrement' }
  | { tag: 'tick' }
  | { tag: 'fetch' }
  | { tag: 'loaded'; result: Result<HelloResponse, string> };

export const initialState: CounterState = {
  amount: 1,
  count: 0,
  ticking: false,
  loadState: { tag: 'loading' },
};

export const counterReducer: Reducer<CounterState, CounterAction, CounterEnv> = (
  $,
  action,
  env,
) => {
  switch (action.tag) {
    case 'decrement': {
      $.state.amount -= 1;
      return null;
    }
    case 'increment': {
      $.state.amount += 1;
      return null;
    }
    case 'tick': {
      $.state.count += $.state.amount;
      return env.sleep.map(() => ({
        tag: 'tick',
      }));
    }
    case 'fetch': {
      if ($.state.ticking) {
        return null;
      }
      $.state.ticking = true;
      return Effect.merge<CounterAction>(
        env.fetchHello.map((result) => ({ tag: 'loaded', result })),
        Effect.sleep(1000).map(() => ({
          tag: 'tick',
        })),
      );
    }
    case 'loaded': {
      $.state.loadState = { tag: 'loaded', value: action.result };
      return null;
    }
  }
};
