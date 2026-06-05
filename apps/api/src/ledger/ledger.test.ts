import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLedger, computeDisplayGroups } from './reader.js';
import { updateTask } from './writer.js';

const FIXTURE = [
  '{"type":"meta","version":"1.0","description":"test"}',
  '{"type":"epic","id":"e1","title":"Epic One"}',
  '{"type":"story","id":"s1","epic":"e1","layer":"core","title":"Story One"}',
  '{"type":"wave","id":"w1","name":"Wave One"}',
  '{"type":"task","kind":"task","id":1,"epic":"e1","story":"s1","wave":"w1","layer":"core","status":"done","text":"Task one","file":"1.md","deps":[]}',
  '{"type":"task","kind":"task","id":2,"epic":"e1","story":"s1","wave":"w1","layer":"core","status":"next","text":"Task two","file":"2.md","deps":[1]}',
  '{"type":"task","kind":"task","id":3,"epic":"e1","story":"s1","wave":"w1","layer":"core","status":"todo","text":"Task three","file":"3.md","deps":[1]}',
  '{"type":"task","kind":"task","id":4,"epic":"e1","story":"s1","wave":"w1","layer":"core","status":"todo","text":"Task four blocked","file":"4.md","deps":[99]}',
  '{"type":"task","kind":"task","id":5,"epic":"e1","story":"s1","wave":"w1","layer":"core","status":"canceled","text":"Task five","file":"5.md","deps":[]}',
].join('\n');

function tempLedger(content: string): string {
  const path = join(tmpdir(), `ledger-test-${String(Date.now())}.jsonl`);
  writeFileSync(path, content, 'utf-8');
  return path;
}

describe('parseLedger', () => {
  it('parses tasks and waves from a fixture file', () => {
    const { tasks, waves } = parseLedger(tempLedger(FIXTURE));
    expect(tasks).toHaveLength(5);
    expect(waves).toHaveLength(1);
    expect(waves[0]!.id).toBe('w1');
  });

  it('skips blank lines without error', () => {
    const { tasks } = parseLedger(tempLedger(FIXTURE + '\n\n'));
    expect(tasks).toHaveLength(5);
  });
});

describe('computeDisplayGroups', () => {
  it('partitions tasks into correct groups', () => {
    const { tasks, waves } = parseLedger(tempLedger(FIXTURE));
    const groups = computeDisplayGroups(tasks, waves);

    expect(groups.inProgress.map(t => t.id)).toEqual([2]);
    expect(groups.ready.map(t => t.id)).toEqual([3]);
    expect(groups.blocked.map(b => b.task.id)).toEqual([4]);
    expect(groups.blocked[0]?.pendingDeps).toEqual([99]);
    expect(groups.done.map(t => t.id)).toEqual([1]);
    expect(groups.canceled.map(t => t.id)).toEqual([5]);
  });

  it('treats canceled deps as satisfied', () => {
    const withCanceledDep = FIXTURE.replace(
      '"id":4,"epic":"e1","story":"s1","wave":"w1","layer":"core","status":"todo","text":"Task four blocked","file":"4.md","deps":[99]',
      '"id":4,"epic":"e1","story":"s1","wave":"w1","layer":"core","status":"todo","text":"Task four blocked","file":"4.md","deps":[5]',
    );
    const { tasks, waves } = parseLedger(tempLedger(withCanceledDep));
    const groups = computeDisplayGroups(tasks, waves);
    expect(groups.blocked).toHaveLength(0);
    expect(groups.ready.map(t => t.id)).toContain(4);
  });
});

const TASK2_DUP = '{"type":"task","kind":"task","id":2,"epic":"e1","story":"s1","wave":"w1","layer":"core","status":"done","text":"Task two","file":"2.md","deps":[1]}';

describe('parseLedger — deduplication', () => {
  it('keeps the last occurrence when a task id is duplicated', () => {
    const { tasks } = parseLedger(tempLedger(FIXTURE + '\n' + TASK2_DUP));
    expect(tasks).toHaveLength(5);
    expect(tasks.find(t => t.id === 2)?.status).toBe('done');
  });

  it('preserves first-occurrence order with duplicates present', () => {
    const { tasks } = parseLedger(tempLedger(FIXTURE + '\n' + TASK2_DUP));
    expect(tasks.map(t => t.id)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('updateTask', () => {
  it('rewrites a task status and leaves other lines unchanged', () => {
    const path = tempLedger(FIXTURE);
    updateTask(path, 2, { status: 'done' });
    const lines = readFileSync(path, 'utf-8').trim().split('\n');
    const updated = JSON.parse(lines.find(l => { try { return (JSON.parse(l) as Record<string, unknown>)['id'] === 2; } catch { return false; } })!) as Record<string, unknown>;
    expect(updated['status']).toBe('done');
    expect(updated['text']).toBe('Task two');
    const task1 = JSON.parse(lines.find(l => { try { const p = JSON.parse(l) as Record<string, unknown>; return p['type'] === 'task' && p['id'] === 1; } catch { return false; } })!) as Record<string, unknown>;
    expect(task1['status']).toBe('done');
  });

  it('removes all duplicate entries and writes exactly one canonical entry', () => {
    const task2Orig = '{"type":"task","kind":"task","id":2,"epic":"e1","story":"s1","wave":"w1","layer":"core","status":"next","text":"Task two","file":"2.md","deps":[1]}';
    const path = tempLedger(FIXTURE + '\n' + task2Orig);
    updateTask(path, 2, { status: 'done' });
    const lines = readFileSync(path, 'utf-8').split('\n').filter(l => {
      try { return (JSON.parse(l) as Record<string, unknown>)['id'] === 2; } catch { return false; }
    });
    expect(lines).toHaveLength(1);
    expect((JSON.parse(lines[0]!) as Record<string, unknown>)['status']).toBe('done');
  });

  it('throws when task id is not found', () => {
    const path = tempLedger(FIXTURE);
    expect(() => { updateTask(path, 999, { status: 'done' }); }).toThrow('Task 999 not found');
  });
});
