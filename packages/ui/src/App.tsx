import type { HelloResponse } from '@arbo/common';
import { useEffect, useState } from 'react';
import { fetchHello } from './api/hello.js';

function App() {
  const [hello, setHello] = useState<HelloResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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
