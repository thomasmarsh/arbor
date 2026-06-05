import { createServer, respond } from '@arbor/router';
import type { Result } from '@arbor/common';
import type { TaskEntry, WaveEntry } from '@arbor/app-common';
import { computeDisplayGroups, readPlanDoc } from './reader.js';
import { ledgerRouter } from './router.js';
import type { LedgerRepository } from '../repositories/ledger.repository.js';

export { ledgerRouter };

function taskOr(result: Result<TaskEntry, string>, id: number) {
  if (result.isOk()) return respond(200, result.value);
  return result.error === 'not_found'
    ? respond(404, { error: `Task ${String(id)} not found` })
    : respond(500, { error: 'internal' });
}

async function getTasksAndWaves(
  repo: LedgerRepository,
): Promise<{ tasks: TaskEntry[]; waves: WaveEntry[] } | null> {
  const [t, w] = await Promise.all([repo.getAllTasks(), repo.getAllWaves()]);
  if (!t.isOk()) return null;
  if (!w.isOk()) return null;
  return { tasks: t.value, waves: w.value };
}

export const createLedgerServer = (repo: LedgerRepository) =>
  createServer(ledgerRouter, {
    'ledger-get-tasks': async (_ctx) => {
      const data = await getTasksAndWaves(repo);
      return data
        ? respond(200, { tasks: data.tasks, waves: data.waves })
        : respond(500, { error: 'internal' });
    },

    'ledger-get-queue': async (_ctx) => {
      const data = await getTasksAndWaves(repo);
      return data
        ? respond(200, computeDisplayGroups(data.tasks, data.waves))
        : respond(500, { error: 'internal' });
    },

    'ledger-get-task': async (ctx) =>
      taskOr(await repo.getTaskById(ctx.params.id), ctx.params.id),

    'ledger-patch-task-status': async (ctx) =>
      taskOr(await repo.updateTaskStatus(ctx.params.id, ctx.body.status), ctx.params.id),

    'ledger-patch-task-rank': async (ctx) =>
      taskOr(await repo.updateTaskRank(ctx.params.id, ctx.body.rank), ctx.params.id),

    'ledger-get-task-plan': async (ctx) => {
      const result = await repo.getTaskById(ctx.params.id);
      if (!result.isOk())
        return respond(404, { error: `Task ${String(ctx.params.id)} not found` });
      const content = readPlanDoc(result.value.file);
      return content !== null
        ? respond(200, { content })
        : respond(404, { error: `Plan doc not found for task ${String(ctx.params.id)}` });
    },
  });
