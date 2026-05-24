import { useStore } from '@arbo/common/react';
import { useEffect } from 'react';
import { liveCounterEnv } from './counter.env';
import { counterReducer, initialState } from './counter.store';

export function Counter() {
  const [$, send] = useStore(counterReducer, liveCounterEnv, initialState);

  useEffect(() => {
    send({ tag: 'fetch' });
  }, []);

  return (
    <div>
      <button
        onClick={() => {
          send({ tag: 'decrement' });
        }}
      >
        -
      </button>
      {$.state.count}
      <button
        onClick={() => {
          send({ tag: 'increment' });
        }}
      >
        +
      </button>
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
