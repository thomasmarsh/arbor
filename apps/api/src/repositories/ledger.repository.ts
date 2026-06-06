import type { Result } from '@arbor/common';
import type { EpicEntry, StoryEntry, TaskEntry, TaskStatus, WaveEntry } from '@arbor/app-common';

export type { EpicEntry, StoryEntry, TaskEntry, TaskStatus, WaveEntry };

export interface LedgerRepository {
  getAllTasks:      ()                                    => Promise<Result<TaskEntry[], string>>;
  getAllWaves:      ()                                    => Promise<Result<WaveEntry[], string>>;
  getAllEpics:      ()                                    => Promise<Result<EpicEntry[], string>>;
  getAllStories:    ()                                    => Promise<Result<StoryEntry[], string>>;
  getTaskById:     (id: number)                          => Promise<Result<TaskEntry, string>>;
  updateTaskStatus:(id: number, status: TaskStatus)      => Promise<Result<TaskEntry, string>>;
  updateTaskRank:  (id: number, rank: number)            => Promise<Result<TaskEntry, string>>;
}
