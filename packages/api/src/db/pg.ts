import pg from 'pg';

// pgtyped setup:
// 1. Add SQL queries to src/**/*.sql
// 2. Run: npx pgtyped -c pgtyped.config.json
// 3. Import generated typed query functions alongside the pool below.
// See: https://pgtyped.dev/docs/

const pool = new pg.Pool({
  connectionString: process.env['ARBO_PG_URL'],
  // Recommended for production:
  // max: 10,
  // idleTimeoutMillis: 30_000,
  // connectionTimeoutMillis: 2_000,
});

pool.on('error', (err) => {
  console.error('Unexpected pg pool error', err);
});

export { pool };
