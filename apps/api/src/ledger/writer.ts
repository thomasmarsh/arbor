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

  // Find all occurrences; use the last as the authoritative base (append-log semantics).
  let lastIdx = -1;
  let lastObj: Record<string, unknown> | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (isTaskLine(lines[i] ?? '', id)) {
      lastIdx = i;
      lastObj = JSON.parse(lines[i] ?? '') as Record<string, unknown>;
    }
  }
  if (lastIdx === -1 || lastObj === null) throw new Error(`Task ${String(id)} not found in ledger`);

  const updated = JSON.stringify({ ...lastObj, ...updates });
  // Remove all existing entries for this id; replace the last one with the updated entry.
  const newLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isTaskLine(lines[i] ?? '', id)) {
      if (i === lastIdx) newLines.push(updated);
      // all other occurrences are dropped (deduplication)
    } else {
      newLines.push(lines[i] ?? '');
    }
  }

  writeFileSync(path, newLines.join('\n'), 'utf-8');
}
