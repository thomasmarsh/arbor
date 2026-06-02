import { readFileSync, writeFileSync } from 'node:fs';
import type { TaskEntry } from '@arbor/app-common';

function isTaskLine(line: string, id: number): boolean {
  const clean = line.trim();
  if (!clean) return false;
  try {
    const obj = JSON.parse(clean) as Record<string, unknown>;
    return obj['type'] === 'task' && obj['id'] === id;
  } catch {
    return false;
  }
}

export function updateTask(
  path: string,
  id: number,
  updates: Partial<Pick<TaskEntry, 'status' | 'rank'>>,
): void {
  const lines = readFileSync(path, 'utf-8').split('\n');

  const idx = lines.findIndex(line => isTaskLine(line, id));
  if (idx === -1) throw new Error(`Task ${String(id)} not found in ledger`);

  const obj = JSON.parse(lines[idx] ?? '') as Record<string, unknown>;
  const newLines = lines.slice();
  newLines[idx] = JSON.stringify({ ...obj, ...updates });

  writeFileSync(path, newLines.join('\n'), 'utf-8');
}
