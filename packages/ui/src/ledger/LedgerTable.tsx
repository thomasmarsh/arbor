import { withLogging } from '@arbor/common';
import { useStore } from '@arbor/common/react';
import { useEffect, useRef } from 'react';
import type { TaskStatus } from '@arbor/api/ledger';
import { liveLedgerEnv, type LedgerEnv } from './ledger.env.js';
import { ledgerReducer, initialLedgerState } from './ledger.store.js';

function toggleNext(status: TaskStatus): TaskStatus {
  return status === 'next' ? 'todo' : 'next';
}

function toggleDone(status: TaskStatus): TaskStatus {
  return status === 'done' ? 'todo' : 'done';
}

function waveRanksFor(wave: string, tasks: ReadonlyArray<{ wave: string; rank?: number | undefined }>): number[] {
  return tasks.flatMap((t) => (t.wave === wave && t.rank !== undefined ? [t.rank] : []));
}

export function LedgerTable({ env = liveLedgerEnv }: { env?: LedgerEnv } = {}) {
  const [$, send] = useStore(withLogging('ledger', ledgerReducer), env, initialLedgerState);
  const selectedRowRef = useRef<HTMLTableRowElement>(null);

  const groups = $.state.loadState.tag === 'loaded' ? $.state.loadState.groups : null;
  const activeTasks = groups
    ? [...groups.inProgress, ...groups.ready, ...groups.blocked.map((b) => b.task)]
    : [];
  const doneTasks = groups ? [...groups.done, ...groups.canceled] : [];
  const allTasksForRanks = [...activeTasks, ...doneTasks];
  const visibleRows = $.state.showAll ? [...activeTasks, ...doneTasks] : activeTasks;
  const selected = visibleRows[$.state.selectedIndex];

  useEffect(() => { send({ tag: 'fetch' }); }, []);

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [$.state.selectedIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const rowCount = visibleRows.length;
      switch (e.key) {
        case 'ArrowUp': case 'k': send({ tag: 'selectUp' }); break;
        case 'ArrowDown': case 'j': send({ tag: 'selectDown', rowCount }); break;
        case 'n':
          if (selected) send({ tag: 'setStatus', taskId: selected.id, status: toggleNext(selected.status) });
          break;
        case 'd':
          if (selected) send({ tag: 'setStatus', taskId: selected.id, status: toggleDone(selected.status) });
          break;
        case 'b':
          if (selected) send({ tag: 'bump', taskId: selected.id, waveRanks: waveRanksFor(selected.wave, allTasksForRanks) });
          break;
        case 'D':
          if (selected) send({ tag: 'defer', taskId: selected.id, waveRanks: waveRanksFor(selected.wave, allTasksForRanks) });
          break;
        case 'a': send({ tag: 'toggleShowAll' }); break;
        case 'r': send({ tag: 'refresh' }); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [send, selected, visibleRows]);

  if ($.state.loadState.tag === 'idle' || $.state.loadState.tag === 'loading') {
    return <p>Loading ledger…</p>;
  }
  if ($.state.loadState.tag === 'error') {
    return <p style={{ color: 'red' }}>Error: {$.state.loadState.message}</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>ID</th><th>Wave</th><th>Status</th><th>Size</th><th>Task</th>
        </tr>
      </thead>
      <tbody>
        {visibleRows.map((task, i) => {
          const isSelected = i === $.state.selectedIndex;
          const isDim = task.status === 'done' || task.status === 'canceled';
          return (
            <tr
              key={task.id}
              ref={isSelected ? selectedRowRef : null}
              style={{
                background: isSelected ? '#264f78' : undefined,
                opacity: isDim ? 0.5 : undefined,
              }}
            >
              <td>{task.id}</td>
              <td>{task.wave}</td>
              <td>{task.status}</td>
              <td>{task.size ?? '—'}</td>
              <td>{task.text}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
