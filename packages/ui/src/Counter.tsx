import { withLogging } from '@arbo/common';
import { useStore } from '@arbo/common/react';
import { useEffect } from 'react';
import { liveCounterEnv } from './counter.env';
import { counterReducer, initialState, type CounterAction } from './counter.store';

export function Counter() {
  console.log('Counter rendering');
  const [$, send] = useStore(withLogging('counter', counterReducer), liveCounterEnv, initialState);
  console.log('Counter state', $.state);

  useEffect(() => {
    send({ tag: 'fetch' });
  }, []);

  // Avoid some boilerplate in the JSX
  const wrap = (action: CounterAction): (() => void) => {
    return () => {
      send(action);
    };
  };

  const actions = {
    decrement: wrap({ tag: 'decrement' }),
    increment: wrap({ tag: 'increment' }),
  };

  return (
    <div>
      <button onClick={actions.decrement}>-</button>
      {$.state.count}
      <button onClick={actions.increment}>+</button>
      (amount: {$.state.amount}){$.state.loadState.tag === 'loading' && <p> Loading...</p>}
      {$.state.loadState.tag === 'loaded' &&
        $.state.loadState.value.fold(
          (hello) => (
            <p>
              {hello.message} - {hello.timestamp}
            </p>
          ),
          (err) => <p style={{ color: 'red' }}>Error: {err}</p>,
        )}
    </div>
  );
}
