import { withLogging } from '@arbo/common';
import { useStore } from '@arbo/common/react';
import { useEffect } from 'react';
import { liveCounterEnv } from './counter.env';
import { counterReducer, initialState } from './counter.store';

export function Counter() {
  console.log('Counter rendering');
  const [$, send] = useStore(withLogging('counter', counterReducer), liveCounterEnv, initialState);
  console.log('Counter state', $.state);

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
      {(() => {
        const ls = $.state.loadState;
        console.log('loadState tag:', ls.tag);
        if (ls.tag === 'loaded') {
          console.log('value:', ls.value);
          console.log('fold type:', typeof ls.value.fold);
        }
        return null;
      })()}
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
