import { useEffect } from 'react';
import type { Send } from '@arbor/common';
import type { TaskEntry, TaskStatus } from '@arbor/api/ledger';
import type { Snapshot } from 'valtio';
import type { LedgerAction } from './ledger.store.js';

function toggleNext(status: TaskStatus): TaskStatus {
  return status === 'next' ? 'todo' : 'next';
}

function toggleDone(status: TaskStatus): TaskStatus {
  return status === 'done' ? 'todo' : 'done';
}

function waveRanksFor(wave: string, tasks: readonly { wave: string; rank?: number | undefined }[]): number[] {
  return tasks.flatMap((t) => (t.wave === wave && t.rank !== undefined ? [t.rank] : []));
}

export function useLedgerKeyboard(
  send: Send<LedgerAction>,
  selected: Snapshot<TaskEntry> | undefined,
  visibleRows: Snapshot<TaskEntry>[],
  allTasksForRanks: Snapshot<TaskEntry>[],
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const rowCount = visibleRows.length;
      switch (e.key) {
        case 'ArrowUp':   e.preventDefault(); send({ tag: 'selectUp' }); break;
        case 'ArrowDown': e.preventDefault(); send({ tag: 'selectDown', rowCount }); break;
        case 'k': send({ tag: 'selectUp' }); break;
        case 'j': send({ tag: 'selectDown', rowCount }); break;
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
        case 'a':     send({ tag: 'toggleShowAll' }); break;
        case 'r':     send({ tag: 'refresh' }); break;
        case 'Enter': if (selected) send({ tag: 'openDetail', taskId: selected.id }); break;
        case 'Escape': send({ tag: 'closeDetail' }); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [send, selected, visibleRows]);
}
