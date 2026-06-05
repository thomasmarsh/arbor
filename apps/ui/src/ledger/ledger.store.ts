import { Effect, Sub, type Reducer } from '@arbor/common';
import type { Snapshot } from 'valtio';
import type { DisplayGroupsResponse, TaskEntry, TaskStatus } from '@arbor/api/ledger';
import type { LedgerEnv } from './ledger.env.js';

export interface LedgerFilters {
  text: string;
  wave: string | null;
  status: TaskStatus | null;
  kind: 'task' | 'spike' | null;
}

export const initialFilters: LedgerFilters = {
  text: '',
  wave: null,
  status: null,
  kind: null,
};

export type { DisplayGroupsResponse };

export type LedgerLoadState =
  | { tag: 'idle' }
  | { tag: 'loading' }
  | { tag: 'loaded'; groups: DisplayGroupsResponse }
  | { tag: 'error'; message: string };

export type PlanDocState =
  | { tag: 'idle' }
  | { tag: 'loading'; taskId: number }
  | { tag: 'loaded'; taskId: number; content: string }
  | { tag: 'error'; taskId: number; message: string };

export interface LedgerState {
  loadState: LedgerLoadState;
  selectedIndex: number;
  showAll: boolean;
  lastUpdated: Date | null;
  detailTaskId: number | null;
  planDoc: PlanDocState;
  filters: LedgerFilters;
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
  | { tag: 'refresh' }
  | { tag: 'openDetail'; taskId: number }
  | { tag: 'closeDetail' }
  | { tag: 'planDocLoaded'; taskId: number; content: string }
  | { tag: 'planDocError'; taskId: number; message: string }
  | { tag: 'setTextFilter'; text: string }
  | { tag: 'setWaveFilter'; wave: string | null }
  | { tag: 'setStatusFilter'; status: TaskStatus | null }
  | { tag: 'setKindFilter'; kind: 'task' | 'spike' | null }
  | { tag: 'clearFilters' };

export const initialLedgerState: LedgerState = {
  loadState: { tag: 'idle' },
  selectedIndex: 0,
  showAll: false,
  lastUpdated: null,
  detailTaskId: null,
  planDoc: { tag: 'idle' },
  filters: initialFilters,
};

export function applyFilters(tasks: TaskEntry[], filters: LedgerFilters): TaskEntry[] {
  return tasks.filter((t) => {
    if (filters.wave   && t.wave !== filters.wave) return false;
    if (filters.status && t.status !== filters.status) return false;
    if (filters.kind   && t.kind !== filters.kind) return false;
    if (filters.text) {
      const q = filters.text.toLowerCase();
      if (!t.text.toLowerCase().includes(q) && !String(t.id).includes(q)) return false;
    }
    return true;
  });
}

function waveRanksFor(wave: string, tasks: readonly { wave: string; rank?: number | undefined }[]): number[] {
  return tasks.flatMap((t) => (t.wave === wave && t.rank !== undefined ? [t.rank] : []));
}

function toggleNext(status: TaskStatus): TaskStatus { return status === 'next' ? 'todo' : 'next'; }
function toggleDone(status: TaskStatus): TaskStatus { return status === 'done' ? 'todo' : 'done'; }

export function ledgerSubscriptions(state: Snapshot<LedgerState>): Sub<LedgerAction>[] {
  if (state.loadState.tag !== 'loaded') return [];
  const { groups } = state.loadState;
  const filters = state.filters as LedgerFilters;

  // Cast once: Snapshot<TaskEntry> is structurally identical to TaskEntry (all primitives).
  const inProgress = [...groups.inProgress] as TaskEntry[];
  const ready      = [...groups.ready] as TaskEntry[];
  const blocked    = groups.blocked.map((b) => b.task as unknown as TaskEntry);
  const done       = [...groups.done, ...groups.canceled] as TaskEntry[];

  const allTasksForRanks = [...inProgress, ...ready, ...blocked, ...done];
  const visibleRows = [
    ...applyFilters(inProgress, filters),
    ...applyFilters(ready, filters),
    ...applyFilters(blocked, filters),
    ...(state.showAll ? applyFilters(done, filters) : []),
  ];
  const rowCount = visibleRows.length;
  const selected = visibleRows[state.selectedIndex];
  return [Sub.keydown<LedgerAction>((e) => {
    switch (e.key) {
      case 'ArrowUp':   e.preventDefault(); return { tag: 'selectUp' };
      case 'ArrowDown': e.preventDefault(); return { tag: 'selectDown', rowCount };
      case 'k': return { tag: 'selectUp' };
      case 'j': return { tag: 'selectDown', rowCount };
      case 'n': return selected ? { tag: 'setStatus', taskId: selected.id, status: toggleNext(selected.status) } : null;
      case 'd': return selected ? { tag: 'setStatus', taskId: selected.id, status: toggleDone(selected.status) } : null;
      case 'b': return selected ? { tag: 'bump', taskId: selected.id, waveRanks: waveRanksFor(selected.wave, allTasksForRanks) } : null;
      case 'D': return selected ? { tag: 'defer', taskId: selected.id, waveRanks: waveRanksFor(selected.wave, allTasksForRanks) } : null;
      case 'a': return { tag: 'toggleShowAll' };
      case 'r': return { tag: 'refresh' };
      case 'Enter': return selected ? { tag: 'openDetail', taskId: selected.id } : null;
      case 'Escape': return { tag: 'closeDetail' };
      default: return null;
    }
  })];
}

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
      if ($.state.loadState.tag !== 'loaded') $.state.loadState = { tag: 'loading' };
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
      if ($.state.loadState.tag !== 'loaded') $.state.loadState = { tag: 'loading' };
      return env.fetchQueue.map((result) =>
        result.fold<LedgerAction>(
          (groups) => ({ tag: 'loaded', groups }),
          (err) => ({ tag: 'error', message: err }),
        ),
      );
    }
    case 'openDetail': {
      $.state.detailTaskId = action.taskId;
      $.state.planDoc = { tag: 'loading', taskId: action.taskId };
      return env.fetchPlanDoc(action.taskId).map((result) =>
        result.fold<LedgerAction>(
          (content) => ({ tag: 'planDocLoaded', taskId: action.taskId, content }),
          (err) => ({ tag: 'planDocError', taskId: action.taskId, message: err }),
        ),
      );
    }
    case 'closeDetail': {
      $.state.detailTaskId = null;
      $.state.planDoc = { tag: 'idle' };
      return null;
    }
    case 'planDocLoaded': {
      if ($.state.planDoc.tag === 'loading' && $.state.planDoc.taskId === action.taskId) {
        $.state.planDoc = { tag: 'loaded', taskId: action.taskId, content: action.content };
      }
      return null;
    }
    case 'planDocError': {
      if ($.state.planDoc.tag === 'loading' && $.state.planDoc.taskId === action.taskId) {
        $.state.planDoc = { tag: 'error', taskId: action.taskId, message: action.message };
      }
      return null;
    }
    case 'setTextFilter': {
      $.state.filters.text = action.text;
      $.state.selectedIndex = 0;
      return null;
    }
    case 'setWaveFilter': {
      $.state.filters.wave = action.wave;
      $.state.selectedIndex = 0;
      return null;
    }
    case 'setStatusFilter': {
      $.state.filters.status = action.status;
      $.state.selectedIndex = 0;
      return null;
    }
    case 'setKindFilter': {
      $.state.filters.kind = action.kind;
      $.state.selectedIndex = 0;
      return null;
    }
    case 'clearFilters': {
      $.state.filters = { ...initialFilters };
      $.state.selectedIndex = 0;
      return null;
    }
  }
};
