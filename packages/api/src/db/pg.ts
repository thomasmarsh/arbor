import pg from 'pg';

export const makePool = (connectionString: string) => {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
  });
  pool.on('error', (err) => {
    console.error('Unexpected pg pool error', err);
  });
  return pool;
};

export type Pool = ReturnType<typeof makePool>;
