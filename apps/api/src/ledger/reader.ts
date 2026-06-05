import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LedgerRow, TaskStatus, type TaskEntry, type WaveEntry } from '@arbor/app-common';

export interface DisplayGroups {
  inProgress: TaskEntry[];
  ready: TaskEntry[];
  blocked: { task: TaskEntry; pendingDeps: number[] }[];
  done: TaskEntry[];
  canceled: TaskEntry[];
}

export function parseLedger(path: string): { tasks: TaskEntry[]; waves: WaveEntry[] } {
  const tasks: TaskEntry[] = [];
  const waves: WaveEntry[] = [];

  const lines = readFileSync(path, 'utf-8').split('\n');
  for (const line of lines) {
    const clean = line.trim();
    if (!clean) continue;
    const row = LedgerRow.parse(JSON.parse(clean));
    if (row.type === 'task') tasks.push(row);
    else if (row.type === 'wave') waves.push(row);
  }

  return { tasks, waves };
}

function sortKey(waveOrder: Map<string, number>, t: TaskEntry): [number, number] {
  return [waveOrder.get(t.wave) ?? 999, t.rank ?? t.id * 100];
}

function byKey(waveOrder: Map<string, number>) {
  return (a: TaskEntry, b: TaskEntry) => {
    const [aw, ar] = sortKey(waveOrder, a);
    const [bw, br] = sortKey(waveOrder, b);
    return aw !== bw ? aw - bw : ar - br;
  };
}

export function computeDisplayGroups(tasks: TaskEntry[], waves: WaveEntry[]): DisplayGroups {
  const waveOrder = new Map(waves.map((w, i) => [w.id, i]));
  const satisfiedIds = new Set(
    tasks.filter(t => t.status === TaskStatus.enum.done || t.status === TaskStatus.enum.canceled).map(t => t.id),
  );

  const inProgress: TaskEntry[] = [];
  const ready: TaskEntry[] = [];
  const blocked: { task: TaskEntry; pendingDeps: number[] }[] = [];
  const done: TaskEntry[] = [];
  const canceled: TaskEntry[] = [];

  for (const t of tasks) {
    if (t.status === TaskStatus.enum.in_progress || t.status === TaskStatus.enum.next) {
      inProgress.push(t);
    } else if (t.status === TaskStatus.enum.todo) {
      const pending = t.deps.filter(d => !satisfiedIds.has(d));
      if (pending.length > 0) blocked.push({ task: t, pendingDeps: pending });
      else ready.push(t);
    } else if (t.status === TaskStatus.enum.done) {
      done.push(t);
    } else {
      canceled.push(t);
    }
  }

  const cmp = byKey(waveOrder);
  inProgress.sort(cmp);
  ready.sort(cmp);
  blocked.sort((a, b) => cmp(a.task, b.task));
  done.sort(cmp);
  canceled.sort(cmp);

  return { inProgress, ready, blocked, done, canceled };
}

export function readPlanDoc(file: string, planDir: string): string | null {
  const fullPath = join(planDir, file);
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath, 'utf-8');
}
