import type { DisplayGroupsResponse, TaskStatus } from '@arbor/api/ledger';
import { ledgerRouter } from '@arbor/api/ledger';
import { Effect, type Result } from '@arbor/common';
import { createClient } from '@arbor/router';

export interface LedgerEnv {
  fetchQueue: Effect<Result<DisplayGroupsResponse, string>>;
  setStatus: (id: number, status: TaskStatus) => Effect<undefined>;
  setRank: (id: number, rank: number) => Effect<undefined>;
  pollTick: Effect<void>;
}

// TODO: base URL should come from env config rather than being hardcoded here.
const client = createClient('http://localhost:3001', ledgerRouter);

export const liveLedgerEnv: LedgerEnv = {
  fetchQueue: Effect.tryCatch(
    async () => {
      const resp = await client.fetch({ tag: 'ledger-get-queue' });
      return resp.body;
    },
    (err) => (err instanceof Error ? err.message : 'fetch failed'),
  ),
  setStatus: (id, status) =>
    Effect.tryPromise(
      () => client.fetch({ tag: 'ledger-patch-task-status', id }, { body: { status } }),
      () => undefined,
      () => undefined,
    ),
  setRank: (id, rank) =>
    Effect.tryPromise(
      () => client.fetch({ tag: 'ledger-patch-task-rank', id }, { body: { rank } }),
      () => undefined,
      () => undefined,
    ),
  pollTick: Effect.sleep(5000),
};
