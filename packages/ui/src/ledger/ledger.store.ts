import { type Reducer } from '@arbor/common';
import { type InferSingleSuccessBody } from '@arbor/router';
import type { LedgerRouter } from '@arbor/api/ledger';
import type { LedgerEnv } from './ledger.env.js';

// TODO: ergonomic pain — per-route body extraction drills through _ctxMap. A
// helper like `InferRouteBody<Router, Tag>` would make this a one-liner.
type QueueCtx = LedgerRouter['_ctxMap']['ledger-get-queue'];
export type DisplayGroupsResponse = InferSingleSuccessBody<QueueCtx['response']>;

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
