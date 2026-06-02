import { afterAll, afterEach, beforeAll } from 'vitest';
import { makeTestEnv } from '../testing/env.js';
import { pgUsersRepository } from './users.pg.repository.js';
import { userRepositorySpec } from './users.repository.contract.js';

const env = makeTestEnv();

beforeAll(async () => {
  await env.pool.query('BEGIN');
});

// DELETE FROM users in afterEach rather than per-test transactions keeps tests
// isolated without nesting transaction complexity
afterEach(async () => {
  await env.pool.query('DELETE FROM users');
});

afterAll(async () => {
  await env.pool.query('ROLLBACK');
  await env.pool.end();
});

userRepositorySpec(() => pgUsersRepository(env.pool));
