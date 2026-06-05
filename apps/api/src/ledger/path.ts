import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

export function ledgerPath(): string {
  return process.env['ARBOR_LEDGER_PATH'] ?? join(repoRoot(), 'plan', 'ledger.jsonl');
}

export function planDir(): string {
  return process.env['PLAN_DIR'] ?? join(repoRoot(), 'plan');
}

function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== '/') {
    if (existsSync(join(dir, 'plan', 'ledger.jsonl'))) return dir;
    dir = dirname(dir);
  }
  throw new Error('Could not locate plan/ledger.jsonl — set ARBOR_LEDGER_PATH');
}
