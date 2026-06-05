import { createServer, respond } from '@arbor/router';
import { parseLedger, computeDisplayGroups, readPlanDoc } from './reader.js';
import { updateTask } from './writer.js';
import { ledgerPath, planDir } from './path.js';
import { ledgerRouter } from './router.js';

export { ledgerRouter };

/* eslint-disable @typescript-eslint/require-await */
export const ledgerServer = createServer(ledgerRouter, {
  'ledger-get-tasks': async (_ctx) => {
    const { tasks, waves } = parseLedger(ledgerPath());
    return respond(200, { tasks, waves });
  },
  'ledger-get-queue': async (_ctx) => {
    const { tasks, waves } = parseLedger(ledgerPath());
    return respond(200, computeDisplayGroups(tasks, waves));
  },
  'ledger-get-task': async (ctx) => {
    const { tasks } = parseLedger(ledgerPath());
    const task = tasks.find((t) => t.id === ctx.params.id);
    return task ? respond(200, task) : respond(404, { error: `Task ${String(ctx.params.id)} not found` });
  },
  'ledger-patch-task-status': async (ctx) => {
    updateTask(ledgerPath(), ctx.params.id, { status: ctx.body.status });
    const { tasks } = parseLedger(ledgerPath());
    const task = tasks.find((t) => t.id === ctx.params.id);
    return task ? respond(200, task) : respond(404, { error: `Task ${String(ctx.params.id)} not found` });
  },
  'ledger-patch-task-rank': async (ctx) => {
    updateTask(ledgerPath(), ctx.params.id, { rank: ctx.body.rank });
    const { tasks } = parseLedger(ledgerPath());
    const task = tasks.find((t) => t.id === ctx.params.id);
    return task ? respond(200, task) : respond(404, { error: `Task ${String(ctx.params.id)} not found` });
  },
  'ledger-get-task-plan': async (ctx) => {
    const { tasks } = parseLedger(ledgerPath());
    const task = tasks.find((t) => t.id === ctx.params.id);
    if (!task) return respond(404, { error: `Task ${String(ctx.params.id)} not found` });
    const content = readPlanDoc(task.file, planDir());
    return content !== null
      ? respond(200, { content })
      : respond(404, { error: `Plan doc not found for task ${String(ctx.params.id)}` });
  },
});
