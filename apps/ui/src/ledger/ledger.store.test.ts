import { describe, it, vi, expect, beforeEach, afterEach } from 'vitest';
import { Effect, Result } from '@arbor/common';
import { TestStore } from '@arbor/common';
import type { EpicEntry, StoryEntry, TaskEntry, DisplayGroupsResponse } from '@arbor/api/ledger';
import { ledgerReducer, initialLedgerState, initialFilters, ledgerSubscriptions, DEFAULT_COLUMN_ORDER } from './ledger.store.js';
import type { LedgerState, ColId } from './ledger.store.js';
import { emptyGroups, groupsWithTasks, mockLedgerEnv } from './ledger.env.mock.js';

const freshIdle = (): LedgerState => ({
  loadState: { tag: 'idle' },
  selectedId: null,
  helpOpen: false,
  showAll: false,
  lastUpdated: null,
  detailTaskId: null,
  planDoc: { tag: 'idle' },
  filters: { ...initialFilters },
  columnOrder: [...DEFAULT_COLUMN_ORDER],
  viewMode: 'flat',
  epicMeta: [],
  storyMeta: [],
  collapsedEpics: new Set(),
  collapsedStories: new Set(),
});

const task133: TaskEntry = {
  type: 'task', kind: 'task', id: 133, epic: 'e4', story: 's14',
  wave: 'w28', layer: 'ui', status: 'next', text: 'task', file: '133.md',
  deps: [], rank: 100,
};

const groupsWithTask: DisplayGroupsResponse = { ...emptyGroups, ready: [task133] };
const loadedState: LedgerState = {
  loadState: { tag: 'loaded', groups: groupsWithTask },
  selectedId: null,
  helpOpen: false,
  showAll: false,
  lastUpdated: null,
  detailTaskId: null,
  planDoc: { tag: 'idle' },
  filters: { ...initialFilters },
  columnOrder: [...DEFAULT_COLUMN_ORDER],
  viewMode: 'flat',
  epicMeta: [],
  storyMeta: [],
  collapsedEpics: new Set(),
  collapsedStories: new Set(),
};

const NOW = new Date('2025-01-01T12:00:00.000Z');

describe('ledgerReducer', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  it('fetch transitions to loading then dispatches loaded on success', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, freshIdle());
    store
      .send({ tag: 'fetch' }, (s) => {
        s.loadState = { tag: 'loading' };
      })
      .receive({ tag: 'loaded', groups: emptyGroups }, (s) => {
        s.loadState = { tag: 'loaded', groups: emptyGroups };
        s.lastUpdated = NOW;
      });
    store.assertDrained();
  });

  it('fetch transitions to loading then dispatches error on failure', () => {
    const errEnv = { ...mockLedgerEnv, fetchQueue: Effect.send(Result.err<DisplayGroupsResponse, string>('network error')) };
    const store = new TestStore(ledgerReducer, errEnv, freshIdle());
    store
      .send({ tag: 'fetch' }, (s) => {
        s.loadState = { tag: 'loading' };
      })
      .receive({ tag: 'error', message: 'network error' }, (s) => {
        s.loadState = { tag: 'error', message: 'network error' };
      });
    store.assertDrained();
  });

  it('fetch schedules a repoll via pollTick', () => {
    let remaining = 1;
    // fires once, then silent — drives exactly one extra poll cycle in sync test
    // Type annotation on oncePollEnv drives contextual inference: A = void, send() with no arg
    const oncePollEnv: typeof mockLedgerEnv = {
      ...mockLedgerEnv,
      pollTick: Effect.of((send) => { if (remaining-- > 0) send(undefined); }),
    };
    const store = new TestStore(ledgerReducer, oncePollEnv, freshIdle());
    store
      .send({ tag: 'fetch' }, (s) => { s.loadState = { tag: 'loading' }; })
      .receive({ tag: 'loaded', groups: emptyGroups }, (s) => {
        s.loadState = { tag: 'loaded', groups: emptyGroups };
        s.lastUpdated = NOW;
      })
      .receive({ tag: 'fetch' }, (_s) => { /* background repoll — stays loaded, no flicker */ })
      .receive({ tag: 'loaded', groups: emptyGroups }, (s) => {
        s.loadState = { tag: 'loaded', groups: emptyGroups };
        s.lastUpdated = NOW;
      });
    store.assertDrained();
  });

  it('loaded action stores groups and sets lastUpdated', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, initialLedgerState);
    store.send({ tag: 'loaded', groups: emptyGroups }, (s) => {
      s.loadState = { tag: 'loaded', groups: emptyGroups };
      s.lastUpdated = NOW;
    });
    store.assertDrained();
  });

  it('error action stores message', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, initialLedgerState);
    store.send({ tag: 'error', message: 'oops' }, (s) => {
      s.loadState = { tag: 'error', message: 'oops' };
    });
    store.assertDrained();
  });

  it('setStatus optimistically updates task and triggers fetch', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, loadedState);
    store
      .send({ tag: 'setStatus', taskId: 133, status: 'done' }, (s) => {
        if (s.loadState.tag === 'loaded') {
          const t = s.loadState.groups.ready.find((x) => x.id === 133);
          if (t) t.status = 'done';
        }
      })
      .receive({ tag: 'fetch' }, (_s) => { /* background refresh — loadState stays loaded */ })
      .receive({ tag: 'loaded', groups: emptyGroups }, (s) => {
        s.loadState = { tag: 'loaded', groups: emptyGroups };
        s.lastUpdated = NOW;
      });
    store.assertDrained();
  });

  it('bump optimistically sets rank to min(waveRanks)-10 and triggers fetch', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, loadedState);
    store
      .send({ tag: 'bump', taskId: 133, waveRanks: [100, 200, 300] }, (s) => {
        if (s.loadState.tag === 'loaded') {
          const t = s.loadState.groups.ready.find((x) => x.id === 133);
          if (t) t.rank = 90;
        }
      })
      .receive({ tag: 'fetch' }, (_s) => { /* background refresh — loadState stays loaded */ })
      .receive({ tag: 'loaded', groups: emptyGroups }, (s) => {
        s.loadState = { tag: 'loaded', groups: emptyGroups };
        s.lastUpdated = NOW;
      });
    store.assertDrained();
  });

  it('defer optimistically sets rank to max(waveRanks)+10 and triggers fetch', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, loadedState);
    store
      .send({ tag: 'defer', taskId: 133, waveRanks: [100, 200, 300] }, (s) => {
        if (s.loadState.tag === 'loaded') {
          const t = s.loadState.groups.ready.find((x) => x.id === 133);
          if (t) t.rank = 310;
        }
      })
      .receive({ tag: 'fetch' }, (_s) => { /* background refresh — loadState stays loaded */ })
      .receive({ tag: 'loaded', groups: emptyGroups }, (s) => {
        s.loadState = { tag: 'loaded', groups: emptyGroups };
        s.lastUpdated = NOW;
      });
    store.assertDrained();
  });

  it('selectRow sets selectedId', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, loadedState);
    store.send({ tag: 'selectRow', taskId: 133 }, (s) => { s.selectedId = 133; });
    store.assertDrained();
  });

  it('selectRow with null clears selection', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, { ...loadedState, selectedId: 133 });
    store.send({ tag: 'selectRow', taskId: null }, (s) => { s.selectedId = null; });
    store.assertDrained();
  });

  it('openHelp sets helpOpen to true', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, freshIdle());
    store.send({ tag: 'openHelp' }, (s) => { s.helpOpen = true; });
    store.assertDrained();
  });

  it('closeHelp sets helpOpen to false', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, { ...freshIdle(), helpOpen: true });
    store.send({ tag: 'closeHelp' }, (s) => { s.helpOpen = false; });
    store.assertDrained();
  });

  it('toggleShowAll flips the showAll flag', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, loadedState);
    store.send({ tag: 'toggleShowAll' }, (s) => { s.showAll = true; });
    store.assertDrained();
  });

  it('refresh silently re-fetches from loaded state without flicker', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, loadedState);
    store
      .send({ tag: 'refresh' }, (_s) => { /* loadState unchanged — data stays visible */ })
      .receive({ tag: 'loaded', groups: emptyGroups }, (s) => {
        s.loadState = { tag: 'loaded', groups: emptyGroups };
        s.lastUpdated = NOW;
      });
    store.assertDrained();
  });

  it('openDetail sets detailTaskId + loading planDoc and returns an Effect', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, freshIdle());
    store
      .send({ tag: 'openDetail', taskId: 7 }, (s) => {
        s.detailTaskId = 7;
        s.planDoc = { tag: 'loading', taskId: 7 };
      })
      .receive({ tag: 'planDocLoaded', taskId: 7, content: '# Mock Plan\n\nNo content.' }, (s) => {
        s.planDoc = { tag: 'loaded', taskId: 7, content: '# Mock Plan\n\nNo content.' };
      });
    store.assertDrained();
  });

  it('closeDetail resets detailTaskId and planDoc to initial values', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, {
      ...freshIdle(),
      detailTaskId: 7,
      planDoc: { tag: 'loaded', taskId: 7, content: '# stuff' },
    });
    store.send({ tag: 'closeDetail' }, (s) => {
      s.detailTaskId = null;
      s.planDoc = { tag: 'idle' };
    });
    store.assertDrained();
  });

  it('planDocLoaded with stale taskId is a no-op', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, {
      ...freshIdle(),
      detailTaskId: 7,
      planDoc: { tag: 'loading', taskId: 7 },
    });
    // taskId 99 does not match the loading taskId 7 — state unchanged
    store.send({ tag: 'planDocLoaded', taskId: 99, content: 'stale' }, (_s) => { /* no-op */ });
    store.assertDrained();
  });

  it('planDocError transitions to error state', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, {
      ...freshIdle(),
      detailTaskId: 5,
      planDoc: { tag: 'loading', taskId: 5 },
    });
    store.send({ tag: 'planDocError', taskId: 5, message: 'not found' }, (s) => {
      s.planDoc = { tag: 'error', taskId: 5, message: 'not found' };
    });
    store.assertDrained();
  });

  it('setTextFilter sets text; selection is preserved', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, { ...loadedState, selectedId: 133, filters: { ...initialFilters } });
    store.send({ tag: 'setTextFilter', text: 'hello' }, (s) => {
      s.filters.text = 'hello';
    });
    store.assertDrained();
  });

  it('setWaveFilter sets wave; selection is preserved', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, { ...loadedState, selectedId: 133, filters: { ...initialFilters } });
    store.send({ tag: 'setWaveFilter', wave: 'w5' }, (s) => {
      s.filters.wave = 'w5';
    });
    store.assertDrained();
  });

  it('setStatusFilter sets status; selection is preserved', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, { ...loadedState, selectedId: 133, filters: { ...initialFilters } });
    store.send({ tag: 'setStatusFilter', status: 'next' }, (s) => {
      s.filters.status = 'next';
    });
    store.assertDrained();
  });

  it('setKindFilter sets kind; selection is preserved', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, { ...loadedState, selectedId: 133, filters: { ...initialFilters } });
    store.send({ tag: 'setKindFilter', kind: 'spike' }, (s) => {
      s.filters.kind = 'spike';
    });
    store.assertDrained();
  });

  it('clearFilters restores initialFilters; selection is preserved', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, {
      ...loadedState,
      selectedId: 133,
      filters: { text: 'foo', wave: 'w3', status: 'done', kind: 'spike' },
    });
    store.send({ tag: 'clearFilters' }, (s) => {
      s.filters = { ...initialFilters };
    });
    store.assertDrained();
  });

  it('reorderColumn moves a column to the target position', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, freshIdle());
    // drag 'wave' (index 1) onto 'status' (index 5)
    store.send({ tag: 'reorderColumn', fromId: 'wave' satisfies ColId, toId: 'status' satisfies ColId }, (s) => {
      s.columnOrder = ['id', 'epic', 'story', 'layer', 'status', 'wave', 'size', 'task'] satisfies ColId[];
    });
    store.assertDrained();
  });

  it('reorderColumn is a no-op when fromId equals toId', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, freshIdle());
    store.send({ tag: 'reorderColumn', fromId: 'wave', toId: 'wave' }, (_s) => { /* no-op */ });
    store.assertDrained();
  });

  describe('tree view', () => {
    const epicA: EpicEntry  = { type: 'epic',  id: 'e1', title: 'Epic One' };
    const storyA: StoryEntry = { type: 'story', id: 's1', epic: 'e1', layer: 'ui', title: 'Story One' };

    it('toggleViewMode flat→tree sets viewMode and fetches hierarchy', () => {
      const store = new TestStore(ledgerReducer, mockLedgerEnv, freshIdle());
      store
        .send({ tag: 'toggleViewMode' }, (s) => { s.viewMode = 'tree'; })
        .receive({ tag: 'hierarchyLoaded', epics: [], stories: [] }, (s) => {
          s.epicMeta  = [];
          s.storyMeta = [];
        });
      store.assertDrained();
    });

    it('toggleViewMode tree→flat sets viewMode with no side effect', () => {
      const store = new TestStore(ledgerReducer, mockLedgerEnv, { ...freshIdle(), viewMode: 'tree' });
      store.send({ tag: 'toggleViewMode' }, (s) => { s.viewMode = 'flat'; });
      store.assertDrained();
    });

    it('hierarchyLoaded stores epics and stories', () => {
      const store = new TestStore(ledgerReducer, mockLedgerEnv, freshIdle());
      store.send({ tag: 'hierarchyLoaded', epics: [epicA], stories: [storyA] }, (s) => {
        s.epicMeta  = [epicA];
        s.storyMeta = [storyA];
      });
      store.assertDrained();
    });

    it('toggleEpicCollapse adds epicId to collapsedEpics', () => {
      const store = new TestStore(ledgerReducer, mockLedgerEnv, freshIdle());
      store.send({ tag: 'toggleEpicCollapse', epicId: 'e1' }, (s) => {
        s.collapsedEpics.add('e1');
      });
      store.assertDrained();
    });

    it('toggleEpicCollapse removes epicId when already collapsed', () => {
      const store = new TestStore(ledgerReducer, mockLedgerEnv, {
        ...freshIdle(), collapsedEpics: new Set(['e1']),
      });
      store.send({ tag: 'toggleEpicCollapse', epicId: 'e1' }, (s) => {
        s.collapsedEpics.delete('e1');
      });
      store.assertDrained();
    });

    it('toggleStoryCollapse adds storyId to collapsedStories', () => {
      const store = new TestStore(ledgerReducer, mockLedgerEnv, freshIdle());
      store.send({ tag: 'toggleStoryCollapse', storyId: 's1' }, (s) => {
        s.collapsedStories.add('s1');
      });
      store.assertDrained();
    });

    it('toggleStoryCollapse removes storyId when already collapsed', () => {
      const store = new TestStore(ledgerReducer, mockLedgerEnv, {
        ...freshIdle(), collapsedStories: new Set(['s1']),
      });
      store.send({ tag: 'toggleStoryCollapse', storyId: 's1' }, (s) => {
        s.collapsedStories.delete('s1');
      });
      store.assertDrained();
    });
  });

  describe('ledgerSubscriptions (Exp D)', () => {
    it('returns empty array when not loaded', () => {
      expect(ledgerSubscriptions(freshIdle())).toEqual([]);
      expect(ledgerSubscriptions({ ...loadedState, loadState: { tag: 'loading' } })).toEqual([]);
    });

    it('returns a keydown Sub when loaded', () => {
      const subs = ledgerSubscriptions(loadedState);
      expect(subs).toHaveLength(1);
      expect(subs[0]?.tag).toBe('keydown');
    });

    it.each([
      // selectedId is null → j selects first row; k does nothing
      { key: 'j',         expected: { tag: 'selectRow', taskId: task133.id } },
      { key: 'k',         expected: null },
      { key: '?',         expected: { tag: 'openHelp' } },
      { key: 'Escape',    expected: { tag: 'closeDetail' } },
      { key: 'Enter',     expected: null },   // no selection → no-op
      { key: 'n',         expected: null },
      { key: 'Unhandled', expected: null },
    ] as const)('keydown handler: $key → $expected', ({ key, expected }) => {
      const sub = ledgerSubscriptions(loadedState)[0];
      if (sub?.tag !== 'keydown') throw new Error('expected keydown sub');
      expect(sub.handler(new KeyboardEvent('keydown', { key }))).toEqual(expected);
    });

    it('Enter opens detail on the selected task', () => {
      const stateWithSelection = { ...loadedState, selectedId: task133.id };
      const sub = ledgerSubscriptions(stateWithSelection)[0];
      if (sub?.tag !== 'keydown') throw new Error('expected keydown sub');
      expect(sub.handler(new KeyboardEvent('keydown', { key: 'Enter' }))).toEqual({
        tag: 'openDetail', taskId: task133.id,
      });
    });

    it('k navigates up from selected task', () => {
      const twoTaskGroups: DisplayGroupsResponse = {
        ...emptyGroups,
        ready: [task133, { ...task133, id: 134, text: 'task2', rank: 200 }],
      };
      const stateWithTwo = { ...loadedState, loadState: { tag: 'loaded' as const, groups: twoTaskGroups }, selectedId: 134 };
      const sub = ledgerSubscriptions(stateWithTwo)[0];
      if (sub?.tag !== 'keydown') throw new Error('expected keydown sub');
      expect(sub.handler(new KeyboardEvent('keydown', { key: 'k' }))).toEqual({
        tag: 'selectRow', taskId: task133.id,
      });
    });

    it('tree mode: collapsed epic hides its tasks from arrow navigation', () => {
      const state = {
        ...loadedState,
        viewMode: 'tree' as const,
        collapsedEpics: new Set([task133.epic]),
        collapsedStories: new Set<string>(),
      };
      const sub = ledgerSubscriptions(state)[0];
      if (sub?.tag !== 'keydown') throw new Error('expected keydown sub');
      expect(sub.handler(new KeyboardEvent('keydown', { key: 'j' }))).toBeNull();
    });

    it('tree mode: collapsed story hides its tasks from arrow navigation', () => {
      const state = {
        ...loadedState,
        viewMode: 'tree' as const,
        collapsedEpics: new Set<string>(),
        collapsedStories: new Set([task133.story]),
      };
      const sub = ledgerSubscriptions(state)[0];
      if (sub?.tag !== 'keydown') throw new Error('expected keydown sub');
      expect(sub.handler(new KeyboardEvent('keydown', { key: 'j' }))).toBeNull();
    });

    it('tree mode: uncollapsed tasks are navigable', () => {
      const state = {
        ...loadedState,
        viewMode: 'tree' as const,
        collapsedEpics: new Set<string>(),
        collapsedStories: new Set<string>(),
      };
      const sub = ledgerSubscriptions(state)[0];
      if (sub?.tag !== 'keydown') throw new Error('expected keydown sub');
      expect(sub.handler(new KeyboardEvent('keydown', { key: 'j' }))).toEqual({
        tag: 'selectRow', taskId: task133.id,
      });
    });
  });

});

// groupsWithTasks is exported for component tests that need tasks in view
export { groupsWithTasks };
