import { Effect, Result } from '@arbor/common';
import { createClient } from '@arbor/router';
import { ledgerRouter } from '@arbor/api/ledger';
import type { DisplayGroupsResponse } from './ledger.store.js';

export interface LedgerEnv {
  fetchQueue: Effect<Result<DisplayGroupsResponse, string>>;
}

// TODO: base URL should come from env config rather than being hardcoded here.
export const liveLedgerEnv: LedgerEnv = {
  fetchQueue: Effect.tryCatch(
    async () => {
      const client = createClient('http://localhost:3001', ledgerRouter);
      const resp = await client.fetch({ tag: 'ledger-get-queue' });
      if (resp.status === 200) return resp.body;
      throw new Error('fetch failed');
    },
    (err) => (err instanceof Error ? err.message : 'fetch failed'),
  ),
};
