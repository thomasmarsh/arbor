import type { Reducer } from '@arbor/common';
import type { DisplayGroupsResponse, TaskEntry, TaskStatus } from '@arbor/api/ledger';
import type { LedgerEnv } from './ledger.env.js';

export type { DisplayGroupsResponse };

export type LedgerLoadState =
  | { tag: 'idle' }
  | { tag: 'loading' }
  | { tag: 'loaded'; groups: DisplayGroupsResponse }
  | { tag: 'error'; message: string };

export interface LedgerState {
  loadState: LedgerLoadState;
  selectedIndex: number;
}

export type LedgerAction =
  | { tag: 'fetch' }
  | { tag: 'loaded'; groups: DisplayGroupsResponse }
  | { tag: 'error'; message: string }
  | { tag: 'setStatus'; taskId: number; status: TaskStatus }
  | { tag: 'bump'; taskId: number; waveRanks: number[] }
  | { tag: 'defer'; taskId: number; waveRanks: number[] };

export const initialLedgerState: LedgerState = {
  loadState: { tag: 'idle' },
  selectedIndex: 0,
};

function spliceTask(arr: TaskEntry[], taskId: number, updater: (t: TaskEntry) => TaskEntry): boolean {
  const idx = arr.findIndex((t) => t.id === taskId);
  if (idx === -1) return false;
  const item = arr[idx];
  if (item === undefined) return false;
  arr[idx] = updater(item);
  return true;
}

function mutateTaskInGroups(
  state: LedgerState,
  taskId: number,
  updater: (t: TaskEntry) => TaskEntry,
): void {
  if (state.loadState.tag !== 'loaded') return;
  const g = state.loadState.groups;
  if (spliceTask(g.inProgress, taskId, updater)) return;
  if (spliceTask(g.ready, taskId, updater)) return;
  const bIdx = g.blocked.findIndex((b) => b.task.id === taskId);
  const bEntry = g.blocked[bIdx];
  if (bEntry !== undefined) bEntry.task = updater(bEntry.task);
}

export const ledgerReducer: Reducer<LedgerState, LedgerAction, LedgerEnv> = ($, action, env) => {
  switch (action.tag) {
    case 'fetch': {
      $.state.loadState = { tag: 'loading' };
      return env.fetchQueue.map((result) =>
        result.fold<LedgerAction>(
          (groups) => ({ tag: 'loaded', groups }),
          (err) => ({ tag: 'error', message: err }),
        ),
      );
    }
    case 'loaded': {
      $.state.loadState = { tag: 'loaded', groups: action.groups };
      return null;
    }
    case 'error': {
      $.state.loadState = { tag: 'error', message: action.message };
      return null;
    }
    case 'setStatus': {
      mutateTaskInGroups($.state, action.taskId, (t) => ({ ...t, status: action.status }));
      return env.setStatus(action.taskId, action.status).map(() => ({ tag: 'fetch' }));
    }
    case 'bump': {
      const newRank = Math.max(1, Math.min(...action.waveRanks) - 10);
      mutateTaskInGroups($.state, action.taskId, (t) => ({ ...t, rank: newRank }));
      return env.setRank(action.taskId, newRank).map(() => ({ tag: 'fetch' }));
    }
    case 'defer': {
      const newRank = Math.max(...action.waveRanks) + 10;
      mutateTaskInGroups($.state, action.taskId, (t) => ({ ...t, rank: newRank }));
      return env.setRank(action.taskId, newRank).map(() => ({ tag: 'fetch' }));
    }
  }
};
