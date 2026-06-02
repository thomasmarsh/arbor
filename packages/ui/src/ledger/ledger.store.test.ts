import { describe, it } from 'vitest';
import { TestStore } from '@arbor/common';
import type { TaskEntry, DisplayGroupsResponse } from '@arbor/api/ledger';
import { ledgerReducer, initialLedgerState } from './ledger.store.js';
import type { LedgerState } from './ledger.store.js';
import { emptyGroups, mockLedgerEnv, mockLedgerEnvError, mockLedgerEnvWithMutations } from './ledger.env.mock.js';

const task133: TaskEntry = {
  type: 'task', kind: 'task', id: 133, epic: 'e4', story: 's14',
  wave: 'w28', layer: 'ui', status: 'next', text: 'task', file: '133.md',
  deps: [], rank: 100,
};

const groupsWithTask: DisplayGroupsResponse = { ...emptyGroups, ready: [task133] };
const loadedState: LedgerState = { loadState: { tag: 'loaded', groups: groupsWithTask }, selectedIndex: 0, showAll: false };

describe('ledgerReducer', () => {
  it('fetch transitions to loading then dispatches loaded on success', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, initialLedgerState);
    store
      .send({ tag: 'fetch' }, (s) => {
        s.loadState = { tag: 'loading' };
      })
      .receive({ tag: 'loaded', groups: emptyGroups }, (s) => {
        s.loadState = { tag: 'loaded', groups: emptyGroups };
      });
    store.assertDrained();
  });

  it('fetch transitions to loading then dispatches error on failure', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnvError, initialLedgerState);
    store
      .send({ tag: 'fetch' }, (s) => {
        s.loadState = { tag: 'loading' };
      })
      .receive({ tag: 'error', message: 'network error' }, (s) => {
        s.loadState = { tag: 'error', message: 'network error' };
      });
    store.assertDrained();
  });

  it('loaded action stores groups', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, initialLedgerState);
    store.send({ tag: 'loaded', groups: emptyGroups }, (s) => {
      s.loadState = { tag: 'loaded', groups: emptyGroups };
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
    const store = new TestStore(ledgerReducer, mockLedgerEnvWithMutations, loadedState);
    store
      .send({ tag: 'setStatus', taskId: 133, status: 'done' }, (s) => {
        if (s.loadState.tag === 'loaded') {
          const t = s.loadState.groups.ready.find((x) => x.id === 133);
          if (t) t.status = 'done';
        }
      })
      .receive({ tag: 'fetch' }, (s) => {
        s.loadState = { tag: 'loading' };
      })
      .receive({ tag: 'loaded', groups: emptyGroups }, (s) => {
        s.loadState = { tag: 'loaded', groups: emptyGroups };
      });
    store.assertDrained();
  });

  it('bump optimistically sets rank to min(waveRanks)-10 and triggers fetch', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnvWithMutations, loadedState);
    store
      .send({ tag: 'bump', taskId: 133, waveRanks: [100, 200, 300] }, (s) => {
        if (s.loadState.tag === 'loaded') {
          const t = s.loadState.groups.ready.find((x) => x.id === 133);
          if (t) t.rank = 90;
        }
      })
      .receive({ tag: 'fetch' }, (s) => {
        s.loadState = { tag: 'loading' };
      })
      .receive({ tag: 'loaded', groups: emptyGroups }, (s) => {
        s.loadState = { tag: 'loaded', groups: emptyGroups };
      });
    store.assertDrained();
  });

  it('defer optimistically sets rank to max(waveRanks)+10 and triggers fetch', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnvWithMutations, loadedState);
    store
      .send({ tag: 'defer', taskId: 133, waveRanks: [100, 200, 300] }, (s) => {
        if (s.loadState.tag === 'loaded') {
          const t = s.loadState.groups.ready.find((x) => x.id === 133);
          if (t) t.rank = 310;
        }
      })
      .receive({ tag: 'fetch' }, (s) => {
        s.loadState = { tag: 'loading' };
      })
      .receive({ tag: 'loaded', groups: emptyGroups }, (s) => {
        s.loadState = { tag: 'loaded', groups: emptyGroups };
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

  it('refresh transitions to loading then dispatches loaded on success', () => {
    const store = new TestStore(ledgerReducer, mockLedgerEnv, loadedState);
    store
      .send({ tag: 'refresh' }, (s) => { s.loadState = { tag: 'loading' }; })
      .receive({ tag: 'loaded', groups: emptyGroups }, (s) => {
        s.loadState = { tag: 'loaded', groups: emptyGroups };
      });
    store.assertDrained();
  });
});
