import { beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type { LedgerRepository } from './ledger.repository.js';

const FIXTURE_TASK = {
  id: 9001,
  kind: 'task',
  epic_id: 'te1',
  story_id: 'ts1',
  wave_id: 'tw1',
  layer: 'test',
  status: 'todo',
  text: 'Contract test task',
  file: 'test.md',
  deps: [],
} as const;

const insertFixtureTask = (pool: pg.Pool) =>
  pool.query(
    `INSERT INTO ledger_tasks (id, kind, epic_id, story_id, wave_id, layer, status, text, file, deps)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (id) DO NOTHING`,
    [
      FIXTURE_TASK.id, FIXTURE_TASK.kind, FIXTURE_TASK.epic_id, FIXTURE_TASK.story_id,
      FIXTURE_TASK.wave_id, FIXTURE_TASK.layer, FIXTURE_TASK.status,
      FIXTURE_TASK.text, FIXTURE_TASK.file, FIXTURE_TASK.deps,
    ],
  );

export const ledgerRepositorySpec = (
  getRepo: () => LedgerRepository,
  getPool: () => pg.Pool,
) => {
  describe('LedgerRepository contract', () => {
    let repo: LedgerRepository;

    beforeEach(() => {
      repo = getRepo();
    });

    it('getAllTasks returns an empty array when no tasks exist', async () => {
      const result = await repo.getAllTasks();
      expect(result.isOk()).toBe(true);
      result.fold(
        (tasks) => { expect(tasks).toEqual([]); },
        () => { throw new Error('expected ok'); },
      );
    });

    it('getAllWaves returns the seeded wave', async () => {
      const result = await repo.getAllWaves();
      expect(result.isOk()).toBe(true);
      result.fold(
        (waves) => {
          const wave = waves.find((w) => w.id === 'tw1');
          expect(wave).toBeDefined();
          expect(wave?.name).toBe('Test Wave');
        },
        () => { throw new Error('expected ok'); },
      );
    });

    it('getTaskById returns not_found for an unknown id', async () => {
      const result = await repo.getTaskById(9999);
      expect(result.isErr()).toBe(true);
      expect(result.error).toBe('not_found');
    });

    it('getAllTasks returns a task after insertion', async () => {
      await insertFixtureTask(getPool());
      const result = await repo.getAllTasks();
      result.fold(
        (tasks) => {
          const task = tasks.find((t) => t.id === FIXTURE_TASK.id);
          expect(task).toBeDefined();
          expect(task?.text).toBe(FIXTURE_TASK.text);
          expect(task?.status).toBe(FIXTURE_TASK.status);
          expect(task?.type).toBe('task');
        },
        () => { throw new Error('expected ok'); },
      );
    });

    it('getTaskById returns the task by id', async () => {
      await insertFixtureTask(getPool());
      const result = await repo.getTaskById(FIXTURE_TASK.id);
      result.fold(
        (task) => {
          expect(task.id).toBe(FIXTURE_TASK.id);
          expect(task.wave).toBe('tw1');
          expect(task.epic).toBe('te1');
          expect(task.story).toBe('ts1');
        },
        () => { throw new Error('expected ok'); },
      );
    });

    it('updateTaskStatus persists the new status', async () => {
      await insertFixtureTask(getPool());
      const result = await repo.updateTaskStatus(FIXTURE_TASK.id, 'done');
      result.fold(
        (task) => { expect(task.status).toBe('done'); },
        () => { throw new Error('expected ok'); },
      );
      const verify = await repo.getTaskById(FIXTURE_TASK.id);
      verify.fold(
        (task) => { expect(task.status).toBe('done'); },
        () => { throw new Error('expected ok'); },
      );
    });

    it('updateTaskStatus returns not_found for an unknown id', async () => {
      const result = await repo.updateTaskStatus(9999, 'done');
      expect(result.isErr()).toBe(true);
      expect(result.error).toBe('not_found');
    });

    it('updateTaskRank persists the new rank', async () => {
      await insertFixtureTask(getPool());
      const result = await repo.updateTaskRank(FIXTURE_TASK.id, 42);
      result.fold(
        (task) => { expect(task.rank).toBe(42); },
        () => { throw new Error('expected ok'); },
      );
    });

    it('updateTaskRank returns not_found for an unknown id', async () => {
      const result = await repo.updateTaskRank(9999, 1);
      expect(result.isErr()).toBe(true);
      expect(result.error).toBe('not_found');
    });

    it('getAllEpics returns the seeded epic', async () => {
      const result = await repo.getAllEpics();
      expect(result.isOk()).toBe(true);
      result.fold(
        (epics) => {
          const epic = epics.find((e) => e.id === 'te1');
          expect(epic).toBeDefined();
          expect(epic?.title).toBe('Test Epic');
          expect(epic?.type).toBe('epic');
        },
        () => { throw new Error('expected ok'); },
      );
    });

    it('getAllStories returns the seeded story', async () => {
      const result = await repo.getAllStories();
      expect(result.isOk()).toBe(true);
      result.fold(
        (stories) => {
          const story = stories.find((s) => s.id === 'ts1');
          expect(story).toBeDefined();
          expect(story?.epic).toBe('te1');
          expect(story?.layer).toBe('test');
          expect(story?.title).toBe('Test Story');
          expect(story?.type).toBe('story');
        },
        () => { throw new Error('expected ok'); },
      );
    });
  });
};
