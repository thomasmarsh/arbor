import type pg from 'pg';
import { z } from 'zod';
import { pgUsersRepository } from './repositories/users.pg.repository.js';
import type { UserRepository } from './repositories/users.repository.js';
import { pgLedgerRepository } from './repositories/ledger.pg.repository.js';
import type { LedgerRepository } from './repositories/ledger.repository.js';
import { withAutoSnapshot } from './ledger/snapshot.js';

const ApiProcessEnvSchema = z.object({
  API_PORT: z.coerce.number().default(3001),
  ARBOR_PG_URL: z.url(),
});

type ApiProcessEnv = z.infer<typeof ApiProcessEnvSchema>;

export function parseProcessEnv(): ApiProcessEnv {
  const result = ApiProcessEnvSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid API environment variables:');
    console.error(z.flattenError(result.error).fieldErrors);
    process.exit(-1);
  }
  return result.data;
}

export interface ApiEnv {
  config: ApiProcessEnv;
  db: {
    users: UserRepository;
    ledger: LedgerRepository;
  };
}

export const liveEnv = (pool: pg.Pool): ApiEnv => ({
  config: parseProcessEnv(),
  db: {
    users: pgUsersRepository(pool),
    ledger: withAutoSnapshot(pgLedgerRepository(pool), pool),
  },
});
