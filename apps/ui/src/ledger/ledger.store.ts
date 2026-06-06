import { Effect, Sub, type Reducer } from '@arbor/common';
import type { Snapshot } from 'valtio';
import type { DisplayGroupsResponse, TaskEntry, TaskStatus } from '@arbor/api/ledger';
import type { LedgerEnv } from './ledger.env.js';

export type ColId = 'id' | 'wave' | 'epic' | 'story' | 'layer' | 'status' | 'size' | 'task';

export const DEFAULT_COLUMN_ORDER: readonly ColId[] = ['id', 'wave', 'epic', 'story', 'layer', 'status', 'size', 'task'];

const LS_COL_KEY = 'ledger:columnOrder';

function loadColumnOrder(): readonly ColId[] {
  try {
    const raw = localStorage.getItem(LS_COL_KEY);
    if (!raw) return DEFAULT_COLUMN_ORDER;
    const parsed: unknown = JSON.parse(raw);
    const valid = new Set<string>(DEFAULT_COLUMN_ORDER);
    if (
      Array.isArray(parsed) &&
      parsed.length === DEFAULT_COLUMN_ORDER.length &&
      (parsed as unknown[]).every((s) => typeof s === 'string' && valid.has(s))
    ) {
      return parsed as readonly ColId[];
    }
  } catch { /* ignore */ }
  return DEFAULT_COLUMN_ORDER;
}

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
  selectedId: number | null;
  showAll: boolean;
  lastUpdated: Date | null;
  detailTaskId: number | null;
  planDoc: PlanDocState;
  filters: LedgerFilters;
  helpOpen: boolean;
  columnOrder: readonly ColId[];
}

export type LedgerAction =
  | { tag: 'fetch' }
  | { tag: 'loaded'; groups: DisplayGroupsResponse }
  | { tag: 'error'; message: string }
  | { tag: 'setStatus'; taskId: number; status: TaskStatus }
  | { tag: 'bump'; taskId: number; waveRanks: number[] }
  | { tag: 'defer'; taskId: number; waveRanks: number[] }
  | { tag: 'selectRow'; taskId: number | null }
  | { tag: 'toggleShowAll' }
  | { tag: 'openHelp' }
  | { tag: 'closeHelp' }
  | { tag: 'refresh' }
  | { tag: 'openDetail'; taskId: number }
  | { tag: 'closeDetail' }
  | { tag: 'planDocLoaded'; taskId: number; content: string }
  | { tag: 'planDocError'; taskId: number; message: string }
  | { tag: 'setTextFilter'; text: string }
  | { tag: 'setWaveFilter'; wave: string | null }
  | { tag: 'setStatusFilter'; status: TaskStatus | null }
  | { tag: 'setKindFilter'; kind: 'task' | 'spike' | null }
  | { tag: 'clearFilters' }
  | { tag: 'reorderColumn'; fromId: ColId; toId: ColId };

export const initialLedgerState: LedgerState = {
  loadState: { tag: 'idle' },
  selectedId: null,
  showAll: false,
  lastUpdated: null,
  detailTaskId: null,
  planDoc: { tag: 'idle' },
  filters: initialFilters,
  helpOpen: false,
  columnOrder: loadColumnOrder(),
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


function selectUp(rows: TaskEntry[], selectedId: number | null): { tag: 'selectRow'; taskId: number } | null {
  if (selectedId === null) return null;
  const idx = rows.findIndex((t) => t.id === selectedId);
  if (idx <= 0) return null;
  const prev = rows[idx - 1];
  return prev ? { tag: 'selectRow', taskId: prev.id } : null;
}

function selectDown(rows: TaskEntry[], selectedId: number | null): { tag: 'selectRow'; taskId: number } | null {
  if (rows.length === 0) return null;
  if (selectedId === null) {
    const first = rows[0];
    return first ? { tag: 'selectRow', taskId: first.id } : null;
  }
  const idx = rows.findIndex((t) => t.id === selectedId);
  const next = rows[idx < 0 ? 0 : Math.min(rows.length - 1, idx + 1)];
  return next ? { tag: 'selectRow', taskId: next.id } : null;
}

export function ledgerSubscriptions(state: Snapshot<LedgerState>): Sub<LedgerAction>[] {
  if (state.loadState.tag !== 'loaded') return [];
  const { groups } = state.loadState;
  const filters = state.filters as LedgerFilters;

  // Cast once: Snapshot<TaskEntry> is structurally identical to TaskEntry (all primitives).
  const inProgress = [...groups.inProgress] as TaskEntry[];
  const ready      = [...groups.ready] as TaskEntry[];
  const blocked    = groups.blocked.map((b) => b.task as unknown as TaskEntry);
  const done       = [...groups.done, ...groups.canceled] as TaskEntry[];

  const visibleRows = [
    ...applyFilters(inProgress, filters),
    ...applyFilters(ready, filters),
    ...applyFilters(blocked, filters),
    ...(state.showAll ? applyFilters(done, filters) : []),
  ];
  const selectedId = state.selectedId;
  const selected = visibleRows.find((t) => t.id === selectedId);

  return [Sub.keydown<LedgerAction>((e) => {
    switch (e.key) {
      case 'ArrowUp':   e.preventDefault(); return selectUp(visibleRows, selectedId);
      case 'ArrowDown': e.preventDefault(); return selectDown(visibleRows, selectedId);
      case 'k': return selectUp(visibleRows, selectedId);
      case 'j': return selectDown(visibleRows, selectedId);
      case 'Enter': return selected ? { tag: 'openDetail', taskId: selected.id } : null;
      case 'Escape': return { tag: 'closeDetail' };
      case '?': return { tag: 'openHelp' };
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
    case 'selectRow': {
      $.state.selectedId = action.taskId;
      return null;
    }
    case 'openHelp': {
      $.state.helpOpen = true;
      return null;
    }
    case 'closeHelp': {
      $.state.helpOpen = false;
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
      return null;
    }
    case 'setWaveFilter': {
      $.state.filters.wave = action.wave;
      return null;
    }
    case 'setStatusFilter': {
      $.state.filters.status = action.status;
      return null;
    }
    case 'setKindFilter': {
      $.state.filters.kind = action.kind;
      return null;
    }
    case 'clearFilters': {
      $.state.filters = { ...initialFilters };
      return null;
    }
    case 'reorderColumn': {
      const from = $.state.columnOrder.indexOf(action.fromId);
      const to = $.state.columnOrder.indexOf(action.toId);
      if (from !== -1 && to !== -1) {
        const next = [...$.state.columnOrder];
        const [item] = next.splice(from, 1);
        if (item !== undefined) next.splice(to, 0, item);
        $.state.columnOrder = next;
        try { localStorage.setItem(LS_COL_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      }
      return null;
    }
  }
};
