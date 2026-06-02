import { describe, it } from 'vitest';
import { TestStore } from '@arbor/common';
import { ledgerReducer, initialLedgerState } from './ledger.store.js';
import { emptyGroups, mockLedgerEnv, mockLedgerEnvError } from './ledger.env.mock.js';

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
});
