import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TaskStatus, type TaskEntry, type WaveEntry } from '@arbor/app-common';
import type { WorkOrderResponse } from './router.js';

export interface DisplayGroups {
  inProgress: TaskEntry[];
  ready: TaskEntry[];
  blocked: { task: TaskEntry; pendingDeps: number[] }[];
  done: TaskEntry[];
  canceled: TaskEntry[];
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
    tasks
      .filter((t) => t.status === TaskStatus.enum.done || t.status === TaskStatus.enum.canceled)
      .map((t) => t.id),
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
      const pending = t.deps.filter((d) => !satisfiedIds.has(d));
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

export function computeWorkOrder(tasks: TaskEntry[], waves: WaveEntry[]): WorkOrderResponse {
  const waveOrder = new Map(waves.map((w, i) => [w.id, i]));
  const satisfiedIds = new Set(
    tasks
      .filter((t) => t.status === TaskStatus.enum.done || t.status === TaskStatus.enum.canceled)
      .map((t) => t.id),
  );

  const activeTasks = tasks.filter((t) => t.status !== TaskStatus.enum.canceled);

  const pendingDepsMap = new Map<number, number[]>();
  for (const t of activeTasks) {
    const pending = t.deps.filter((d) => !satisfiedIds.has(d));
    if (pending.length > 0) pendingDepsMap.set(t.id, pending);
  }

  // Build adjacency for non-satisfied deps only (for topo sort among active tasks)
  const inDegree = new Map<number, number>();
  const dependents = new Map<number, number[]>();
  const activeById = new Map(activeTasks.map((t) => [t.id, t]));

  for (const t of activeTasks) {
    // Only count deps on other active tasks (not done/canceled, not external refs)
    const pending = (pendingDepsMap.get(t.id) ?? []).filter((d) => activeById.has(d));
    inDegree.set(t.id, pending.length);
    for (const d of pending) {
      const arr = dependents.get(d) ?? [];
      arr.push(t.id);
      dependents.set(d, arr);
    }
  }

  function priority(t: TaskEntry): [number, number, number] {
    const w = waveOrder.get(t.wave) ?? 999;
    const isNotNext =
      t.status === TaskStatus.enum.next || t.status === TaskStatus.enum.in_progress ? 0 : 1;
    return [w, isNotNext, t.rank ?? t.id * 100];
  }

  function cmpPriority(a: TaskEntry, b: TaskEntry): number {
    const [aw, an, ar] = priority(a);
    const [bw, bn, br] = priority(b);
    return aw !== bw ? aw - bw : an !== bn ? an - bn : ar - br;
  }

  const ready = activeTasks.filter((t) => (inDegree.get(t.id) ?? 0) === 0);
  ready.sort(cmpPriority);

  const result: TaskEntry[] = [];
  while (ready.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const t = ready.shift()!;
    result.push(t);
    for (const depId of dependents.get(t.id) ?? []) {
      const dep = activeById.get(depId);
      if (!dep) continue;
      const deg = (inDegree.get(depId) ?? 1) - 1;
      inDegree.set(depId, deg);
      if (deg === 0) {
        const p = priority(dep);
        const insertAt = ready.findIndex((r) => {
          const rp = priority(r);
          return rp[0] > p[0] || (rp[0] === p[0] && (rp[1] > p[1] || (rp[1] === p[1] && rp[2] > p[2])));
        });
        if (insertAt === -1) ready.push(dep);
        else ready.splice(insertAt, 0, dep);
      }
    }
  }

  // Cycle survivors: append sorted by priority
  const emitted = new Set(result.map((t) => t.id));
  const cycled = activeTasks.filter((t) => !emitted.has(t.id));
  cycled.sort(cmpPriority);
  result.push(...cycled);

  const pendingDeps: Record<number, number[]> = {};
  for (const [id, deps] of pendingDepsMap) pendingDeps[id] = deps;

  return { tasks: result, pendingDeps };
}

function planDir(): string {
  if (process.env['PLAN_DIR']) return process.env['PLAN_DIR'];
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== '/') {
    if (existsSync(join(dir, 'plan'))) return join(dir, 'plan');
    dir = dirname(dir);
  }
  throw new Error('Could not locate plan/ directory — set PLAN_DIR');
}

export function readPlanDoc(file: string): string | null {
  const fullPath = join(planDir(), file);
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath, 'utf-8');
}
