import fs from 'fs/promises';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Functional core — pure functions, no side effects
// ---------------------------------------------------------------------------

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations/pg');

interface Migration {
  name: string;
  sql: string;
}

function pendingMigrations(all: Migration[], applied: Set<string>): Migration[] {
  return all.filter(({ name }) => !applied.has(name));
}

function isSqlFile(name: string): boolean {
  return name.endsWith('.sql');
}

// ---------------------------------------------------------------------------
// Imperative shell — all side effects isolated here
// ---------------------------------------------------------------------------

async function readMigrationFiles(dir: string): Promise<Migration[]> {
  const names = (await fs.readdir(dir)).filter(isSqlFile).sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      sql: await fs.readFile(path.join(dir, name), 'utf-8'),
    })),
  );
}

async function fetchApplied(client: pg.Client): Promise<Set<string>> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const { rows } = await client.query<{ name: string }>(
    `SELECT name FROM schema_migrations ORDER BY name`,
  );
  return new Set(rows.map((r) => r.name));
}

async function applyMigration(client: pg.Client, { name, sql }: Migration): Promise<void> {
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [name]);
    await client.query('COMMIT');
    console.log(`Applied:  ${name}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw new Error(`Migration ${name} failed (rolled back): ${String(err)}`);
  }
}

async function run(): Promise<void> {
  const connectionString = process.env['ARBOR_PG_URL'];
  if (!connectionString) throw new Error('ARBOR_PG_URL is not set');

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    // Gather all inputs first (functional core takes over from here)
    const [all, applied] = await Promise.all([
      readMigrationFiles(MIGRATIONS_DIR),
      fetchApplied(client),
    ]);

    const pending = pendingMigrations(all, applied);

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    console.log(`Applying ${String(pending.length)} migration(s)...`);

    for (const migration of pending) {
      console.log(`Applying: ${migration.name}`);
      await applyMigration(client, migration);
    }
  } finally {
    await client.end().catch(() => {
      /* empty */
    });
  }
}

try {
  await run();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
