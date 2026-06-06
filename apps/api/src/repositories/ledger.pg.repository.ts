import { Result } from '@arbor/common';
import { EpicEntry, StoryEntry, TaskEntry, WaveEntry } from '@arbor/app-common';
import type { Pool } from '../db/pg.js';
import {
  getAllEpics,
  getAllStories,
  getAllTasks,
  getAllWaves,
  getTaskById,
  updateTaskStatus,
  updateTaskRank,
  type IGetAllEpicsResult,
  type IGetAllStoriesResult,
  type IGetAllTasksResult,
  type IGetAllWavesResult,
} from './generated/ledger.queries.js';
import type { LedgerRepository, TaskStatus } from './ledger.repository.js';

const toTask = (row: IGetAllTasksResult): Result<TaskEntry, string> => {
  const parsed = TaskEntry.safeParse({
    ...row,
    type: 'task',
    deps: row.deps,
    size: row.size ?? undefined,  // DB null → Zod optional undefined
    rank: row.rank ?? undefined,
  });
  return parsed.success ? Result.ok(parsed.data) : Result.err('parse_error');
};

const toWave = (row: IGetAllWavesResult): Result<WaveEntry, string> => {
  const parsed = WaveEntry.safeParse({ ...row, type: 'wave' });
  return parsed.success ? Result.ok(parsed.data) : Result.err('parse_error');
};

const toEpic = (row: IGetAllEpicsResult): Result<EpicEntry, string> => {
  const parsed = EpicEntry.safeParse({ ...row, type: 'epic' });
  return parsed.success ? Result.ok(parsed.data) : Result.err('parse_error');
};

const toStory = (row: IGetAllStoriesResult): Result<StoryEntry, string> => {
  const parsed = StoryEntry.safeParse({ ...row, type: 'story' });
  return parsed.success ? Result.ok(parsed.data) : Result.err('parse_error');
};

export const pgLedgerRepository = (pool: Pool): LedgerRepository => ({
  getAllTasks: async () => {
    const rows = await getAllTasks.run(undefined, pool);
    return Result.combine(rows.map(toTask));
  },

  getAllWaves: async () => {
    const rows = await getAllWaves.run(undefined, pool);
    return Result.combine(rows.map(toWave));
  },

  getAllEpics: async () => {
    const rows = await getAllEpics.run(undefined, pool);
    return Result.combine(rows.map(toEpic));
  },

  getAllStories: async () => {
    const rows = await getAllStories.run(undefined, pool);
    return Result.combine(rows.map(toStory));
  },

  getTaskById: async (id) => {
    const rows = await getTaskById.run({ id }, pool);
    return rows[0] ? toTask(rows[0]) : Result.err('not_found' as const);
  },

  updateTaskStatus: async (id, status: TaskStatus) => {
    const rows = await updateTaskStatus.run({ id, status }, pool);
    return rows[0] ? toTask(rows[0]) : Result.err('not_found' as const);
  },

  updateTaskRank: async (id, rank) => {
    const rows = await updateTaskRank.run({ id, rank }, pool);
    return rows[0] ? toTask(rows[0]) : Result.err('not_found' as const);
  },
});
