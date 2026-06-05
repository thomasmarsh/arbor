import { withLogging } from '@arbor/common';
import { useStore } from '@arbor/common/react';
import { liveCounterEnv } from './counter.env';
import { counterReducer, initialState, type CounterAction } from './counter.store';

export function Counter() {
  console.log('Counter rendering');
  // Exp A: onMount replaces useEffect(() => { send({ tag: 'fetch' }); }, []).
  const [$, send] = useStore(withLogging('counter', counterReducer), liveCounterEnv, initialState, { tag: 'fetch' });
  console.log('Counter state', $.state);

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
