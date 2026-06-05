import { describe, it, vi, expect, beforeEach, afterEach } from 'vitest';
import { Effect, Result } from '@arbor/common';
import { TestStore } from '@arbor/common';
import type { TaskEntry, DisplayGroupsResponse } from '@arbor/api/ledger';
import { ledgerReducer, initialLedgerState, initialFilters, ledgerSubscriptions } from './ledger.store.js';
import type { LedgerState } from './ledger.store.js';
import { emptyGroups, groupsWithTasks, mockLedgerEnv } from './ledger.env.mock.js';

const freshIdle = (): LedgerState => ({
  loadState: { tag: 'idle' },
  selectedIndex: 0,
  showAll: false,
  lastUpdated: null,
  detailTaskId: null,
  planDoc: { tag: 'idle' },
  filters: { ...initialFilters },
});

const task133: TaskEntry = {
  type: 'task', kind: 'task', id: 133, epic: 'e4', story: 's14',
  wave: 'w28', layer: 'ui', status: 'next', text: 'task', file: '133.md',
  deps: [], rank: 100,
};

const groupsWithTask: DisplayGroupsResponse = { ...emptyGroups, ready: [task133] };
const loadedState: LedgerState = {
  loadState: { tag: 'loaded', groups: groupsWithTask },
  selectedIndex: 0,
  showAll: false,
  lastUpdated: null,
  detailTaskId: null,
  planDoc: { tag: 'idle' },
  filters: { ...initialFilters },
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

  it('selectUp decrements selectedIndex (min 0)', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, { ...loadedState, selectedIndex: 1 });
    store.send({ tag: 'selectUp' }, (s) => { s.selectedIndex = 0; });
    store.assertDrained();

    const store2 = new TestStore(ledgerReducer, mockLedgerEnv, { ...loadedState, selectedIndex: 0 });
    store2.send({ tag: 'selectUp' }, (s) => { s.selectedIndex = 0; });
    store2.assertDrained();
  });

  it('selectDown increments selectedIndex (clamped to rowCount-1)', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, { ...loadedState, selectedIndex: 0 });
    store.send({ tag: 'selectDown', rowCount: 5 }, (s) => { s.selectedIndex = 1; });
    store.assertDrained();

    const store2 = new TestStore(ledgerReducer, mockLedgerEnv, { ...loadedState, selectedIndex: 4 });
    store2.send({ tag: 'selectDown', rowCount: 5 }, (s) => { s.selectedIndex = 4; });
    store2.assertDrained();
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

  it('setTextFilter sets text and resets selectedIndex to 0', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, { ...loadedState, selectedIndex: 3, filters: { ...initialFilters } });
    store.send({ tag: 'setTextFilter', text: 'hello' }, (s) => {
      s.filters.text = 'hello';
      s.selectedIndex = 0;
    });
    store.assertDrained();
  });

  it('setWaveFilter sets wave and resets selectedIndex to 0', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, { ...loadedState, selectedIndex: 2, filters: { ...initialFilters } });
    store.send({ tag: 'setWaveFilter', wave: 'w5' }, (s) => {
      s.filters.wave = 'w5';
      s.selectedIndex = 0;
    });
    store.assertDrained();
  });

  it('setStatusFilter sets status and resets selectedIndex to 0', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, { ...loadedState, selectedIndex: 1, filters: { ...initialFilters } });
    store.send({ tag: 'setStatusFilter', status: 'next' }, (s) => {
      s.filters.status = 'next';
      s.selectedIndex = 0;
    });
    store.assertDrained();
  });

  it('setKindFilter sets kind and resets selectedIndex to 0', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, { ...loadedState, selectedIndex: 4, filters: { ...initialFilters } });
    store.send({ tag: 'setKindFilter', kind: 'spike' }, (s) => {
      s.filters.kind = 'spike';
      s.selectedIndex = 0;
    });
    store.assertDrained();
  });

  it('clearFilters restores initialFilters and resets selectedIndex to 0', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, {
      ...loadedState,
      selectedIndex: 2,
      filters: { text: 'foo', wave: 'w3', status: 'done', kind: 'spike' },
    });
    store.send({ tag: 'clearFilters' }, (s) => {
      s.filters = { ...initialFilters };
      s.selectedIndex = 0;
    });
    store.assertDrained();
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
      { key: 'j',          expected: { tag: 'selectDown', rowCount: 1 } },
      { key: 'k',          expected: { tag: 'selectUp' } },
      { key: 'a',          expected: { tag: 'toggleShowAll' } },
      { key: 'r',          expected: { tag: 'refresh' } },
      { key: 'Escape',     expected: { tag: 'closeDetail' } },
      { key: 'Unhandled',  expected: null },
    ] as const)('keydown handler: $key → $expected', ({ key, expected }) => {
      const sub = ledgerSubscriptions(loadedState)[0];
      if (sub?.tag !== 'keydown') throw new Error('expected keydown sub');
      expect(sub.handler(new KeyboardEvent('keydown', { key }))).toEqual(expected);
    });

    it('n toggles next status on the selected task', () => {
      const sub = ledgerSubscriptions({ ...loadedState, selectedIndex: 0 })[0];
      if (sub?.tag !== 'keydown') throw new Error('expected keydown sub');
      expect(sub.handler(new KeyboardEvent('keydown', { key: 'n' }))).toEqual({
        tag: 'setStatus', taskId: task133.id, status: 'todo',
      });
    });
  });

});

// groupsWithTasks is exported for component tests that need tasks in view
export { groupsWithTasks };
