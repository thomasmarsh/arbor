import { Effect, Result } from '@arbor/common';
import type { LedgerEnv } from './ledger.env.js';
import type { DisplayGroupsResponse } from './ledger.store.js';

export const emptyGroups: DisplayGroupsResponse = {
  inProgress: [],
  ready: [],
  blocked: [],
  done: [],
  canceled: [],
};

export const mockLedgerEnv: LedgerEnv = {
  fetchQueue: Effect.send(Result.ok(emptyGroups)),
};

export const mockLedgerEnvError: LedgerEnv = {
  fetchQueue: Effect.send(Result.err<DisplayGroupsResponse, string>('network error')),
};
