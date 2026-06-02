import type { Reducer } from '@arbor/common';
import type { DisplayGroupsResponse } from '@arbor/api/ledger';
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
  | { tag: 'error'; message: string };

export const initialLedgerState: LedgerState = {
  loadState: { tag: 'idle' },
  selectedIndex: 0,
};

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
  }
};
