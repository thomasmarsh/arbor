import { Effect, type Reducer } from '@arbor/common';
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
  showAll: boolean;
  lastUpdated: Date | null;
}

export type LedgerAction =
  | { tag: 'fetch' }
  | { tag: 'loaded'; groups: DisplayGroupsResponse }
  | { tag: 'error'; message: string }
  | { tag: 'setStatus'; taskId: number; status: TaskStatus }
  | { tag: 'bump'; taskId: number; waveRanks: number[] }
  | { tag: 'defer'; taskId: number; waveRanks: number[] }
  | { tag: 'selectUp' }
  | { tag: 'selectDown'; rowCount: number }
  | { tag: 'toggleShowAll' }
  | { tag: 'refresh' };

export const initialLedgerState: LedgerState = {
  loadState: { tag: 'idle' },
  selectedIndex: 0,
  showAll: false,
  lastUpdated: null,
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
      return Effect.merge<LedgerAction>(
        env.fetchQueue.map((result) =>
          result.fold<LedgerAction>(
            (groups) => ({ tag: 'loaded', groups }),
            (err) => ({ tag: 'error', message: err }),
          ),
        ),
        env.pollTick.map(() => ({ tag: 'fetch' })),
      );
    }
    case 'loaded': {
      $.state.loadState = { tag: 'loaded', groups: action.groups };
      $.state.lastUpdated = new Date();
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
    case 'selectUp': {
      $.state.selectedIndex = Math.max(0, $.state.selectedIndex - 1);
      return null;
    }
    case 'selectDown': {
      $.state.selectedIndex = Math.min(action.rowCount - 1, $.state.selectedIndex + 1);
      return null;
    }
    case 'toggleShowAll': {
      $.state.showAll = !$.state.showAll;
      return null;
    }
    case 'refresh': {
      $.state.loadState = { tag: 'loading' };
      return env.fetchQueue.map((result) =>
        result.fold<LedgerAction>(
          (groups) => ({ tag: 'loaded', groups }),
          (err) => ({ tag: 'error', message: err }),
        ),
      );
    }
  }
};
