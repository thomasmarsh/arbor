import fs from 'fs/promises';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations/pg');

const client = new pg.Client({ connectionString: process.env['ARBO_PG_URL'] });

await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`);

const { rows } = await client.query<{ name: string }>(
  `SELECT name FROM schema_migrations ORDER BY name`,
);
const applied = new Set(rows.map((r) => r.name));

const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

for (const file of files) {
  if (applied.has(file)) continue;
  console.log(`Applying migration: ${file}`);
  const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf-8');
  await client.query('BEGIN');
  await client.query(sql);
  await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
  await client.query('COMMIT');
  console.log(`Applied: ${file}`);
}

await client.end();
