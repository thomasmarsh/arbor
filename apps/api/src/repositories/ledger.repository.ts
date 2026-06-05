import type { Result } from '@arbor/common';
import type { TaskEntry, TaskStatus, WaveEntry } from '@arbor/app-common';

export type { TaskEntry, TaskStatus, WaveEntry };

export interface LedgerRepository {
  getAllTasks:      ()                                    => Promise<Result<TaskEntry[], string>>;
  getAllWaves:      ()                                    => Promise<Result<WaveEntry[], string>>;
  getTaskById:     (id: number)                          => Promise<Result<TaskEntry, string>>;
  updateTaskStatus:(id: number, status: TaskStatus)      => Promise<Result<TaskEntry, string>>;
  updateTaskRank:  (id: number, rank: number)            => Promise<Result<TaskEntry, string>>;
}
