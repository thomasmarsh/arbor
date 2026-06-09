import { describe, it, expect } from 'vitest';
import { computeDisplayGroups, computeWorkOrder } from './reader.js';
import type { TaskEntry, WaveEntry } from '@arbor/app-common';

const wave: WaveEntry = { type: 'wave', id: 'w1', name: 'Wave One' };
const waves: WaveEntry[] = [wave];

function task(overrides: Partial<TaskEntry> & Pick<TaskEntry, 'id' | 'status'>): TaskEntry {
  return {
    type: 'task',
    kind: 'task',
    epic: 'e1',
    story: 's1',
    wave: 'w1',
    layer: 'core',
    text: `Task ${String(overrides.id)}`,
    file: `${String(overrides.id)}.md`,
    deps: [],
    ...overrides,
  };
}

const done1    = task({ id: 1, status: 'done' });
const active2  = task({ id: 2, status: 'next', deps: [1] });
const ready3   = task({ id: 3, status: 'todo', deps: [1] });
const blocked4 = task({ id: 4, status: 'todo', deps: [99] });
const cancel5  = task({ id: 5, status: 'canceled' });

const allTasks = [done1, active2, ready3, blocked4, cancel5];

describe('computeDisplayGroups', () => {
  it('partitions tasks into correct groups', () => {
    const groups = computeDisplayGroups(allTasks, waves);

    expect(groups.inProgress.map((t) => t.id)).toEqual([2]);
    expect(groups.ready.map((t) => t.id)).toEqual([3]);
    expect(groups.blocked.map((b) => b.task.id)).toEqual([4]);
    expect(groups.blocked[0]?.pendingDeps).toEqual([99]);
    expect(groups.done.map((t) => t.id)).toEqual([1]);
    expect(groups.canceled.map((t) => t.id)).toEqual([5]);
  });

  it('treats canceled deps as satisfied', () => {
    const tasks = [done1, active2, ready3, task({ id: 4, status: 'todo', deps: [5] }), cancel5];
    const groups = computeDisplayGroups(tasks, waves);
    expect(groups.blocked).toHaveLength(0);
    expect(groups.ready.map((t) => t.id)).toContain(4);
  });

  it('returns empty groups when task list is empty', () => {
    const groups = computeDisplayGroups([], waves);
    expect(groups.inProgress).toHaveLength(0);
    expect(groups.ready).toHaveLength(0);
    expect(groups.blocked).toHaveLength(0);
    expect(groups.done).toHaveLength(0);
    expect(groups.canceled).toHaveLength(0);
  });

  it('sorts by wave order then rank within a group', () => {
    const w2: WaveEntry = { type: 'wave', id: 'w2', name: 'Wave Two' };
    const tasks = [
      task({ id: 10, status: 'todo', wave: 'w2' }),
      task({ id: 11, status: 'todo', wave: 'w1', rank: 200 }),
      task({ id: 12, status: 'todo', wave: 'w1', rank: 100 }),
    ];
    const groups = computeDisplayGroups(tasks, [wave, w2]);
    expect(groups.ready.map((t) => t.id)).toEqual([12, 11, 10]);
  });
});

describe('computeWorkOrder', () => {
  const w2: WaveEntry = { type: 'wave', id: 'w2', name: 'Wave Two' };

  it('excludes canceled tasks', () => {
    const { tasks: ordered } = computeWorkOrder([done1, active2, ready3, blocked4, cancel5], waves);
    expect(ordered.every((t) => t.status !== 'canceled')).toBe(true);
  });

  it('annotates blocked tasks in pendingDeps', () => {
    const { pendingDeps } = computeWorkOrder([done1, active2, ready3, blocked4, cancel5], waves);
    expect(pendingDeps[4]).toEqual([99]);
    expect(pendingDeps[2]).toBeUndefined();
  });

  it('does not infinite-loop on a dep cycle', () => {
    const cycleA = task({ id: 10, status: 'todo', deps: [11] });
    const cycleB = task({ id: 11, status: 'todo', deps: [10] });
    const { tasks: ordered } = computeWorkOrder([cycleA, cycleB], waves);
    expect(ordered).toHaveLength(2);
  });

  it('floats next/in_progress tasks to the top of their wave', () => {
    const tasks = [
      task({ id: 1, status: 'todo',  wave: 'w1', rank: 100 }),
      task({ id: 2, status: 'next',  wave: 'w1', rank: 200 }),
      task({ id: 3, status: 'todo',  wave: 'w1', rank: 50  }),
    ];
    const { tasks: ordered } = computeWorkOrder(tasks, waves);
    expect(ordered[0]?.id).toBe(2);
  });

  it('respects wave order before rank', () => {
    const tasks = [
      task({ id: 1, status: 'todo', wave: 'w2', rank: 10 }),
      task({ id: 2, status: 'todo', wave: 'w1', rank: 999 }),
    ];
    const { tasks: ordered } = computeWorkOrder(tasks, [wave, w2]);
    expect(ordered.map((t) => t.id)).toEqual([2, 1]);
  });

  it('respects topological order within a wave', () => {
    const t3 = task({ id: 3, status: 'todo', rank: 100 });
    const t2 = task({ id: 2, status: 'todo', rank: 50, deps: [3] });
    const { tasks: ordered } = computeWorkOrder([t3, t2], waves);
    const idx2 = ordered.findIndex((t) => t.id === 2);
    const idx3 = ordered.findIndex((t) => t.id === 3);
    expect(idx3).toBeLessThan(idx2);
  });
});
