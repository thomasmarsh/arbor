import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Pool } from '../db/pg.js';
import type { LedgerRepository } from '../repositories/ledger.repository.js';

function ledgerJsonlPath(): string {
  if (process.env['PLAN_DIR']) return join(process.env['PLAN_DIR'], 'ledger.jsonl');
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== '/') {
    if (existsSync(join(dir, 'plan'))) return join(dir, 'plan', 'ledger.jsonl');
    dir = dirname(dir);
  }
  throw new Error('Could not locate plan/ — set PLAN_DIR');
}

async function writeJsonlSnapshot(pool: Pool): Promise<void> {
  const [epicsRes, storiesRes, wavesRes, tasksRes] = await Promise.all([
    pool.query<{ id: string; title: string }>(
      'SELECT id, title FROM ledger_epics ORDER BY id',
    ),
    pool.query<{ id: string; epic_id: string; layer: string; title: string }>(
      'SELECT id, epic_id, layer, title FROM ledger_stories ORDER BY epic_id, id',
    ),
    pool.query<{ id: string; name: string }>(
      'SELECT id, name FROM ledger_waves ORDER BY position',
    ),
    pool.query<{
      id: number; kind: string; epic: string; story: string; wave: string;
      layer: string; status: string; size: string | null; text: string;
      file: string; rank: number | null; deps: number[];
    }>(`
      SELECT t.id, t.kind, t.epic_id AS epic, t.story_id AS story, t.wave_id AS wave,
             t.layer, t.status, t.size, t.text, t.file, t.rank, t.deps
      FROM ledger_tasks t
      JOIN ledger_waves w ON t.wave_id = w.id
      ORDER BY w.position, COALESCE(t.rank, t.id * 100)
    `),
  ]);

  const lines: string[] = [];

  for (const r of epicsRes.rows)
    lines.push(JSON.stringify({ type: 'epic', id: r.id, title: r.title }));

  for (const r of storiesRes.rows)
    lines.push(JSON.stringify({ type: 'story', id: r.id, epic: r.epic_id, layer: r.layer, title: r.title }));

  for (const r of wavesRes.rows)
    lines.push(JSON.stringify({ type: 'wave', id: r.id, name: r.name }));

  for (const r of tasksRes.rows) {
    const obj: Record<string, unknown> = {
      type: 'task', id: r.id, epic: r.epic, story: r.story,
      kind: r.kind, wave: r.wave, layer: r.layer,
      status: r.status, text: r.text, file: r.file,
      deps: r.deps,
    };
    if (r.size !== null) obj['size'] = r.size;
    if (r.rank !== null) obj['rank'] = r.rank;
    lines.push(JSON.stringify(obj));
  }

  writeFileSync(ledgerJsonlPath(), lines.join('\n') + '\n', 'utf-8');
}

function fireSnapshot(pool: Pool): void {
  void writeJsonlSnapshot(pool).catch((err: unknown) => {
    console.error('[ledger] snapshot failed:', err instanceof Error ? err.message : err);
  });
}

/**
 * Wraps a LedgerRepository so that every successful mutation automatically
 * syncs plan/ledger.jsonl from the DB. Fire-and-forget — does not block the response.
 */
export function withAutoSnapshot(repo: LedgerRepository, pool: Pool): LedgerRepository {
  return {
    getAllEpics:   repo.getAllEpics,
    getAllStories: repo.getAllStories,
    getAllTasks:   repo.getAllTasks,
    getAllWaves:   repo.getAllWaves,
    getTaskById:  repo.getTaskById,
    updateTaskStatus: async (id, status) => {
      const result = await repo.updateTaskStatus(id, status);
      if (result.isOk()) fireSnapshot(pool);
      return result;
    },
    updateTaskRank: async (id, rank) => {
      const result = await repo.updateTaskRank(id, rank);
      if (result.isOk()) fireSnapshot(pool);
      return result;
    },
  };
}
