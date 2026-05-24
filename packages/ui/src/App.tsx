import { Effect, type HelloResponse, type Reducer } from '@arbo/common';
import { useStore } from '@arbo/common/react';
import { useEffect, useState } from 'react';
import { fetchHello } from './api/hello.js';

interface CounterState {
  count: number;
}
type CounterAction = 'inc' | 'dec';
type CounterEnv = null;

const counterReducer: Reducer<CounterState, CounterAction, CounterEnv> = ($, action, _) => {
  switch (action) {
    case 'dec': {
      $.state.count -= 1;
      return Effect.none();
    }
    case 'inc': {
      $.state.count += 1;
      return Effect.none();
    }
  }
};

function App() {
  const [hello, setHello] = useState<HelloResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [$, send] = useStore(counterReducer, null, {
    count: 0,
  });

  useEffect(() => {
    fetchHello()
      .then(setHello)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  return (
    <main>
      <h1>Arbo</h1>
      <button
        onClick={() => {
          send('dec');
        }}
      >
        -
      </button>
      {$.state.count}
      <button
        onClick={() => {
          send('inc');
        }}
      >
        +
      </button>
      {error != null && <p style={{ color: 'red' }}>Error: {error}</p>}
      {hello != null ? (
        <p>
          {hello.message} — {hello.timestamp}
        </p>
      ) : (
        <p>Loading…</p>
      )}
    </main>
  );
}

export default App;
