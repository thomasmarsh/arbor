import pg from 'pg';
import { parseProcessEnv } from '../env.js';

const createTestPool = () => {
  const { ARBO_PG_URL } = parseProcessEnv();
  return new pg.Pool({
    connectionString: ARBO_PG_URL,
    // single connection means all queries in a test share state predictably
    max: 1,
  });
};

export interface TestEnv {
  pool: pg.Pool;
}

export const makeTestEnv = (): TestEnv => ({
  pool: createTestPool(),
});
