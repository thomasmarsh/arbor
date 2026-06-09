import { Effect, Result } from '@arbor/common';
import type { DisplayGroupsResponse, WorkOrderResponse, TaskEntry } from '@arbor/api/ledger';
import type { LedgerEnv } from './ledger.env.js';

export const emptyWorkOrder: WorkOrderResponse = { tasks: [], pendingDeps: {} };

export const emptyGroups: DisplayGroupsResponse = {
  inProgress: [],
  ready: [],
  blocked: [],
  done: [],
  canceled: [],
};

export const groupsWithTasks: DisplayGroupsResponse = {
  inProgress: [],
  ready: [
    { type: 'task', kind: 'task', id: 1, epic: 'e1', story: 's1', wave: 'w1', layer: 'ui', status: 'next', text: 'Task Alpha', file: '1.md', deps: [], rank: 100 } satisfies TaskEntry,
    { type: 'task', kind: 'task', id: 2, epic: 'e1', story: 's1', wave: 'w1', layer: 'ui', status: 'todo', text: 'Task Beta',  file: '2.md', deps: [], rank: 200 } satisfies TaskEntry,
  ],
  blocked: [],
  done: [
    { type: 'task', kind: 'task', id: 3, epic: 'e1', story: 's1', wave: 'w1', layer: 'ui', status: 'done', text: 'Task Done',  file: '3.md', deps: [], rank:  50 } satisfies TaskEntry,
  ],
  canceled: [],
};

export const mockLedgerEnv: LedgerEnv = {
  fetchQueue:      Effect.send(Result.ok(emptyGroups)),
  fetchHierarchy:  Effect.send(Result.ok({ epics: [], stories: [] })),
  fetchWorkOrder:  Effect.send(Result.ok(emptyWorkOrder)),
  setStatus:    () => Effect.send(undefined),
  setRank:      () => Effect.send(undefined),
  pollTick:        Effect.none(),
  fetchPlanDoc: () => Effect.send(Result.ok('# Mock Plan\n\nNo content.')),
};
