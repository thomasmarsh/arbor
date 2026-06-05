import type { DisplayGroupsResponse, TaskStatus } from '@arbor/api/ledger';
import { ledgerRouter } from '@arbor/api/ledger';
import { Effect, type Result } from '@arbor/common';
import { createClient } from '@arbor/router';

export interface LedgerEnv {
  fetchQueue: Effect<Result<DisplayGroupsResponse, string>>;
  setStatus: (id: number, status: TaskStatus) => Effect<undefined>;
  setRank: (id: number, rank: number) => Effect<undefined>;
  pollTick: Effect<undefined>;
  fetchPlanDoc: (taskId: number) => Effect<Result<string, string>>;
}

// TODO: base URL should come from env config rather than being hardcoded here.
const client = createClient('http://localhost:3001', ledgerRouter);

export const liveLedgerEnv: LedgerEnv = {
  fetchQueue: Effect.tryCatch(
    () => client.fetchOk({ tag: 'ledger-get-queue' }),
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
  fetchPlanDoc: (taskId) =>
    Effect.tryCatch(
      async () => {
        const plan = await client.fetchOk({ tag: 'ledger-get-task-plan', id: taskId });
        return plan.content;
      },
      (err) => (err instanceof Error ? err.message : 'fetch plan failed'),
    ),
};
