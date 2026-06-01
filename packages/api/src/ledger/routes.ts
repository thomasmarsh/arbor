import { z } from 'zod';
import { defineRoutes, httpRoute, createServer, respond } from '@arbor/router';
import { TaskEntry, WaveEntry } from './schemas.js';
import { parseLedger, computeDisplayGroups } from './reader.js';
import { ledgerPath } from './path.js';

const TasksResponse = z.object({
  tasks: z.array(TaskEntry),
  waves: z.array(WaveEntry),
});

const DisplayGroupsResponse = z.object({
  inProgress: z.array(TaskEntry),
  ready: z.array(TaskEntry),
  blocked: z.array(z.object({ task: TaskEntry, pendingDeps: z.array(z.number()) })),
  done: z.array(TaskEntry),
  canceled: z.array(TaskEntry),
});

const ErrorResponse = z.object({ error: z.string() });

const GetTasks = z.object({ tag: z.literal('ledger-get-tasks') });
const GetQueue = z.object({ tag: z.literal('ledger-get-queue') });
const GetTask  = z.object({ tag: z.literal('ledger-get-task'), id: z.coerce.number() });

export const ledgerRouter = defineRoutes([
  httpRoute(GetTasks, 'GET', 'api/ledger/tasks', {
    response: { 200: TasksResponse },
  }),
  httpRoute(GetQueue, 'GET', 'api/ledger/queue', {
    response: { 200: DisplayGroupsResponse },
  }),
  httpRoute(GetTask, 'GET', 'api/ledger/tasks/:id', {
    response: { 200: TaskEntry, 404: ErrorResponse },
  }),
]);

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
    return task ? respond(200, task) : respond(404, { error: `Task ${ctx.params.id} not found` });
  },
});
