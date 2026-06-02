import { withLogging } from '@arbor/common';
import { useStore } from '@arbor/common/react';
import { useEffect } from 'react';
import { liveLedgerEnv } from './ledger.env.js';
import { ledgerReducer, initialLedgerState } from './ledger.store.js';

export function LedgerTable() {
  const [$, send] = useStore(withLogging('ledger', ledgerReducer), liveLedgerEnv, initialLedgerState);

  useEffect(() => { send({ tag: 'fetch' }); }, []);

  if ($.state.loadState.tag === 'idle' || $.state.loadState.tag === 'loading') {
    return <p>Loading ledger…</p>;
  }
  if ($.state.loadState.tag === 'error') {
    return <p style={{ color: 'red' }}>Error: {$.state.loadState.message}</p>;
  }

  const { groups } = $.state.loadState;
  const allTasks = [
    ...groups.inProgress,
    ...groups.ready,
    ...groups.blocked.map((b) => b.task),
  ];

  return (
    <table>
      <thead>
        <tr>
          <th>ID</th><th>Wave</th><th>Status</th><th>Size</th><th>Task</th>
        </tr>
      </thead>
      <tbody>
        {allTasks.map((task) => (
          <tr key={task.id}>
            <td>{task.id}</td>
            <td>{task.wave}</td>
            <td>{task.status}</td>
            <td>{task.size ?? '—'}</td>
            <td>{task.text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
