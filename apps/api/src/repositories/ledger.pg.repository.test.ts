import { afterAll, afterEach, beforeAll } from 'vitest';
import { makeTestEnv } from '../testing/env.js';
import { pgLedgerRepository } from './ledger.pg.repository.js';
import { ledgerRepositorySpec } from './ledger.repository.contract.js';

const env = makeTestEnv();
const { pool } = env;

beforeAll(async () => {
  await pool.query('BEGIN');
  // Clear real seeded tasks so isolation tests start from empty (rolled back in afterAll)
  await pool.query('DELETE FROM ledger_tasks');
  await pool.query(`INSERT INTO ledger_epics  (id,    title)                  VALUES ('te1', 'Test Epic')`);
  await pool.query(`INSERT INTO ledger_stories (id,    epic_id, layer, title)  VALUES ('ts1', 'te1', 'test', 'Test Story')`);
  await pool.query(`INSERT INTO ledger_waves   (id,    name,         position) VALUES ('tw1', 'Test Wave', 0)`);
});

afterEach(async () => {
  await pool.query('DELETE FROM ledger_tasks');
});

afterAll(async () => {
  await pool.query('ROLLBACK');
  await pool.end();
});

ledgerRepositorySpec(() => pgLedgerRepository(pool), () => pool);
