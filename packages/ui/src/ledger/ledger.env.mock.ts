import { Effect, Result } from '@arbor/common';
import type { DisplayGroupsResponse } from '@arbor/api/ledger';
import type { LedgerEnv } from './ledger.env.js';

export const emptyGroups: DisplayGroupsResponse = {
  inProgress: [],
  ready: [],
  blocked: [],
  done: [],
  canceled: [],
};

const noopMutation = () => Effect.send(undefined);

export const mockLedgerEnv: LedgerEnv = {
  fetchQueue: Effect.send(Result.ok(emptyGroups)),
  setStatus: noopMutation,
  setRank: noopMutation,
};

export const mockLedgerEnvError: LedgerEnv = {
  fetchQueue: Effect.send(Result.err<DisplayGroupsResponse, string>('network error')),
  setStatus: noopMutation,
  setRank: noopMutation,
};

export const mockLedgerEnvWithMutations: LedgerEnv = {
  fetchQueue: Effect.send(Result.ok(emptyGroups)),
  setStatus: noopMutation,
  setRank: noopMutation,
};
